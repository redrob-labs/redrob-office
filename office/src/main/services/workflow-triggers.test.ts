import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { WorkflowDefinition } from "@redrob/registry";
import {
  armSchedules,
  dueTriggers,
  readTriggerState,
  tickTriggers,
  triggerPrompt,
  validateTrigger,
  writeTriggerState,
  type TriggerState,
} from "./workflow-triggers.js";

function flow(
  id: string,
  trigger?: WorkflowDefinition["trigger"],
): WorkflowDefinition {
  return {
    id,
    version: 1,
    title: id,
    workspaceId: "general",
    steps: [{ id: "step-1", engine: "process", action: "custom", title: "Do it" }],
    ...(trigger ? { trigger } : {}),
    updatedAt: "2026-08-17T00:00:00.000Z",
  };
}

describe("validateTrigger", () => {
  it("accepts no schedule and a manual one", () => {
    expect(validateTrigger(undefined).ok).toBe(true);
    expect(validateTrigger({ type: "manual" }).ok).toBe(true);
  });

  it("refuses a cron line it cannot keep", () => {
    const bad = validateTrigger({ type: "cron", cron: "@daily", enabled: true });
    expect(bad.ok).toBe(false);
    // The message has to say what a good line looks like; "invalid" sends the
    // person back to a field they already believe is right.
    expect(bad.ok === false && bad.reason).toContain("0 9 * * 1-5");
    expect(validateTrigger({ type: "cron", cron: "0 9 * * 1-5" }).ok).toBe(true);
  });

  it("refuses an interval that is not whole minutes", () => {
    expect(validateTrigger({ type: "interval", intervalMinutes: 0 }).ok).toBe(false);
    expect(validateTrigger({ type: "interval", intervalMinutes: 1.5 }).ok).toBe(false);
    expect(validateTrigger({ type: "interval", intervalMinutes: 5 }).ok).toBe(true);
  });

  it("says event triggers do not exist rather than accepting one", () => {
    expect(validateTrigger({ type: "event", enabled: true }).ok).toBe(false);
  });
});

describe("armSchedules", () => {
  it("arms a new schedule from now, not from the epoch", () => {
    const now = 1_700_000_000_000;
    const { state, changed } = armSchedules({
      flows: [flow("general/nightly", { type: "interval", intervalMinutes: 5, enabled: true })],
      state: {},
      now,
    });
    expect(changed).toBe(true);
    expect(state["general/nightly"]).toEqual({ armedAt: now });
  });

  it("arms a cron line from the next matching minute, not this one", () => {
    const now = new Date("2026-08-17T09:00:20").getTime();
    const { state } = armSchedules({
      flows: [flow("general/nine", { type: "cron", cron: "0 9 * * *", enabled: true })],
      state: {},
      now,
    });
    expect(state["general/nine"]).toEqual({
      armedAt: now,
      lastFiredMinute: Math.floor(now / 60_000),
    });
  });

  it("forgets a flow that lost its schedule", () => {
    const state: TriggerState = { "general/gone": { armedAt: 1, lastRunAt: 2 } };
    const next = armSchedules({ flows: [flow("general/gone")], state, now: 10 });
    expect(next.state["general/gone"]).toBeUndefined();
    expect(next.changed).toBe(true);
  });

  it("leaves an already armed schedule alone", () => {
    const state: TriggerState = { "general/x": { armedAt: 1, lastRunAt: 2 } };
    const next = armSchedules({
      flows: [flow("general/x", { type: "interval", intervalMinutes: 5, enabled: true })],
      state,
      now: 10,
    });
    expect(next.changed).toBe(false);
    expect(next.state["general/x"]).toEqual({ armedAt: 1, lastRunAt: 2 });
  });
});

describe("dueTriggers", () => {
  const minute = 60_000;

  it("waits a whole interval after arming before the first run", () => {
    const armedAt = 1_700_000_000_000;
    const flows = [
      flow("general/every-5", { type: "interval", intervalMinutes: 5, enabled: true }),
    ];
    const state: TriggerState = { "general/every-5": { armedAt } };
    expect(dueTriggers({ flows, state, now: armedAt + 4 * minute })).toEqual([]);
    expect(dueTriggers({ flows, state, now: armedAt + 5 * minute })).toHaveLength(1);
  });

  it("counts the next interval from the last run", () => {
    const armedAt = 1_700_000_000_000;
    const flows = [
      flow("general/every-5", { type: "interval", intervalMinutes: 5, enabled: true }),
    ];
    const state: TriggerState = {
      "general/every-5": { armedAt, lastRunAt: armedAt + 5 * minute },
    };
    expect(dueTriggers({ flows, state, now: armedAt + 9 * minute })).toEqual([]);
    expect(dueTriggers({ flows, state, now: armedAt + 10 * minute })).toHaveLength(1);
  });

  it("fires a cron line once for its minute, however many ticks land in it", () => {
    const flows = [flow("general/nine", { type: "cron", cron: "0 9 * * *", enabled: true })];
    const nine = new Date("2026-08-17T09:00:20").getTime();
    const state: TriggerState = { "general/nine": { armedAt: nine - minute } };
    const first = dueTriggers({ flows, state, now: nine });
    expect(first).toHaveLength(1);

    // The scheduler ticks more than once a minute; the second tick in the same
    // minute must not run the flow again.
    state["general/nine"] = { armedAt: nine - minute, lastFiredMinute: first[0]!.firedMinute };
    expect(dueTriggers({ flows, state, now: nine + 30_000 })).toEqual([]);
    // The next day is a different minute.
    expect(
      dueTriggers({ flows, state, now: new Date("2026-08-18T09:00:00").getTime() }),
    ).toHaveLength(1);
  });

  it("ignores a schedule that is off, unarmed, or unrunnable", () => {
    const now = new Date("2026-08-17T09:00:00").getTime();
    const state: TriggerState = { "general/x": { armedAt: now - 60 * minute } };
    expect(
      dueTriggers({
        flows: [flow("general/x", { type: "cron", cron: "0 9 * * *", enabled: false })],
        state,
        now,
      }),
    ).toEqual([]);
    expect(
      dueTriggers({
        flows: [flow("general/x", { type: "cron", cron: "not a cron", enabled: true })],
        state,
        now,
      }),
    ).toEqual([]);
    expect(
      dueTriggers({
        flows: [flow("general/y", { type: "cron", cron: "0 9 * * *", enabled: true })],
        state,
        now,
      }),
    ).toEqual([]);
  });
});

