/**
 * TEMPORARY: OpenAI-compatible vision calls against the llama-server sidecar.
 * Do not retry empty / image-ignored responses — surface failure.
 */
import { prepareImageForModel } from "@redrob/kernel";
import {
  ensureVisionSidecar,
  visionSidecarAuthHeaders,
  type VisionSidecarOptions,
} from "./llama-vision-sidecar.js";

export type VisionChatImage = {
  mimeType: string;
  bytes: Buffer;
};

export type VisionChatTimings = {
  /** Image+text prefill (prompt_ms from llama-server). */
  promptMs: number;
  /** Decode (predicted_ms). */
  predictedMs: number;
  promptTokens: number;
  predictedTokens: number;
  promptTokensPerSecond: number;
  predictedTokensPerSecond: number;
};

export type VisionChatResult = {
  text: string;
  port: number;
  timings: VisionChatTimings | null;
  /** Wall time for the HTTP round-trip only (excludes sidecar boot). */
  wallMs: number;
  prepared: boolean;
};

type ChatMessageContent =
  | string
  | Array<
      | { type: "text"; text: string }
      | { type: "image_url"; image_url: { url: string } }
    >;

function stripThink(text: string): string {
  return text.replace(/<think>[\s\S]*?<\/think>/gi, "").trim();
}

function looksImageIgnored(text: string, hadImages: boolean): boolean {
  if (!hadImages) return false;
  const lower = text.toLowerCase();
  const cues = [
    "i can't see",
    "i cannot see",
    "can't view images",
    "cannot view images",
    "no image",
    "no images were provided",
    "you didn't provide an image",
    "you did not provide an image",
    "이미지를 볼 수 없",
    "이미지가 없",
    "이미지를 확인",
  ];
  return cues.some((c) => lower.includes(c));
}

function parseTimings(json: Record<string, unknown>): VisionChatTimings | null {
  const timings = json.timings;
  if (!timings || typeof timings !== "object") return null;
  const t = timings as Record<string, unknown>;
  const promptMs = typeof t.prompt_ms === "number" ? t.prompt_ms : NaN;
  const predictedMs = typeof t.predicted_ms === "number" ? t.predicted_ms : NaN;
  if (!Number.isFinite(promptMs) || !Number.isFinite(predictedMs)) return null;
  return {
    promptMs,
    predictedMs,
    promptTokens: typeof t.prompt_n === "number" ? t.prompt_n : 0,
    predictedTokens: typeof t.predicted_n === "number" ? t.predicted_n : 0,
    promptTokensPerSecond:
      typeof t.prompt_per_second === "number" ? t.prompt_per_second : 0,
    predictedTokensPerSecond:
      typeof t.predicted_per_second === "number" ? t.predicted_per_second : 0,
  };
}

/**
 * Vision-only chat. Text-only Desk traffic stays on node-llama-cpp.
 * Empty or image-ignored completions throw (no retry).
 *
 * Images pass through prepareImageForModel (trim + 224 short-side expand) unless
 * prepareImages=false (measurement only). Token ceiling is sidecar --image-max-tokens.
 */
export async function generateVisionChat(options: {
  prompt: string;
  images?: VisionChatImage[];
  maxTokens?: number;
  temperature?: number;
  /** Default true — Step 3 trim path. */
  prepareImages?: boolean;
  sidecar?: VisionSidecarOptions;
}): Promise<VisionChatResult> {
  const port = await ensureVisionSidecar(options.sidecar);
  const prepare = options.prepareImages !== false;
  const images = options.images ?? [];
  const preparedImages: VisionChatImage[] = [];
  for (const image of images) {
    const bytes = prepare ? await prepareImageForModel(image.bytes) : image.bytes;
    preparedImages.push({
      mimeType: prepare ? "image/png" : image.mimeType,
      bytes,
    });
  }

  const content: Exclude<ChatMessageContent, string> = [
    { type: "text", text: options.prompt },
  ];
  for (const image of preparedImages) {
    content.push({
      type: "image_url",
      image_url: {
        url: `data:${image.mimeType};base64,${image.bytes.toString("base64")}`,
      },
    });
  }

  const body = {
    model: "qwen35-vision-sidecar",
    messages: [{ role: "user", content }],
    max_tokens: options.maxTokens ?? 512,
    temperature: options.temperature ?? 0.2,
    stream: false,
  };

  const wallStarted = performance.now();
  const res = await fetch(`http://127.0.0.1:${port}/v1/chat/completions`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...visionSidecarAuthHeaders() },
    body: JSON.stringify(body),
  });
  const wallMs = Math.round(performance.now() - wallStarted);
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`ERR_VISION_SIDECAR: chat HTTP ${res.status} ${detail}`.trim());
  }

  const json = (await res.json()) as Record<string, unknown>;
  const choices = json.choices as
    | Array<{
        message?: {
          content?: string | null;
          reasoning_content?: string | null;
        };
      }>
    | undefined;
  const message = choices?.[0]?.message;
  const raw = message?.content ?? "";
  const text = stripThink(typeof raw === "string" ? raw : "");

  if (!text) {
    const reasoning =
      typeof message?.reasoning_content === "string" ? message.reasoning_content.trim() : "";
    // Do not fall back to reasoning_content as the answer — that hides a broken completion path.
    throw new Error(
      reasoning
        ? "ERR_VISION_SIDECAR: empty content (model spent budget on reasoning only; not retried)"
        : "ERR_VISION_SIDECAR: empty completion (vision failed; not retried)",
    );
  }
  if (looksImageIgnored(text, preparedImages.length > 0)) {
    throw new Error(
      `ERR_VISION_SIDECAR: completion ignored image input (not retried): ${text.slice(0, 240)}`,
    );
  }

  return {
    text,
    port,
    timings: parseTimings(json),
    wallMs,
    prepared: prepare,
  };
}
