import { mkdir, readFile, writeFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { join } from "node:path";
import { nowIso } from "../app-time.js";
import type { DeskEvent } from "@redrob/telemetry";
import type { DeviceProfile } from "../../shared/office-api.js";

export interface TelemetryStateFile {
  /** Consent to upload diagnostics once an endpoint exists. No upload happens today. */
  optedIn: boolean;
  updatedAt: string | null;
}

function defaultState(): TelemetryStateFile {
  // Opt-out: send by default until the user turns it off.
  return { optedIn: true, updatedAt: null };
}

export function telemetryStatePath(userData: string): string {
  return join(userData, "telemetry.json");
}

export async function loadTelemetryState(userData: string): Promise<TelemetryStateFile> {
  try {
    const raw = await readFile(telemetryStatePath(userData), "utf8");
    const parsed = JSON.parse(raw) as Partial<TelemetryStateFile>;
    return {
      optedIn: Boolean(parsed.optedIn),
      updatedAt: typeof parsed.updatedAt === "string" ? parsed.updatedAt : null,
    };
  } catch {
    return defaultState();
  }
}

export async function saveTelemetryOptIn(
  userData: string,
  optedIn: boolean,
): Promise<TelemetryStateFile> {
  const state: TelemetryStateFile = { optedIn, updatedAt: nowIso() };
  await mkdir(userData, { recursive: true });
  await writeFile(telemetryStatePath(userData), `${JSON.stringify(state, null, 2)}\n`, "utf8");
  return state;
}

export interface DeskEventInput {
  workspaceId: string;
  engine: DeskEvent["engine"];
  schemaOrRubricId: string;
  itemCount: number;
  totalMs: number;
  encodeMs?: number;
  generateMs?: number;
  fieldCount?: number;
  belowThresholdCount?: number;
  correctedCount?: number;
  tier?: string;
  tierDropped?: boolean;
}

export interface DeskEventContext {
  sessionId: string;
  appVersion: string;
  device: DeviceProfile | null;
}

function peakRssMb(): number {
  try {
    return Math.round(process.memoryUsage().rss / (1024 * 1024));
  } catch {
    return 0;
  }
}

/**
 * Fills the allowlisted DeskEvent shape (SPEC §10) from a call site that only
 * knows about its own operation. Every field is a count, a timing, or device
 * metadata — no document content can reach this payload.
 */
export function buildDeskEvent(input: DeskEventInput, context: DeskEventContext): DeskEvent {
  const device = context.device;
  return {
    eventId: randomUUID(),
    sessionId: context.sessionId,
    appVersion: context.appVersion,
    tier: (input.tier ?? device?.tier ?? "T4") as DeskEvent["tier"],
    tierDropped: input.tierDropped ?? false,
    platform: (device?.platform ?? process.platform) as DeskEvent["platform"],
    totalRamMb: device?.totalRamMb ?? 0,
    cpuCores: device?.cpuCores ?? 0,
    hasGpu: device?.gpu !== null && device?.gpu !== undefined,
    workspaceId: input.workspaceId as DeskEvent["workspaceId"],
    engine: input.engine,
    schemaOrRubricId: input.schemaOrRubricId,
    itemCount: input.itemCount,
    encodeMs: Math.round(input.encodeMs ?? 0),
    generateMs: Math.round(input.generateMs ?? 0),
    totalMs: Math.round(input.totalMs),
    slowdownPct: 0,
    fieldCount: input.fieldCount ?? 0,
    belowThresholdCount: input.belowThresholdCount ?? 0,
    correctedCount: input.correctedCount ?? 0,
    peakRssMb: peakRssMb(),
  };
}
