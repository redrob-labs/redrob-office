/**
 * Saved flows that run on their own, and report where somebody will see it.
 *
 * A flow with a schedule is the difference between a tool you drive and one that
 * works while you are asleep: "every weekday at nine, check the release notes
 * and post what changed". Until now a `trigger` could be written into a flow's
 * file and nothing on this machine ever read it, which is worse than not
 * offering the field at all — the person believes they armed something.
 *
 * Two rules keep an automatic run honest. It runs through the same chat agent a
 * person would have used, under the same policy, so a scheduled run cannot do
 * anything a typed request could not. And every run reports into a channel,
 * finished or failed, because work nobody hears about is indistinguishable from
 * work that never ran.
 */
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import type { WorkflowDefinition, WorkflowTrigger } from "@redrob/registry";
import { nowMs } from "../app-time.js";
import { cronMatches, parseCron } from "./cron.js";

/** What one flow's schedule has done so far. */
export interface TriggerRunState {
  /** When this schedule was first seen, so an interval has something to count from. */
  armedAt: number;
  lastRunAt?: number;
  /** The minute a cron line last fired, so one minute cannot fire twice. */
  lastFiredMinute?: number;
  lastStatus?: "ok" | "failed";
  lastSummary?: string;
}

export type TriggerState = Record<string, TriggerRunState>;

export const MIN_INTERVAL_MINUTES = 1;
export const MAX_INTERVAL_MINUTES = 60 * 24 * 30;

/** A schedule that this machine can actually keep, or why it cannot. */
export function validateTrigger(
  trigger: WorkflowTrigger | undefined,
): { ok: true } | { ok: false; reason: string } {
  if (!trigger || trigger.type === "manual") return { ok: true };
  if (trigger.type === "cron") {
    if (!trigger.cron?.trim()) return { ok: false, reason: "A cron schedule needs a line." };
    if (!parseCron(trigger.cron)) {
      return {
        ok: false,
        reason:
          "That is not a five-field cron line. Minute hour day month weekday, e.g. 0 9 * * 1-5.",
      };
    }
    return { ok: true };
  }
  if (trigger.type === "interval") {
    const minutes = trigger.intervalMinutes ?? 0;
    if (!Number.isInteger(minutes) || minutes < MIN_INTERVAL_MINUTES) {
      return { ok: false, reason: "An interval needs a whole number of minutes, 1 or more." };
    }
    if (minutes > MAX_INTERVAL_MINUTES) {
      return { ok: false, reason: "An interval longer than 30 days is a cron line." };
    }
    return { ok: true };
  }
  // `event` is in the type for later; nothing raises one yet, so say so rather
  // than accepting a schedule that silently never fires.
  return { ok: false, reason: "Event triggers are not available yet." };
}

/** Flows whose schedule says now, with the state their run should record. */
export function dueTriggers(input: {
  flows: readonly WorkflowDefinition[];
  state: TriggerState;
  now: number;
}): Array<{ flow: WorkflowDefinition; firedMinute: number }> {
  const minute = Math.floor(input.now / 60_000);
  const due: Array<{ flow: WorkflowDefinition; firedMinute: number }> = [];

  for (const flow of input.flows) {
    const trigger = flow.trigger;
    if (!trigger?.enabled) continue;
    if (validateTrigger(trigger).ok !== true) continue;
    const state = input.state[flow.id];
    if (!state) continue; // Not armed yet; arming is a separate, explicit step.

    if (trigger.type === "cron") {
      if (state.lastFiredMinute === minute) continue;
      if (!cronMatches(trigger.cron ?? "", new Date(input.now))) continue;
      due.push({ flow, firedMinute: minute });
      continue;
    }
    if (trigger.type === "interval") {
      const since = state.lastRunAt ?? state.armedAt;
      const waited = input.now - since;
      if (waited < (trigger.intervalMinutes ?? 0) * 60_000) continue;
      due.push({ flow, firedMinute: minute });
    }
  }
  return due;
}

/**
 * Bring the state file in line with the flows that exist.
 *
 * A schedule is armed the first time it is seen, and an interval counts from
 * that moment rather than from the epoch — otherwise every flow with an
 * interval fires the instant the app opens, and again on every restart.
 */
export function armSchedules(input: {
  flows: readonly WorkflowDefinition[];
  state: TriggerState;
  now: number;
}): { state: TriggerState; changed: boolean } {
  const next: TriggerState = { ...input.state };
  let changed = false;
  const live = new Set<string>();

  for (const flow of input.flows) {
    if (!flow.trigger?.enabled) continue;
    live.add(flow.id);
    if (!next[flow.id]) {
      next[flow.id] = {
        armedAt: input.now,
        // Arming inside a matching minute must not fire: somebody who saves
        // "every day at nine" at 09:00 means tomorrow, not this second.
        ...(flow.trigger.type === "cron"
          ? { lastFiredMinute: Math.floor(input.now / 60_000) }
          : {}),
      };
      changed = true;
    }
  }
  // A flow that lost its schedule (or was deleted) should not keep a last-run
  // time around to surprise somebody who arms it again months later.
  for (const id of Object.keys(next)) {
    if (!live.has(id)) {
      delete next[id];
      changed = true;
    }
  }
  return { state: next, changed };
}