describe("triggerPrompt", () => {
  it("carries the skill's own instructions and asks for a report", () => {
    const prompt = triggerPrompt({
      ...flow("general/release-notes"),
      title: "Release notes digest",
      description: "Summarise what shipped.",
      instructions: "1) Read the changelog. 2) Write three bullets.",
    });
    expect(prompt).toContain("Release notes digest");
    expect(prompt).toContain("1) Read the changelog.");
    expect(prompt).toContain("scheduled run");
    // A run nobody watched has to end in a statement of what it did.
    expect(prompt).toContain("report");
  });

  it("falls back to the step list when the skill has no prose", () => {
    expect(triggerPrompt(flow("general/plain"))).toContain("1. Do it");
  });
});

describe("tickTriggers", () => {
  let userData = "";

  beforeEach(() => {
    userData = mkdtempSync(join(tmpdir(), "redrob-triggers-"));
  });

  afterEach(() => {
    rmSync(userData, { recursive: true, force: true });
  });

  it("runs a due flow, reports it, and records the outcome", async () => {
    const now = new Date("2026-08-17T09:00:05").getTime();
    const armed = flow("general/nine", {
      type: "cron",
      cron: "0 9 * * *",
      enabled: true,
      targetChannelId: "brief",
    });
    writeTriggerState(userData, { "general/nine": { armedAt: now - 3_600_000 } });

    const delivered: Array<{ channelId: string; text: string; ok: boolean }> = [];
    const outcomes = await tickTriggers(userData, {
      listFlows: () => [armed],
      now: () => now,
      run: async () => "Wrote three bullets to notes.md.",
      deliver: async (input) => {
        delivered.push({ channelId: input.channelId, text: input.text, ok: input.ok });
      },
    });

    expect(outcomes).toEqual([{ id: "general/nine", ok: true }]);
    expect(delivered).toEqual([
      {
        channelId: "brief",
        text: "Wrote three bullets to notes.md.",
        ok: true,
      },
    ]);
    const state = readTriggerState(userData);
    expect(state["general/nine"]?.lastStatus).toBe("ok");
    expect(state["general/nine"]?.lastSummary).toContain("notes.md");
  });

  it("reports a failure instead of swallowing it", async () => {
    const now = new Date("2026-08-17T09:00:05").getTime();
    writeTriggerState(userData, { "general/nine": { armedAt: now - 3_600_000 } });
    const delivered: Array<{ ok: boolean; text: string }> = [];

    const outcomes = await tickTriggers(userData, {
      listFlows: () => [flow("general/nine", { type: "cron", cron: "0 9 * * *", enabled: true })],
      now: () => now,
      run: async () => {
        throw new Error("no model configured");
      },
      deliver: async (input) => {
        delivered.push({ ok: input.ok, text: input.text });
      },
    });

    expect(outcomes).toEqual([{ id: "general/nine", ok: false }]);
    expect(delivered).toEqual([{ ok: false, text: "no model configured" }]);
    // Nobody is watching a scheduled run, so the failure has to survive in the
    // state file for the Skills screen to show.
    expect(readTriggerState(userData)["general/nine"]?.lastStatus).toBe("failed");
  });

  it("marks the run before doing it, so a crash cannot re-fire the same minute", async () => {
    const now = new Date("2026-08-17T09:00:05").getTime();
    writeTriggerState(userData, { "general/nine": { armedAt: now - 3_600_000 } });
    const flows = [flow("general/nine", { type: "cron", cron: "0 9 * * *", enabled: true })];

    let seenDuringRun: TriggerState = {};
    await tickTriggers(userData, {
      listFlows: () => flows,
      now: () => now,
      run: async () => {
        seenDuringRun = readTriggerState(userData);
        return "done";
      },
      deliver: async () => undefined,
    });

    expect(seenDuringRun["general/nine"]?.lastRunAt).toBe(now);
    // A second tick inside the same minute finds nothing to do.
    const second = await tickTriggers(userData, {
      listFlows: () => flows,
      now: () => now + 10_000,
      run: async () => "should not run",
      deliver: async () => undefined,
    });
    expect(second).toEqual([]);
  });

  it("arms a schedule it has not seen before without running it", async () => {
    const now = new Date("2026-08-17T09:00:05").getTime();
    const ran: string[] = [];
    const outcomes = await tickTriggers(userData, {
      listFlows: () => [
        flow("general/fresh", { type: "cron", cron: "0 9 * * *", enabled: true }),
      ],
      now: () => now,
      run: async (f) => {
        ran.push(f.id);
        return "ran";
      },
      deliver: async () => undefined,
    });

    // Arming and firing in one pass would mean every restart at 09:00 runs it.
    expect(outcomes).toEqual([]);
    expect(ran).toEqual([]);
    expect(readTriggerState(userData)["general/fresh"]?.armedAt).toBe(now);
  });
});
