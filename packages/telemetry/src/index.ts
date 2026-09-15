import type { Tier } from "@redrob/kernel";

export type WorkspaceId =
  | "recruiting"
  | "product"
  | "finance"
  | "engineering"
  | "design";

export type EngineId = "extract" | "compare" | "generate";

export type PlatformId = "darwin" | "win32" | "linux";

/**
 * Allowlisted telemetry payload (SPEC §10).
 * No free-text / document content fields are permitted.
 */
export interface DeskEvent {
  eventId: string;
  sessionId: string;
  appVersion: string;
  tier: Tier;
  tierDropped: boolean;
  platform: PlatformId;
  totalRamMb: number;
  cpuCores: number;
  hasGpu: boolean;
  workspaceId: WorkspaceId;
  engine: EngineId;
  schemaOrRubricId: string;
  itemCount: number;
  encodeMs: number;
  generateMs: number;
  totalMs: number;
  slowdownPct: number;
  fieldCount: number;
  belowThresholdCount: number;
  correctedCount: number;
  peakRssMb: number;
}

/** Explicit allowlist of DeskEvent keys — used for boundary rejection tests. */
export const DESK_EVENT_KEYS = [
  "eventId",
  "sessionId",
  "appVersion",
  "tier",
  "tierDropped",
  "platform",
  "totalRamMb",
  "cpuCores",
  "hasGpu",
  "workspaceId",
  "engine",
  "schemaOrRubricId",
  "itemCount",
  "encodeMs",
  "generateMs",
  "totalMs",
  "slowdownPct",
  "fieldCount",
  "belowThresholdCount",
  "correctedCount",
  "peakRssMb",
] as const satisfies ReadonlyArray<keyof DeskEvent>;

export type DeskEventKey = (typeof DESK_EVENT_KEYS)[number];

const ALLOWED = new Set<string>(DESK_EVENT_KEYS);

/**
 * String-typed allowlist fields. A unit test fails if a new string field is
 * added to DeskEvent without being listed here (and without review).
 */
export const ALLOWED_STRING_FIELDS = [
  "eventId",
  "sessionId",
  "appVersion",
  "tier",
  "platform",
  "workspaceId",
  "engine",
  "schemaOrRubricId",
] as const satisfies ReadonlyArray<DeskEventKey>;

export function assertAllowlistedEvent(payload: object): asserts payload is DeskEvent {
  const record = payload as Record<string, unknown>;
  for (const key of Object.keys(record)) {
    if (!ALLOWED.has(key)) {
      throw new Error(`telemetry field not on allowlist: ${key}`);
    }
  }
  for (const key of DESK_EVENT_KEYS) {
    if (!(key in record)) {
      throw new Error(`telemetry missing required field: ${key}`);
    }
  }
}

export { TelemetryRecorder, type TelemetryRecorderOptions } from "./recorder.js";
export { OtlpTransport, type OtlpTransportOptions } from "./otlp.js";
