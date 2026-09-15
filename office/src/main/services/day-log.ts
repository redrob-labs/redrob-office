import { mkdir, writeFile, readFile, readdir, rm, stat } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { desktopCapturer, screen } from "electron";
import {
  generateCloudChatWithFallback,
  prepareImageForModel,
  type CloudChatContentPart,
  type CloudChatMessage,
  type CloudProviderId,
  type LlmProviderSecrets,
} from "@redrob/kernel";
import { nowIso } from "../app-time.js";
import { captureDisplayPngNative } from "../desktop/capture.js";
import { notifyDesktop } from "./notify.js";
import { loadSetupState } from "./setup.js";
import {
  generateVisionChat,
  getVisionSidecarStatus,
  visionSidecarAssetsReady,
  type VisionChatImage,
} from "./vision/index.js";

export type DayLogVisionRoute = "local" | "cloud";

export type DayLogLocale = "en" | "ko";

export interface DayLogCapture {
  id: string;
  at: string;
  path: string;
  bytes: number;
}

export interface DayLogSession {
  id: string;
  startedAt: string;
  endedAt?: string;
  intervalMs: number;
  visionRoute: DayLogVisionRoute;
  status: "recording" | "stopped" | "summarizing" | "done" | "error";
  captures: DayLogCapture[];
  reportMarkdown?: string;
  error?: string;
  deleteCapturesAfterReport: boolean;
  /** Consecutive failed capture attempts while recording (DXGI / empty thumb). */
  captureFailures?: number;
  lastCaptureError?: string;
  /** An OS notification per capture, instead of the app asking to be looked at. */
  notifyOnCapture: boolean;
  locale: DayLogLocale;
}

export interface DayLogStartOptions {
  intervalMs?: number;
  visionRoute?: DayLogVisionRoute;
  deleteCapturesAfterReport?: boolean;
  /**
   * Session-scoped cloud consent. Required when visionRoute === "cloud".
   * Must not be persisted as a sticky preference — pass true only for this start.
   */
  cloudOptIn?: boolean;
  /** Defaults on: a recording that says nothing is a recording nobody trusts. */
  notifyOnCapture?: boolean;
  locale?: DayLogLocale;
}

const MIN_INTERVAL_MS = 60_000;
const DEFAULT_INTERVAL_MS = 5 * 60_000;
const MAX_SUMMARY_CAPTURES = 10;

const VISION_MODELS: Record<Exclude<CloudProviderId, never>, string> = {
  openai: "gpt-4o-mini",
  openrouter: "qwen/qwen2.5-vl-72b-instruct",
  anthropic: "claude-sonnet-4-20250514",
};

let active: DayLogSession | null = null;
let timer: ReturnType<typeof setInterval> | null = null;
let sessionsRoot = "";

export function configureDayLogRoot(userData: string): void {
  sessionsRoot = join(userData, "day-logs");
}

function sessionDir(sessionId: string): string {
  return join(sessionsRoot, sessionId);
}

function metaPath(sessionId: string): string {
  return join(sessionDir(sessionId), "session.json");
}

