import { readAudit, type AuditEntry } from "../../audit/tool-audit.js";
import { clockOf, DAY_MS, type TimeSource } from "../time/index.js";
import type { FloorDb } from "../queue/sqlite.js";
import { gateStats } from "../tasks/gates.js";
import type { ApprovalTray } from "../approvals/tray.js";
import type { TokenMeter } from "../budget/token-meter.js";
import type { OfficePolicy } from "../policy.js";
import type { Interruption, FloorStateStore } from "../state.js";
import type { TaskStore } from "../tasks/store.js";

export interface BriefApprovalLine {
  id: string;
  line: string;
  evidence: string[];
  dissent: string | null;
}

export interface BriefBlockLine {
  taskId: string | null;
  reason: string;
  unblockCondition: string;
}

export interface BriefAnomaly {
  signal: "gate-failure-spike" | "agreement-spike" | "cycle-kills";
  detail: string;
}

export interface DailyBrief {
  generatedAt: number;
  dayIndex: number;
  /** Budget exhaustion goes at the very top, with the time. Never buried. */
  banner: string | null;
  shipped: string[];
  approvals: BriefApprovalLine[];
  blocked: BriefBlockLine[];
  spend: {
    tokens: number;
    budget: number;
    costMicros: number;
  };
  anomalies: BriefAnomaly[];
  handoff: {
    scheduled: number;
    completed: number;
    interruptions: Array<{ from: string; to: string | null; cause: string; note: string }>;
    summary: string;
  };
}

function hhmm(at: number, tzOffsetMinutes: number): string {
  const { hour, minute } = clockOf(at, tzOffsetMinutes);
  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}

/** Structured detail is stored as the row's argsSummary JSON. */
function detailOf(event: AuditEntry): Record<string, unknown> {
  if (!event.argsSummary) return {};
  try {
    const parsed = JSON.parse(event.argsSummary) as unknown;
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : {};
  } catch {
    return {};
  }
}

function agreementRate(events: readonly AuditEntry[]): number {
  let delivers = 0;
  let challenges = 0;
  for (const event of events) {
    if (event.event !== "message.accepted") continue;
    const type = String(detailOf(event)["type"] ?? "");
    if (type === "DELIVER") delivers += 1;
    if (type === "CHALLENGE") challenges += 1;
  }
  if (delivers === 0) return 0;
  return 1 - challenges / delivers;
}

export interface BriefDeps {
  db: FloorDb;
  tasks: TaskStore;
  tray: ApprovalTray;
  meter: TokenMeter;
  floorState: FloorStateStore;
  policy: OfficePolicy;
  clock: TimeSource;
}

/**
 * The morning one-pager. It is generated from the audit log and the Floor
 * tables, so it cannot claim anything that did not happen.
 */
