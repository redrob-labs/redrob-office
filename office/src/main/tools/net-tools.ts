import { z } from "zod";
import type { RegisteredTool, ToolResult } from "./types.js";

const MAX_BODY_CHARS = 100_000;
const MAX_RESPONSE_CHARS = 20_000;

const BLOCKED_HOSTS = new Set(["localhost", "127.0.0.1", "0.0.0.0", "::1", "metadata.google.internal"]);

export function isPrivateHost(hostname: string): boolean {
  if (BLOCKED_HOSTS.has(hostname.toLowerCase())) return true;
  if (/^10\./.test(hostname)) return true;
  if (/^192\.168\./.test(hostname)) return true;
  if (/^172\.(1[6-9]|2\d|3[01])\./.test(hostname)) return true;
  if (/^169\.254\./.test(hostname)) return true;
  return false;
}

/**
 * The one tool that writes to something outside this machine. It exists so
 * "outbound" is a real, gateable capability rather than a comment: Approval
 * always covers it (I4).
 */
export const netHttpPostTool: RegisteredTool = {
  name: "net.httpPost",
  description:
    "POST a JSON or text body to an external HTTPS endpoint. Leaves this machine, so it always needs approval.",
  risk: "high",
  inputSchema: z.object({
    url: z.string().url().describe("Absolute https:// URL"),
    body: z.string().max(MAX_BODY_CHARS).describe("Request body"),
    contentType: z.string().optional().describe("Defaults to application/json"),
  }),
  async handler(input, ctx): Promise<ToolResult> {
    let parsed: URL;
    try {
      parsed = new URL(input.url);
    } catch {
      return { ok: false, summary: "Invalid URL", error: "Invalid URL" };
    }
    if (parsed.protocol !== "https:") {
      return {
        ok: false,
        summary: "Only https:// is allowed",
        error: "Only https:// is allowed",
      };
    }
    if (isPrivateHost(parsed.hostname)) {
      return {
        ok: false,
        summary: `Blocked host ${parsed.hostname}`,
        error: "Private / loopback hosts are blocked",
      };
    }
    const controller = new AbortController();
    const abortFromCtx = (): void => controller.abort();
    ctx.signal?.addEventListener("abort", abortFromCtx, { once: true });
    const timeout = setTimeout(() => controller.abort(), 20_000);
    try {
      const response = await fetch(parsed.toString(), {
        method: "POST",
        headers: { "content-type": input.contentType ?? "application/json" },
        body: input.body,
        signal: controller.signal,
      });
      const text = (await response.text()).slice(0, MAX_RESPONSE_CHARS);
      return {
        ok: response.ok,
        summary: `POST ${parsed.host}${parsed.pathname} → ${response.status}`,
        data: { status: response.status, body: text },
        ...(response.ok ? {} : { error: `HTTP ${response.status}` }),
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return { ok: false, summary: `POST failed: ${message}`, error: message };
    } finally {
      clearTimeout(timeout);
      ctx.signal?.removeEventListener("abort", abortFromCtx);
    }
  },
};