async function persist(session: DayLogSession): Promise<void> {
  await mkdir(sessionDir(session.id), { recursive: true });
  await writeFile(metaPath(session.id), `${JSON.stringify(session, null, 2)}\n`, "utf8");
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Keep aspect ratio; avoid maxing both axes (distorts + heavy DXGI readback). */
function thumbnailSizeForDisplay(display: Electron.Display): { width: number; height: number } {
  const scale = display.scaleFactor || 1;
  const fullW = Math.max(1, Math.round(display.size.width * scale));
  const fullH = Math.max(1, Math.round(display.size.height * scale));
  const maxEdge = 1280;
  const longest = Math.max(fullW, fullH);
  if (longest <= maxEdge) return { width: fullW, height: fullH };
  const ratio = maxEdge / longest;
  return {
    width: Math.max(1, Math.round(fullW * ratio)),
    height: Math.max(1, Math.round(fullH * ratio)),
  };
}

function pickScreenSource(
  sources: Electron.DesktopCapturerSource[],
  primary: Electron.Display,
): Electron.DesktopCapturerSource | undefined {
  const byDisplayId = sources.find((item) => item.display_id === String(primary.id));
  if (byDisplayId && !byDisplayId.thumbnail.isEmpty()) return byDisplayId;
  // Windows often leaves display_id empty — prefer a non-empty primary-sized thumb.
  const named = sources.find(
    (item) =>
      !item.thumbnail.isEmpty() &&
      /screen|display|entire/i.test(item.name) &&
      !/window/i.test(item.name),
  );
  if (named) return named;
  return sources.find((item) => !item.thumbnail.isEmpty()) ?? sources[0];
}

const CAPTURE_MAX_EDGE = 1280;

/**
 * A capture that leaves the desktop alone.
 *
 * Where the platform has a native path (Windows GDI today) we take it: it does
 * not go anywhere near Chromium's capture machinery, which is what pulls focus
 * onto this app every few minutes while the person is working in another one.
 * Null means there is no such path here and the caller falls back.
 */
function captureNativePng(): Buffer | null {
  try {
    const native = captureDisplayPngNative(
      screen.getPrimaryDisplay(),
      CAPTURE_MAX_EDGE,
    );
    return native?.png ?? null;
  } catch {
    return null;
  }
}

async function captureOnce(
  thumbnailSize: { width: number; height: number },
): Promise<{ png: Buffer } | { error: string }> {
  const primary = screen.getPrimaryDisplay();
  let sources: Electron.DesktopCapturerSource[];
  try {
    sources = await desktopCapturer.getSources({
      types: ["screen"],
      thumbnailSize,
    });
  } catch (err) {
    return { error: err instanceof Error ? err.message : String(err) };
  }
  if (sources.length === 0) return { error: "No screen sources" };
  const source = pickScreenSource(sources, primary);
  if (!source) return { error: "No screen source matched" };
  if (source.thumbnail.isEmpty()) {
    return { error: "Empty thumbnail (DXGI/WGC capture failed)" };
  }
  return { png: source.thumbnail.toPNG() };
}

async function capturePng(): Promise<{ png: Buffer } | { error: string }> {
  const native = captureNativePng();
  if (native) return { png: native };

  const primary = screen.getPrimaryDisplay();
  const sizes = [
    thumbnailSizeForDisplay(primary),
    { width: 960, height: 540 },
    { width: 640, height: 360 },
  ];
  let lastError = "capture failed";
  for (let attempt = 0; attempt < sizes.length; attempt += 1) {
    if (attempt > 0) await sleep(400 * attempt);
    const result = await captureOnce(sizes[attempt]!);
    if (!("error" in result)) return result;
    lastError = result.error;
  }
  return { error: lastError };
}

export function captureNoticeText(
  locale: DayLogLocale,
  count: number,
): { title: string; body: string } {
  return locale === "en"
    ? { title: "Day log", body: `Screen captured — ${count} so far.` }
    : { title: "일과 기록", body: `화면을 캡처했습니다 — 지금까지 ${count}장.` };
}

export function captureFailureNoticeText(
  locale: DayLogLocale,
  detail: string,
): { title: string; body: string } {
  return locale === "en"
    ? { title: "Day log", body: `Screen capture failed: ${detail}` }
    : { title: "일과 기록", body: `화면 캡처에 실패했습니다: ${detail}` };
}

async function takeScreenshot(session: DayLogSession): Promise<DayLogCapture | null> {
  const result = await capturePng();
  if (!("error" in result)) {
    const id = `cap-${randomUUID().slice(0, 12)}`;
    const filePath = join(sessionDir(session.id), `${id}.png`);
    await writeFile(filePath, result.png);
    const capture: DayLogCapture = {
      id,
      at: nowIso(),
      path: filePath,
      bytes: result.png.length,
    };
    session.captures.push(capture);
    session.captureFailures = 0;
    delete session.lastCaptureError;
    await persist(session);
    if (session.notifyOnCapture) {
      notifyDesktop(captureNoticeText(session.locale, session.captures.length));
    }
    return capture;
  }

  session.captureFailures = (session.captureFailures ?? 0) + 1;
  session.lastCaptureError = result.error;
  await persist(session);
  // Only the first miss of a streak — a broken display would notify forever.
  if (session.notifyOnCapture && session.captureFailures === 1) {
    notifyDesktop(captureFailureNoticeText(session.locale, result.error));
  }
  return null;
}

function clearTimer(): void {
  if (timer) {
    clearInterval(timer);
    timer = null;
  }
}

export function getActiveDayLogSession(): DayLogSession | null {
  return active ? structuredClone(active) : null;
}

export async function startDayLogSession(
  options: DayLogStartOptions = {},
): Promise<DayLogSession> {
  if (!sessionsRoot) throw new Error("Day log root is not configured");
  if (active?.status === "recording") {
    throw new Error("A day log session is already recording");
  }

  const intervalMs = Math.max(MIN_INTERVAL_MS, options.intervalMs ?? DEFAULT_INTERVAL_MS);
  const visionRoute: DayLogVisionRoute = options.visionRoute ?? "local";
  if (visionRoute === "cloud" && options.cloudOptIn !== true) {
    throw new Error(
      "ERR_DAYLOG_CLOUD_OPT_IN: Cloud vision is off by default. Opt in for this session before starting (screenshots are uploaded to the cloud provider).",
    );
  }
  const session: DayLogSession = {
    id: `daylog-${randomUUID().slice(0, 12)}`,
    startedAt: nowIso(),
    intervalMs,
    visionRoute,
    status: "recording",
    captures: [],
    deleteCapturesAfterReport: options.deleteCapturesAfterReport ?? true,
    notifyOnCapture: options.notifyOnCapture !== false,
    locale: options.locale === "en" ? "en" : "ko",
  };
  await mkdir(sessionDir(session.id), { recursive: true });
  active = session;
  await persist(session);

  const first = await takeScreenshot(session).catch((err) => {
    session.captureFailures = 1;
    session.lastCaptureError = err instanceof Error ? err.message : String(err);
    void persist(session);
    return null;
  });
  if (!first) {
    // Surface early so the panel isn't "recording" with zero frames forever.
    session.error = session.lastCaptureError
      ? `Screen capture failed: ${session.lastCaptureError}`
      : "Screen capture failed on start";
    await persist(session);
  }
  clearTimer();
  timer = setInterval(() => {
    if (!active || active.status !== "recording") return;
    void takeScreenshot(active).catch((err) => {
      if (!active) return;
      active.captureFailures = (active.captureFailures ?? 0) + 1;
      active.lastCaptureError = err instanceof Error ? err.message : String(err);
      void persist(active);
    });
  }, intervalMs);

  return structuredClone(session);
}

export async function stopDayLogSession(): Promise<DayLogSession> {
  if (!active || active.status !== "recording") {
    throw new Error("No active day log recording");
  }
  clearTimer();
  active.status = "stopped";
  active.endedAt = nowIso();
  await persist(active);
  return structuredClone(active);
}

function pickCapturesForSummary(captures: DayLogCapture[]): DayLogCapture[] {
  if (captures.length <= MAX_SUMMARY_CAPTURES) return captures;
  const out: DayLogCapture[] = [];
  const last = captures.length - 1;
  for (let i = 0; i < MAX_SUMMARY_CAPTURES; i += 1) {
    const index = Math.round((i * last) / (MAX_SUMMARY_CAPTURES - 1));
    const item = captures[index];
    if (item && !out.some((c) => c.id === item.id)) out.push(item);
  }
  return out;
}

function providerSecrets(
  providers: Record<string, { apiKey?: string; baseUrl?: string } | undefined>,
): LlmProviderSecrets {
  const out: LlmProviderSecrets = {};
  for (const id of ["openai", "openrouter", "anthropic"] as const) {
    const key = providers[id]?.apiKey?.trim();
    if (!key) continue;
    out[id] = {
      apiKey: key,
      ...(providers[id]?.baseUrl?.trim()
        ? { baseUrl: providers[id]!.baseUrl!.trim() }
        : {}),
    };
  }
  return out;
}

function pickCloudVisionProvider(secrets: LlmProviderSecrets): CloudProviderId {
  if (secrets.openrouter?.apiKey) return "openrouter";
  if (secrets.openai?.apiKey) return "openai";
  if (secrets.anthropic?.apiKey) return "anthropic";
  throw new Error(
    "ERR_DAYLOG_CLOUD: Add a Redrob API key from console.redrob.ai for cloud vision.",
  );
}

async function summarizeWithCloud(
  session: DayLogSession,
  picks: DayLogCapture[],
  userData: string,
): Promise<string> {
  const setup = await loadSetupState(userData);
  const secrets = providerSecrets(setup.llmProviders ?? {});
  const provider = pickCloudVisionProvider(secrets);

  const parts: CloudChatContentPart[] = [
    {
      type: "text",
      text: [
        "You are writing a daily work report from periodic desktop screenshots.",
        `Session start: ${session.startedAt}`,
        `Session end: ${session.endedAt ?? "(open)"}`,
        `Captures used: ${picks.length} of ${session.captures.length}`,
        "For each image, note likely apps/tasks. Then write a Korean markdown report with:",
        "1) 하루 요약 (5–8 sentences)",
        "2) 시간대별 타임라인",
        "3) 주요 산출물/집중 구간",
        "4) 내일 이어갈 일 (optional)",
        "Do not invent private content you cannot see. Prefer Korean.",
      ].join("\n"),
    },
  ];

  for (const capture of picks) {
    const raw = await readFile(capture.path);
    const bytes = await prepareImageForModel(raw);
    parts.push({ type: "text", text: `Screenshot at ${capture.at}:` });
    parts.push({
      type: "image_url",
      image_url: { url: `data:image/png;base64,${bytes.toString("base64")}` },
    });
  }

  const messages: CloudChatMessage[] = [{ role: "user", content: parts }];

  // Anthropic path still expects string content in our adapter — force OpenAI-compatible.
  const useProvider: CloudProviderId =
    provider === "anthropic" && secrets.openrouter?.apiKey
      ? "openrouter"
      : provider === "anthropic" && secrets.openai?.apiKey
        ? "openai"
        : provider === "anthropic"
          ? (() => {
              throw new Error(
                "ERR_DAYLOG_CLOUD: This route is not supported. Use your Redrob API key.",
              );
            })()
          : provider;

  const result = await generateCloudChatWithFallback({
    provider: useProvider,
    model: VISION_MODELS[useProvider],
    thinking: false,
    providers: secrets,
    messages,
    maxTokens: 2048,
    temperature: 0.3,
  });
  return result.text.trim();
}

async function summarizeWithLocal(
  session: DayLogSession,
  picks: DayLogCapture[],
): Promise<string> {
  // Temporary path: llama-server sidecar (mmproj). Text chat stays on node-llama-cpp.
  const sidecar = getVisionSidecarStatus();
  if (sidecar.disabled) {
    throw new Error(`ERR_DAYLOG_LOCAL_VISION: ${sidecar.disabledReason}`);
  }
  if (!(await visionSidecarAssetsReady())) {
    throw new Error(
      "ERR_DAYLOG_LOCAL_VISION: llama-server / tier-matched Qwen3.5 + matching mmproj not available",
    );
  }

  const timeline = picks
    .map((c, i) => `${i + 1}. ${c.at} (${Math.round(c.bytes / 1024)} KB)`)
    .join("\n");
  const prompt = [
    "아래 스크린샷들을 보고 하루 업무 보고서를 한국어 마크다운으로 작성하세요.",
    "섹션: 하루 요약 / 시간대별 타임라인 / 주요 산출물·집중 구간 / 내일 이어갈 일(optional).",
    "보이지 않는 개인정보는 지어내지 마세요.",
    `시작: ${session.startedAt}`,
    `종료: ${session.endedAt ?? ""}`,
    `전체 캡처: ${session.captures.length}장, 요약 샘플: ${picks.length}장`,
    "캡처 시각:",
    timeline,
  ].join("\n");

  const images: VisionChatImage[] = [];
  for (const capture of picks) {
    const bytes = await readFile(capture.path);
    images.push({ mimeType: "image/png", bytes });
  }

  const result = await generateVisionChat({
    prompt,
    images,
    maxTokens: 2048,
    temperature: 0.3,
    sidecar: {
      imageMaxTokens: 1024,
      // Up to 10 captures × 1024 image tokens + reply headroom.
      ctxSize: Math.max(16_384, picks.length * 1024 + 4096),
    },
  });
  return result.text.trim();
}

export async function finalizeDayLogSession(userData: string): Promise<DayLogSession> {
  if (!active) throw new Error("No day log session");
  if (active.status === "recording") {
    await stopDayLogSession();
  }
  if (active.status === "summarizing") throw new Error("Summary already running");

  const session = active;
  session.status = "summarizing";
  await persist(session);

  try {
    const picks = pickCapturesForSummary(session.captures);
    if (picks.length === 0) {
      throw new Error("No screenshots were captured");
    }
    const report =
      session.visionRoute === "cloud"
        ? await summarizeWithCloud(session, picks, userData)
        : await summarizeWithLocal(session, picks);
    session.reportMarkdown = report;
    session.status = "done";
    await persist(session);

    if (session.deleteCapturesAfterReport) {
      for (const capture of session.captures) {
        if (capture.path) await rm(capture.path, { force: true }).catch(() => undefined);
      }
      session.captures = session.captures.map((c) => ({ ...c, path: "", bytes: 0 }));
      await persist(session);
    }
  } catch (err) {
    session.status = "error";
    session.error = err instanceof Error ? err.message : String(err);
    await persist(session);
    throw err;
  }

  return structuredClone(session);
}

/** Sessions written before capture notices existed still have to load. */
function fromDisk(raw: string): DayLogSession {
  const parsed = JSON.parse(raw) as DayLogSession;
  return {
    ...parsed,
    notifyOnCapture: parsed.notifyOnCapture !== false,
    locale: parsed.locale === "en" ? "en" : "ko",
  };
}

export async function listDayLogSessions(): Promise<DayLogSession[]> {
  if (!sessionsRoot || !existsSync(sessionsRoot)) return [];
  const entries = await readdir(sessionsRoot, { withFileTypes: true });
  const out: DayLogSession[] = [];
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    try {
      const raw = await readFile(join(sessionsRoot, entry.name, "session.json"), "utf8");
      out.push(fromDisk(raw));
    } catch {
      /* skip */
    }
  }
  out.sort((a, b) => b.startedAt.localeCompare(a.startedAt));
  return out;
}