export function triggerStatePath(userData: string): string {
  return join(userData, "workflow-triggers.json");
}

export function readTriggerState(userData: string): TriggerState {
  try {
    const parsed = JSON.parse(readFileSync(triggerStatePath(userData), "utf8")) as unknown;
    if (!parsed || typeof parsed !== "object") return {};
    return parsed as TriggerState;
  } catch {
    return {};
  }
}

export function writeTriggerState(userData: string, state: TriggerState): void {
  const path = triggerStatePath(userData);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(state, null, 2)}\n`, "utf8");
}

/** What a scheduled run asks the agent to do, in the person's own words. */
export function triggerPrompt(flow: WorkflowDefinition): string {
  const lines = [
    `Run my saved skill "${flow.title}" (${flow.id}) now. This is a scheduled run: nobody is watching, so do the work and report the result.`,
  ];
  if (flow.description) lines.push(`What it is for: ${flow.description}`);
  if (flow.instructions) lines.push(`How to do it:\n${flow.instructions}`);
  else {
    lines.push(
      `Steps:\n${flow.steps.map((step, i) => `${i + 1}. ${step.title}${step.notes ? ` — ${step.notes}` : ""}`).join("\n")}`,
    );
  }
  lines.push(
    "End with a short report of what you actually did and where anything you wrote can be found. If you could not finish, say what stopped you.",
  );
  return lines.join("\n\n");
}

export interface TriggerRunner {
  /** Do the work. Returns what to report. */
  run: (flow: WorkflowDefinition) => Promise<string>;
  /** Say what happened, in the channel the schedule names. */
  deliver: (input: {
    flow: WorkflowDefinition;
    channelId: string;
    text: string;
    ok: boolean;
  }) => Promise<void>;
  listFlows: () => readonly WorkflowDefinition[];
  now?: () => number;
  onLog?: (message: string) => void;
}

export const DEFAULT_TRIGGER_CHANNEL = "general";
const TICK_MS = 30_000;

let timer: ReturnType<typeof setInterval> | null = null;
let running = new Set<string>();

/**
 * One pass: arm what is new, run what is due, and write down what happened.
 *
 * Exported so a test can drive the clock instead of waiting for a real minute
 * to arrive.
 */
export async function tickTriggers(
  userData: string,
  runner: TriggerRunner,
): Promise<Array<{ id: string; ok: boolean }>> {
  const now = runner.now?.() ?? nowMs();
  const flows = runner.listFlows();
  const armed = armSchedules({ flows, state: readTriggerState(userData), now });
  if (armed.changed) writeTriggerState(userData, armed.state);

  const due = dueTriggers({ flows, state: armed.state, now });
  const outcomes: Array<{ id: string; ok: boolean }> = [];

  for (const { flow, firedMinute } of due) {
    // A flow that takes longer than one interval must not stack up runs.
    if (running.has(flow.id)) continue;
    running.add(flow.id);
    // Written before the work starts: a run that crashes the process must not
    // come back and fire again immediately on the next launch.
    const started = readTriggerState(userData);
    started[flow.id] = {
      ...(started[flow.id] ?? { armedAt: now }),
      lastRunAt: now,
      lastFiredMinute: firedMinute,
    };
    writeTriggerState(userData, started);

    let ok = true;
    let text = "";
    try {
      runner.onLog?.(`workflow trigger: running ${flow.id}`);
      text = await runner.run(flow);
    } catch (err) {
      ok = false;
      text = err instanceof Error ? err.message : String(err);
    } finally {
      running.delete(flow.id);
    }

    const channelId = flow.trigger?.targetChannelId?.trim() || DEFAULT_TRIGGER_CHANNEL;
    try {
      await runner.deliver({ flow, channelId, text, ok });
    } catch (err) {
      runner.onLog?.(
        `workflow trigger: could not report ${flow.id}: ${err instanceof Error ? err.message : String(err)}`,
      );
    }

    const after = readTriggerState(userData);
    after[flow.id] = {
      ...(after[flow.id] ?? { armedAt: now }),
      lastRunAt: runner.now?.() ?? nowMs(),
      lastFiredMinute: firedMinute,
      lastStatus: ok ? "ok" : "failed",
      lastSummary: text.slice(0, 500),
    };
    writeTriggerState(userData, after);
    outcomes.push({ id: flow.id, ok });
  }
  return outcomes;
}

export function startWorkflowTriggers(userData: string, runner: TriggerRunner): void {
  stopWorkflowTriggers();
  timer = setInterval(() => {
    void tickTriggers(userData, runner).catch((err) => {
      runner.onLog?.(
        `workflow trigger tick failed: ${err instanceof Error ? err.message : String(err)}`,
      );
    });
  }, TICK_MS);
  // Never the reason the app stays alive.
  timer.unref?.();
}

export function stopWorkflowTriggers(): void {
  if (timer) clearInterval(timer);
  timer = null;
  running = new Set<string>();
}
