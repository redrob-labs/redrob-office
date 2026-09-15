import { describe, expect, it } from "vitest";
import {
  ALLOWED_STRING_FIELDS,
  assertAllowlistedEvent,
  DESK_EVENT_KEYS,
  TelemetryRecorder,
  type DeskEvent,
} from "./index.js";

function sampleEvent(): DeskEvent {
  return {
    eventId: "evt_1",
    sessionId: "sess_1",
    appVersion: "0.0.1",
    tier: "T8",
    tierDropped: false,
    platform: "win32",
    totalRamMb: 16_000,
    cpuCores: 8,
    hasGpu: true,
    workspaceId: "recruiting",
    engine: "extract",
    schemaOrRubricId: "recruiting/resume",
    itemCount: 1,
    encodeMs: 10,
    generateMs: 20,
    totalMs: 30,
    slowdownPct: 0,
    fieldCount: 5,
    belowThresholdCount: 1,
    correctedCount: 0,
    peakRssMb: 512,
  };
}

describe("assertAllowlistedEvent", () => {
  it("accepts a complete allowlisted payload", () => {
    expect(() => assertAllowlistedEvent(sampleEvent())).not.toThrow();
  });

  it("rejects unknown keys at the boundary", () => {
    const bad = { ...sampleEvent(), fileName: "resume.pdf" };
    expect(() => assertAllowlistedEvent(bad)).toThrow(/not on allowlist/);
  });

  it("rejects missing required keys", () => {
    const { eventId: _removed, ...incomplete } = sampleEvent();
    expect(() => assertAllowlistedEvent(incomplete)).toThrow(/missing required field/);
  });
});

describe("DeskEvent string allowlist", () => {
  it("fails if DeskEvent gains a string field not on ALLOWED_STRING_FIELDS", () => {
    // Compile-time shape: every string-valued key must be listed.
    type StringKeys = {
      [K in keyof DeskEvent]-?: DeskEvent[K] extends string ? K : never;
    }[keyof DeskEvent];

    const stringKeys: StringKeys[] = [
      "eventId",
      "sessionId",
      "appVersion",
      "tier",
      "platform",
      "workspaceId",
      "engine",
      "schemaOrRubricId",
    ];

    for (const key of stringKeys) {
      expect(ALLOWED_STRING_FIELDS).toContain(key);
    }
    expect(ALLOWED_STRING_FIELDS.length).toBe(stringKeys.length);
  });

  it("keeps DESK_EVENT_KEYS aligned with DeskEvent", () => {
    const event = sampleEvent();
    expect(DESK_EVENT_KEYS.length).toBe(Object.keys(event).length);
    for (const key of DESK_EVENT_KEYS) {
      expect(key in event).toBe(true);
    }
  });
});

describe("TelemetryRecorder", () => {
  it("defaults to opted-in while retaining payloads", () => {
    const recorder = new TelemetryRecorder({ maxPayloads: 2 });
    expect(recorder.record(sampleEvent())).toBe(true);
    expect(recorder.getPayloads()).toEqual([sampleEvent()]);
  });

  it("rejects non-allowlisted payloads and retains only the last N", () => {
    const recorder = new TelemetryRecorder({ optedIn: true, maxPayloads: 2 });
    expect(() => recorder.record({ ...sampleEvent(), content: "private resume text" })).toThrow(/not on allowlist/);
    recorder.record({ ...sampleEvent(), eventId: "evt_1" });
    recorder.record({ ...sampleEvent(), eventId: "evt_2" });
    recorder.record({ ...sampleEvent(), eventId: "evt_3" });
    expect(recorder.getPayloads().map((event) => event.eventId)).toEqual(["evt_2", "evt_3"]);
  });
});