export async function getDayLogSession(id: string): Promise<DayLogSession | null> {
  try {
    const raw = await readFile(metaPath(id), "utf8");
    return fromDisk(raw);
  } catch {
    return null;
  }
}

export function normalizeDayLogIntervalMs(ms: number): number {
  return Math.max(MIN_INTERVAL_MS, ms);
}

export async function dayLogDiskUsage(sessionId: string): Promise<number> {
  const dir = sessionDir(sessionId);
  if (!existsSync(dir)) return 0;
  const files = await readdir(dir);
  let total = 0;
  for (const name of files) {
    try {
      total += (await stat(join(dir, name))).size;
    } catch {
      /* skip */
    }
  }
  return total;
}

/** Soft check used by UI — cloud keys or local vision sidecar assets. */
export async function dayLogCapabilityHint(userData: string): Promise<{
  cloudReady: boolean;
  localReady: boolean;
  /** Present when local vision is latched off (e.g. no CUDA). Stable ERR_VISION_* prefix. */
  localDisabledReason: string | null;
}> {
  const setup = await loadSetupState(userData);
  const secrets = providerSecrets(setup.llmProviders ?? {});
  const visionReady = await visionSidecarAssetsReady();
  const sidecar = getVisionSidecarStatus();
  return {
    cloudReady: Boolean(
      secrets.openrouter?.apiKey || secrets.openai?.apiKey || secrets.anthropic?.apiKey,
    ),
    // Local day-log summary needs CUDA GPU + temporary vision sidecar (no CPU fallback).
    localReady: visionReady,
    localDisabledReason: sidecar.disabled ? sidecar.disabledReason : null,
  };
}