export async function buildDailyBrief(deps: BriefDeps): Promise<DailyBrief> {
  const now = deps.clock.now();
  const since = now - DAY_MS;
  const events = await readAudit({ sinceEventTime: since });
  const tz = deps.policy.timezoneOffsetMinutes;

  const shipped = events
    .filter((event) => event.event === "approval.resolved" && event.approvalState === "granted")
    .map((event) => `${hhmm(event.eventTime, tz)} ${event.resultSummary}`);
  for (const task of deps.tasks.list()) {
    if (task.state === "done" && task.finishedAt !== null && task.finishedAt >= since) {
      shipped.push(`${hhmm(task.finishedAt, tz)} ${task.title} (${task.staffId})`);
    }
  }

  const approvals: BriefApprovalLine[] = deps.tray
    .pending()
    .slice(0, 5)
    .map((item) => ({
      id: item.id,
      line: item.headline,
      evidence: item.evidence.map(
        (ref) => `${ref.kind}:${ref.id}${ref.locator ? `#${ref.locator}` : ""}`,
      ),
      dissent: item.dissent,
    }));

  const blocked: BriefBlockLine[] = [];
  const seenBlocks = new Set<string>();
  for (const event of events) {
    if (event.event !== "message.delivered" || !event.resultSummary.startsWith("BLOCK: ")) continue;
    const reason = event.resultSummary.slice("BLOCK: ".length);
    if (seenBlocks.has(reason)) continue;
    seenBlocks.add(reason);
    blocked.push({
      taskId: event.taskId ?? null,
      reason,
      unblockCondition: String(detailOf(event)["unblockCondition"] ?? "unspecified"),
    });
  }
  for (const task of deps.tasks.listByState("blocked")) {
    const reason = task.result ?? "Blocked without a recorded reason";
    if (seenBlocks.has(reason)) continue;
    seenBlocks.add(reason);
    blocked.push({
      taskId: task.id,
      reason: `${task.title}: ${reason}`,
      unblockCondition: "Resolve the blocking dependency and requeue",
    });
  }

  const spend = deps.meter.spendSince(since);
  const exhaustion = deps.meter.lastExhaustion();
  const banner = exhaustion
    ? `${hhmm(exhaustion.at, tz)} the token budget ran out. Action taken: stopped work.`
    : null;

  const gates = gateStats(deps.db, since);
  const anomalies: BriefAnomaly[] = [];
  if (gates.total > 0 && gates.passRate < 0.8) {
    anomalies.push({
      signal: "gate-failure-spike",
      detail: `Gate pass rate is ${(gates.passRate * 100).toFixed(0)}% across ${gates.total} checks.`,
    });
  }
  const agreement = agreementRate(events);
  if (agreement > 0.95) {
    anomalies.push({
      signal: "agreement-spike",
      detail: `StaffMembers agreed on ${(agreement * 100).toFixed(0)}% of deliveries. Review is probably not biting.`,
    });
  }
  const cycleKills = events.filter((event) => event.event === "governor.killed").length;
  if (cycleKills > 0) {
    anomalies.push({
      signal: "cycle-kills",
      detail: `${cycleKills} trace${cycleKills === 1 ? "" : "s"} killed for looping.`,
    });
  }

  const interruptions: Interruption[] = deps.floorState.interruptionsSince(since);
  const dayTasks = deps.tasks.list().filter((task) => task.createdAt >= since);
  const completed = dayTasks.filter((task) => task.state === "done").length;
  const interruptionLines = interruptions.map((item) => ({
    from: hhmm(item.from, tz),
    to: item.to === null ? null : hhmm(item.to, tz),
    cause: item.cause,
    note: item.note,
  }));
  const summary =
    interruptionLines.length === 0
      ? `The floor ran uninterrupted: ${completed} of ${dayTasks.length} tasks finished.`
      : `${interruptionLines
          .map(
            (item) =>
              `${item.from} stopped (${item.cause})${item.to ? `, ${item.to} resumed` : ", not resumed"}`,
          )
          .join("; ")}. ${completed} of ${dayTasks.length} tasks finished.`;

  return {
    generatedAt: now,
    dayIndex: clockOf(now, tz).dayIndex,
    banner,
    shipped,
    approvals,
    blocked,
    spend: {
      tokens: spend.tokens,
      budget: spend.budget,
      costMicros: deps.meter.costMicrosSince(since),
    },
    anomalies,
    handoff: {
      scheduled: dayTasks.length,
      completed,
      interruptions: interruptionLines,
      summary,
    },
  };
}

/** Plain-text rendering for the console and the Editor's artifact. */
export function renderDailyBrief(brief: DailyBrief): string {
  const lines: string[] = [];
  lines.push("# Daily Brief");
  if (brief.banner) lines.push("", `> ${brief.banner}`);
  lines.push("", "## 1. Shipped");
  lines.push(...(brief.shipped.length ? brief.shipped.map((s) => `- ${s}`) : ["- nothing shipped"]));
  lines.push("", "## 2. Needs approval");
  if (brief.approvals.length === 0) {
    lines.push("- tray is empty");
  } else {
    for (const item of brief.approvals) {
      lines.push(`- ${item.line}`);
      lines.push(`  evidence: ${item.evidence.join(", ") || "none"}`);
      lines.push(`  against: ${item.dissent ?? "no dissent recorded"}`);
    }
  }
  lines.push("", "## 3. Blocked");
  lines.push(
    ...(brief.blocked.length
      ? brief.blocked.map((b) => `- ${b.reason} (unblock when: ${b.unblockCondition})`)
      : ["- nothing blocked"]),
  );
  lines.push("", "## 4. Spend");
  lines.push(
    `- ${brief.spend.tokens.toLocaleString()} / ${brief.spend.budget.toLocaleString()} tokens`,
  );
  lines.push("", "## 5. Anomalies");
  lines.push(
    ...(brief.anomalies.length
      ? brief.anomalies.map((a) => `- ${a.signal}: ${a.detail}`)
      : ["- none"]),
  );
  lines.push("", "## 6. Handoff");
  lines.push(`- ${brief.handoff.summary}`);
  for (const item of brief.handoff.interruptions) {
    lines.push(`- ${item.from} to ${item.to ?? "still down"} (${item.cause}) ${item.note}`);
  }
  return lines.join("\n");
}
