import {
  existsSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
  mkdirSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  appendAudit,
  configureToolAudit,
  readAudit,
} from "../audit/tool-audit.js";
import { configureComputerUse } from "../office/config.js";
import { configureArtifacts } from "../services/artifacts.js";
import {
  evaluateToolPolicy,
  profileFromPreset,
  type SecurityPolicyBundle,
  type StaffProfilePreset,
} from "../security/index.js";
import { OfficeScheduler, type ChannelPost } from "./scheduler.js";
import {
  DEFAULT_ROSTER,
  MANAGER_ID,
  RESEARCHER_ID,
  REVIEWER_ID,
  WRITER_ID,
} from "./staff/roster.js";
import type { StaffSpec } from "./staff/types.js";
import {
  BUILTIN_TASK_TEMPLATES,
  INTAKE_TEMPLATE_ID,
  type TaskTemplate,
} from "./tasks/templates.js";
import { policyForStaff } from "./tasks/executor.js";
import { ScriptedModel, type ScriptEntry } from "./fixtures/scripted-model.js";
import { seedDemoWorkspace } from "./fixtures/demo-scenario.js";
import { PRICE_ROSTER, PRICE_TASK_TEMPLATES } from "./fixtures/price-roster.js";
import { DEFAULT_CHANNEL_ID } from "./channels/index.js";
import { DEFAULT_OFFICE_POLICY } from "./policy.js";
import { DAY_MS, MINUTE, VirtualTimeSource } from "./time/index.js";
import { parseStaffOutput } from "./staff/output-contract.js";

const TZ = 9 * 60;

/** Structured detail rides along as the audit row's argsSummary JSON. */
function detailOf(event: { argsSummary?: string }): Record<string, unknown> {
  if (!event?.argsSummary) return {};
  try {
    const parsed = JSON.parse(event.argsSummary) as unknown;
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : {};
  } catch {
    return {};
  }
}

function atLocal(day: number, hour: number, minute = 0): number {
  return day * DAY_MS + (hour * 60 + minute) * MINUTE - TZ * MINUTE;
}

interface Harness {
  runtime: OfficeScheduler;
  clock: VirtualTimeSource;
  root: string;
  workspace: string;
  settle: () => Promise<void>;
  advance: (ms: number) => Promise<void>;
  /** Step the clock until `done()` holds. Returns whether it ever did. */
  advanceUntil: (
    done: () => boolean | Promise<boolean>,
    maxVirtualMs?: number,
    stepMs?: number,
  ) => Promise<boolean>;
}

const open: Harness[] = [];

function boot(options?: {
  script?: ScriptEntry[];
  roster?: StaffSpec[];
  templates?: TaskTemplate[];
  startAt?: number;
  policy?: ConstructorParameters<typeof OfficeScheduler>[0]["policy"];
  fileDeliverable?: ConstructorParameters<
    typeof OfficeScheduler
  >[0]["fileDeliverable"];
  inferenceReady?: ConstructorParameters<
    typeof OfficeScheduler
  >[0]["inferenceReady"];
  /** Drop the scripted model, to exercise the route checks a real run makes. */
  withoutScriptedModel?: boolean;
  /** Stand in front of the scripted model, to assert on what a turn was sent. */
  callModel?: ConstructorParameters<typeof OfficeScheduler>[0]["callModel"];
  webSearchAllowed?: ConstructorParameters<
    typeof OfficeScheduler
  >[0]["webSearchAllowed"];
  /**
   * Boot on a named profile instead of the permissive one. Every other test
   * runs on `full`, which is how a shipped default that refused every file
   * tool went unnoticed for so long.
   */
  profile?: StaffProfilePreset;
}): Harness {
  const root = mkdtempSync(join(tmpdir(), "redrob-floor-test-"));
  const userData = join(root, "userData");
  const workspace = join(root, "workspace");
  mkdirSync(userData, { recursive: true });
  mkdirSync(workspace, { recursive: true });
  configureToolAudit(userData);
  configureComputerUse(userData);
  seedDemoWorkspace(workspace);

  const clock = new VirtualTimeSource(
    options?.startAt ?? atLocal(20_000, 9, 0),
    600,
  );
  const scripted = new ScriptedModel(options?.script ?? []);
  const basePolicy: SecurityPolicyBundle = {
    global: {
      deniedGroups: [],
      deniedTools: [],
      execSecurity: "allowlist",
      execAsk: "always",
      execAllowlist: ["node"],
      elevatedEnabled: false,
    },
    profile: profileFromPreset(options?.profile ?? "full"),
    sandbox: {
      mode: "workspace",
      workspaceRoots: [workspace],
      readonly: false,
    },
  };

  const runtime = new OfficeScheduler({
    userDataPath: userData,
    clock,
    basePolicy,
    providers: {},
    ...(options?.withoutScriptedModel
      ? {}
      : { callModel: options?.callModel ?? scripted.asModelCall() }),
    roster: options?.roster ?? PRICE_ROSTER,
    templates: options?.templates ?? PRICE_TASK_TEMPLATES,
    policy: {
      timezoneOffsetMinutes: TZ,
      ...options?.policy,
    },
    ...(options?.fileDeliverable
      ? { fileDeliverable: options.fileDeliverable }
      : {}),
    ...(options?.inferenceReady
      ? { inferenceReady: options.inferenceReady }
      : {}),
    ...(options?.webSearchAllowed
      ? { webSearchAllowed: options.webSearchAllowed }
      : {}),
  });

  // Yield until the scheduler has been idle for ten consecutive turns. The
  // budget is elapsed real time, not a turn count: a fixed turn count starves
  // when the suite runs in parallel and leaves assertions reading a half-drained
  // queue, which looks like a logic failure but is only impatience.
  const settle = async (): Promise<void> => {
    const deadline = performance.now() + 20_000;
    let quiet = 0;
    while (performance.now() < deadline) {
      await new Promise<void>((r) => setImmediate(r));
      if (runtime.isIdle()) {
        quiet += 1;
        if (quiet >= 10) return;
      } else quiet = 0;
    }
  };

  const advance = async (ms: number): Promise<void> => {
    clock.advance(ms);
    await settle();
  };

  const harness: Harness = {
    runtime,
    clock,
    root,
    workspace,
    settle,
    advance,
    // Paced delays are a hash of the message id, and message ids are random
    // UUIDs, so a CHALLENGE lands anywhere between 3 and 10 virtual minutes
    // after it is sent. Advancing a fixed number of steps therefore passes or
    // fails on the luck of the draw; step until the thing being asserted has
    // actually happened, with a ceiling so a genuine hang still fails.
    advanceUntil: async (
      done,
      maxVirtualMs = 2 * 60 * MINUTE,
      stepMs = MINUTE,
    ) => {
      for (let elapsed = 0; elapsed < maxVirtualMs; elapsed += stepMs) {
        if (await done()) return true;
        await advance(stepMs);
      }
      return done();
    },
  };
  open.push(harness);
  return harness;
}

afterEach(async () => {
  for (const harness of open.splice(0)) {
    await harness.runtime.stop();
    harness.runtime.close();
    rmSync(harness.root, { recursive: true, force: true });
  }
});

function deliver(to: string, claim: string): ScriptEntry["steps"][number] {
  return {
    text: JSON.stringify({
      type: "DELIVER",
      to,
      artifactRef: { kind: "artifact", id: "a1", label: "artifact" },
      claim,
    }),
  };
}

/**
 * Handing work to a colleague the way a talking seat does it: a tool call in
 * its own loop, which comes back with what the colleague produced.
 */
function delegate(
  to: string,
  task: string,
  reason = "Needs their tools",
): ScriptEntry["steps"][number] {
  return {
    toolCalls: [{ name: "agents.mention", arguments: { to, task, reason } }],
  };
}

describe("I5 CHALLENGE needs evidence", () => {
  it("rejects an evidence-free CHALLENGE at the bus and writes the refusal to the audit log", async () => {
    const harness = boot();
    await harness.runtime.start();
    const result = await harness.runtime.bus.publish({
      message: {
        id: "msg-no-evidence",
        traceId: "trace-evidence",
        depth: 1,
        channelId: DEFAULT_CHANNEL_ID,
        type: "CHALLENGE",
        from: "repro-verifier",
        to: "price-watcher",
        targetClaim: "the number moved",
        evidenceRef: [],
        alternative: "check the log",
      },
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.code).toBe("evidence-required");

    const events = await readAudit({});
    const rejection = events.find(
      (event) =>
        event.event === "message.rejected" &&
        detailOf(event)["messageId"] === "msg-no-evidence",
    );
    expect(detailOf(rejection!)["code"]).toBe("evidence-required");
    expect(harness.runtime.queue.pendingCount()).toBe(0);
  });

  it("accepts the same CHALLENGE once evidence is attached", async () => {
    const harness = boot();
    await harness.runtime.start();
    const result = await harness.runtime.bus.publish({
      message: {
        id: "msg-with-evidence",
        traceId: "trace-evidence",
        depth: 1,
        channelId: DEFAULT_CHANNEL_ID,
        type: "CHALLENGE",
        from: "repro-verifier",
        to: "price-watcher",
        targetClaim: "the number moved",
        evidenceRef: [{ kind: "log", id: "fetch.log", locator: "line 2" }],
        alternative: "check the log",
      },
    });
    expect(result.ok).toBe(true);
  });
});

describe("I7 StaffMembers cannot address a person", () => {
  it("refuses a message addressed to the human", async () => {
    const harness = boot();
    await harness.runtime.start();
    const result = await harness.runtime.bus.publish({
      message: {
        id: "msg-human",
        traceId: "trace-human",
        depth: 1,
        channelId: DEFAULT_CHANNEL_ID,
        type: "DELIVER",
        from: "editor",
        to: "human",
        artifactRef: { kind: "artifact", id: "brief" },
        claim: "here is your brief",
      },
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe("human-direct");
  });
});

describe("I6 Meeting round cap", () => {
  it("locks the room on the third round and files it in the approval tray", async () => {
    const script: ScriptEntry[] = [
      {
        label: "watcher-initial",
        match: (p) =>
          p.includes("You are the Price Watcher") &&
          p.includes("price snapshot"),
        steps: [deliver("repro-verifier", 'the price is "3.50"')],
      },
      {
        label: "verifier-challenge",
        match: (p) =>
          p.includes("You are the Repro Verifier") &&
          p.includes("Verify this delivery"),
        steps: [
          {
            text: JSON.stringify({
              type: "CHALLENGE",
              to: "price-watcher",
              targetClaim: 'the price is "3.50"',
              evidenceRef: [
                { kind: "log", id: "fetch.log", locator: "line 2" },
              ],
              alternative: "the log says 3.0",
            }),
          },
        ],
      },
      {
        label: "watcher-counter",
        match: (p) =>
          p.includes("You are the Price Watcher") &&
          p.includes("challenged your claim"),
        steps: [
          {
            text: JSON.stringify({
              type: "CHALLENGE",
              to: "repro-verifier",
              targetClaim: "the log is stale",
              evidenceRef: [{ kind: "file", id: "current.json" }],
              alternative: "trust the snapshot",
            }),
          },
        ],
      },
      {
        label: "verifier-counter",
        match: (p) =>
          p.includes("You are the Repro Verifier") &&
          p.includes("challenged your claim"),
        steps: [
          {
            text: JSON.stringify({
              type: "CHALLENGE",
              to: "price-watcher",
              targetClaim: "the snapshot is derived",
              evidenceRef: [{ kind: "log", id: "fetch.log" }],
              alternative: "a human picks",
            }),
          },
        ],
      },
    ];
    const harness = boot({ script });
    await harness.runtime.start();
    await harness.runtime.submitTask({ templateId: "office/price-patrol" });
    const closed = await harness.advanceUntil(() => {
      const [room] = harness.runtime.meetings.list();
      return Boolean(room && room.state !== "open");
    });
    expect(closed).toBe(true);

    const meetings = harness.runtime.meetings.list();
    expect(meetings.length).toBeGreaterThan(0);
    const meeting = meetings[0]!;
    expect(meeting.round).toBeLessThanOrEqual(2);
    expect(meeting.state).not.toBe("open");

    const events = await readAudit({});
    expect(events.some((event) => event.event === "meeting.escalated")).toBe(
      true,
    );
    expect(events.some((event) => event.event === "meeting.closed")).toBe(true);
    expect(
      harness.runtime.tray
        .pending()
        .some((item) => item.kind === "meeting-deadlock"),
    ).toBe(true);
  });
});

describe("I1 Trace budget", () => {
  it("stops derivation and escalates once the trace runs out of tokens", async () => {
    const harness = boot();
    await harness.runtime.start();
    const traceId = "trace-budget-test";
    harness.runtime.traces.open(traceId, { tokens: 100, depth: 4 }, "task-x");
    harness.runtime.traces.spend(traceId, 120);

    const result = await harness.runtime.bus.publish({
      message: {
        id: "msg-over-budget",
        traceId,
        depth: 1,
        channelId: DEFAULT_CHANNEL_ID,
        type: "DELIVER",
        from: "price-watcher",
        to: "repro-verifier",
        artifactRef: { kind: "artifact", id: "a1" },
        claim: "one more derivation",
      },
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.code).toBe("trace-budget");
    expect(harness.runtime.traces.get(traceId)?.state).toBe("escalated");

    const events = await readAudit({});
    expect(
      events.some((event) => event.event === "trace.budget.exceeded"),
    ).toBe(true);
  });

  it("stops derivation past the depth ceiling", async () => {
    const harness = boot();
    await harness.runtime.start();
    const traceId = "trace-depth-test";
    harness.runtime.traces.open(
      traceId,
      { tokens: 100_000, depth: 2 },
      "task-y",
    );
    const result = await harness.runtime.bus.publish({
      message: {
        id: "msg-too-deep",
        traceId,
        depth: 5,
        channelId: DEFAULT_CHANNEL_ID,
        type: "DELIVER",
        from: "price-watcher",
        to: "repro-verifier",
        artifactRef: { kind: "artifact", id: "a1" },
        claim: "deep",
      },
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe("depth-budget");
  });
});

describe("I3 ApprovalTray halts production", () => {
  it("stops producers at the sixth pending approval and refuses their messages", async () => {
    const harness = boot();
    await harness.runtime.start();
    for (let i = 0; i < 6; i += 1) {
      harness.runtime.tray.queue({
        id: `apr-${i}`,
        traceId: `trace-${i}`,
        taskId: null,
        staffId: "price-watcher",
        kind: "outbound",
        headline: `Outbound ${i}`,
        detail: "",
        evidence: [],
        dissent: null,
        options: ["yes", "no"],
      });
    }
    expect(harness.runtime.tray.pendingCount()).toBe(6);
    expect(harness.runtime.tray.isOverflowing()).toBe(true);

    // The runtime reconciles on the next tray write; force one through the
    // same path the runtime uses.
    await harness.runtime.resolveApproval("missing", true, "");
    expect(harness.runtime.floorState.load().productionHalted).toBe(true);

    const refused = await harness.runtime.submitTask({
      templateId: "office/price-patrol",
    });
    expect(refused.ok).toBe(false);

    const busResult = await harness.runtime.bus.publish({
      message: {
        id: "msg-halted",
        traceId: "trace-halted",
        depth: 1,
        channelId: DEFAULT_CHANNEL_ID,
        type: "DELIVER",
        from: "price-watcher",
        to: "repro-verifier",
        artifactRef: { kind: "artifact", id: "a" },
        claim: "still working",
      },
    });
    expect(busResult.ok).toBe(false);
    if (!busResult.ok) expect(busResult.code).toBe("production-halted");

    // Review and editorial keep going.
    const reviewer = await harness.runtime.bus.publish({
      message: {
        id: "msg-reviewer",
        traceId: "trace-halted",
        depth: 1,
        channelId: DEFAULT_CHANNEL_ID,
        type: "DELIVER",
        from: "repro-verifier",
        to: "editor",
        artifactRef: { kind: "artifact", id: "a" },
        claim: "review continues",
      },
    });
    expect(reviewer.ok).toBe(true);

    for (let i = 0; i < 3; i += 1) {
      await harness.runtime.resolveApproval(`apr-${i}`, false, "no");
    }
    expect(harness.runtime.floorState.load().productionHalted).toBe(false);
  });
});

describe("approvals do not block the runner", () => {
  it("parks the waiting Task in the queue and runs the next one meanwhile", async () => {
    const templates: TaskTemplate[] = [
      {
        id: "office/needs-approval",
        title: "Outbound post",
        staffId: "price-watcher",
        instruction:
          "Post the confirmed price change to the external pricing webhook.",
        gates: [],
        source: "builtin",
      },
      {
        id: "office/no-approval",
        title: "Local summary",
        staffId: "price-watcher",
        instruction: "Summarise the local price snapshot and deliver it.",
        gates: [],
        source: "builtin",
      },
    ];
    const script: ScriptEntry[] = [
      {
        label: "needs-approval",
        match: (p) => p.includes("pricing webhook"),
        steps: [
          {
            toolCalls: [
              {
                name: "net.httpPost",
                arguments: { url: "https://example.com/hook", body: "{}" },
              },
            ],
          },
          {
            text: JSON.stringify({
              type: "BLOCK",
              reason: "Waiting on the approval tray.",
              unblockCondition: "A human approves the post",
            }),
          },
        ],
      },
      {
        label: "no-approval",
        match: (p) => p.includes("local price snapshot"),
        steps: [deliver("editor", "snapshot summarised")],
      },
    ];

    const harness = boot({ script, templates, startAt: atLocal(20_000, 9, 0) });
    await harness.runtime.start();

    const blocked = await harness.runtime.submitTask({
      templateId: "office/needs-approval",
    });
    expect(blocked.ok).toBe(true);
    await harness.advanceUntil(() => harness.runtime.tray.pendingCount() === 1);

    // The outbound call is sitting in the tray, unanswered.
    expect(harness.runtime.tray.pendingCount()).toBe(1);

    // Nothing is occupying a runner while it waits: the scheduler reports idle
    // even though a Task is still outstanding. This is the whole point of
    // queueing approvals instead of awaiting a modal.
    expect(harness.runtime.isIdle()).toBe(true);

    // And a Task submitted afterwards runs to completion rather than queueing
    // behind the one waiting for a person.
    const second = await harness.runtime.submitTask({
      templateId: "office/no-approval",
    });
    expect(second.ok).toBe(true);
    await harness.advanceUntil(async () => {
      const seen = await readAudit({});
      return seen.some(
        (event) =>
          event.event === "message.accepted" &&
          detailOf(event)["type"] === "DELIVER",
      );
    });

    const events = await readAudit({});
    expect(events.some((event) => event.approvalState === "requested")).toBe(
      true,
    );

    // The second Task got all the way to a delivery while the first is still
    // unanswered, so the tray never became a queue head-of-line block.
    expect(
      events.some(
        (event) =>
          event.event === "message.accepted" &&
          detailOf(event)["type"] === "DELIVER",
      ),
    ).toBe(true);
    expect(harness.runtime.tray.pendingCount()).toBe(1);
  });
});

// A seat that cannot write has nothing to hand over. The office used to ship
// with a profile that refused every file tool, so a person asking for a
// spreadsheet got a markdown table at best, and usually a BLOCK.
describe("the writer can author the file that was asked for", () => {
  function authorBundle(staff: StaffSpec): SecurityPolicyBundle {
    return policyForStaff(
      {
        global: {
          deniedGroups: [],
          deniedTools: [],
          execSecurity: "allowlist",
          execAsk: "always",
          execAllowlist: [],
          elevatedEnabled: false,
        },
        profile: profileFromPreset("author"),
        sandbox: { mode: "workspace", workspaceRoots: [], readonly: false },
      },
      staff,
    );
  }

  it("holds the tools a spreadsheet needs, under the shipped profile", () => {
    const writer = DEFAULT_ROSTER.find((s) => s.id === WRITER_ID);
    expect(writer).toBeDefined();
    const bundle = authorBundle(writer as StaffSpec);
    for (const name of [
      "doc.create",
      "doc.open",
      "sheet.writeRange",
      "sheet.chart",
    ]) {
      expect(evaluateToolPolicy(name, bundle).allowed, name).toBe(true);
    }
  });

  it("lets research write the sourced notes it must hand to the writer", () => {
    const researcher = DEFAULT_ROSTER.find(
      (staff) => staff.id === RESEARCHER_ID,
    ) as StaffSpec;
    expect(researcher.tools).toContain("fs.write");
    expect(
      evaluateToolPolicy("fs.write", authorBundle(researcher)).allowed,
    ).toBe(true);
    expect(researcher.scope).toContain("Never ANSWER");
    expect(researcher.scope).toContain("DELIVER");
  });

  it("still cannot run a command or send anything out", () => {
    const writer = DEFAULT_ROSTER.find((s) => s.id === WRITER_ID) as StaffSpec;
    const bundle = authorBundle(writer);
    expect(evaluateToolPolicy("shell.exec", bundle).allowed).toBe(false);
    expect(evaluateToolPolicy("net.httpPost", bundle).allowed).toBe(false);
  });

  it("writes a real xlsx on the shipped profile, not a markdown table", async () => {
    // The seat's own workspace is only known once the harness has made it, so
    // the file it is told to create is filled in right after boot.
    let target = "";
    let turn = 0;
    const harness = boot({
      profile: "author",
      roster: DEFAULT_ROSTER,
      templates: [
        {
          id: "office/sheet",
          title: "Make the spreadsheet",
          staffId: WRITER_ID,
          instruction: "Make a spreadsheet of last week's numbers.",
          gates: [],
          source: "builtin",
        },
      ],
      callModel: async () => {
        turn += 1;
        if (turn === 1) {
          return {
            text: "",
            timingMs: 0,
            modelId: "fixture",
            provider: "openrouter" as const,
            finishReason: "tool_calls" as const,
            toolCalls: [
              {
                id: "call-create",
                name: "doc.create",
                arguments: JSON.stringify({ path: target }),
              },
            ],
          };
        }
        return {
          text: JSON.stringify({
            type: "DELIVER",
            to: REVIEWER_ID,
            artifactRef: { kind: "file", id: target, label: "numbers.xlsx" },
            claim: "Last week's numbers are in numbers.xlsx.",
          }),
          timingMs: 0,
          modelId: "fixture",
          provider: "openrouter" as const,
          finishReason: "stop" as const,
        };
      },
    });
    target = join(harness.workspace, "numbers.xlsx");

    await harness.runtime.start();
    const submitted = await harness.runtime.submitTask({
      templateId: "office/sheet",
    });
    expect(submitted.ok).toBe(true);
    const written = await harness.advanceUntil(() => existsSync(target));
    expect(written, "the writer never got the file written").toBe(true);

    // An xlsx is a zip, so the first two bytes say whether a spreadsheet was
    // written or a text file was named like one.
    expect(readFileSync(target).subarray(0, 2).toString("latin1")).toBe("PK");
  });

  // The seat wrote the spreadsheet, then answered with a Windows path. With no
  // file to click the person asked to see it, and the entire table came back
  // typed out as a chat message: the same rows paid for three times.
  it("hangs the file it made on the answer about it", async () => {
    // doc.create files a document by name, so the run has to have somewhere to
    // file it that is not the person's real documents folder.
    const documents = mkdtempSync(join(tmpdir(), "redrob-docs-test-"));
    const hadDir = process.env["REDROB_ARTIFACTS_DIR"];
    process.env["REDROB_ARTIFACTS_DIR"] = documents;
    configureArtifacts(documents);

    try {
      let turn = 0;
      const harness = boot({
        profile: "author",
        roster: DEFAULT_ROSTER,
        templates: BUILTIN_TASK_TEMPLATES,
        callModel: async () => {
          turn += 1;
          if (turn === 1) {
            return {
              text: "",
              timingMs: 0,
              modelId: "fixture",
              provider: "openrouter" as const,
              finishReason: "tool_calls" as const,
              toolCalls: [
                {
                  id: "call-create",
                  name: "doc.create",
                  arguments: JSON.stringify({ name: "models.xlsx" }),
                },
              ],
            };
          }
          return {
            text: JSON.stringify({ type: "ANSWER", text: "Made the sheet." }),
            timingMs: 0,
            modelId: "fixture",
            provider: "openrouter" as const,
            finishReason: "stop" as const,
          };
        },
      });

      await harness.runtime.start();
      await harness.runtime.say(
        "모델들 엑셀로 정리해줘",
        DEFAULT_CHANNEL_ID,
        WRITER_ID,
      );
      const shown = await harness.advanceUntil(async () =>
        (await harness.runtime.channel()).some(
          (post) => post.type === "floor.answered" && post.artifact !== null,
        ),
      );
      expect(shown, "the answer arrived without the file on it").toBe(true);

      const answer = (await harness.runtime.channel()).find(
        (post) => post.type === "floor.answered",
      );
      // Named, and openable: the card carries the id the library files it under.
      expect(answer?.artifact?.label).toContain("models.xlsx");
      expect(answer?.artifact?.artifactId).toBeTruthy();
    } finally {
      if (hadDir === undefined) delete process.env["REDROB_ARTIFACTS_DIR"];
      else process.env["REDROB_ARTIFACTS_DIR"] = hadDir;
    }
  });

  // OpenClaw-style spawn: the lead assigns in one line; the writer already sees
  // what the person asked, so the dataset does not have to travel as chat.
  it("hands the assignee the channel, so the lead can assign in one line", async () => {
    const prompts: string[] = [];
    const toolsByTurn: string[][] = [];
    let turn = 0;
    const harness = boot({
      profile: "author",
      roster: DEFAULT_ROSTER,
      templates: BUILTIN_TASK_TEMPLATES,
      callModel: async ({ messages, tools }) => {
        turn += 1;
        toolsByTurn.push(tools.map((tool) => tool.name));
        prompts.push(
          messages
            .map((message) =>
              typeof message.content === "string"
                ? message.content
                : JSON.stringify(message.content),
            )
            .join("\n"),
        );
        if (turn === 1) {
          return {
            text: "",
            timingMs: 0,
            modelId: "fixture",
            provider: "openrouter" as const,
            finishReason: "tool_calls" as const,
            toolCalls: [
              {
                id: "hand-on",
                name: "agents.mention",
                // The model picks the wrong seat. A file ask is deterministically
                // routed to editorial, which is the seat that can create it.
                arguments: JSON.stringify({
                  to: RESEARCHER_ID,
                  task: "최근 AI 모델을 조사해서 엑셀로 정리해줘.",
                  reason: "Needs the writer who can make the sheet.",
                }),
              },
            ],
          };
        }
        if (turn === 2) {
          return {
            text: JSON.stringify({
              type: "ANSWER",
              text: "시트 만들어 둘게요.",
            }),
            timingMs: 0,
            modelId: "fixture",
            provider: "openrouter" as const,
            finishReason: "stop" as const,
          };
        }
        return {
          text: "시트 만들어 뒀어요.",
          timingMs: 0,
          modelId: "fixture",
          provider: "openrouter" as const,
          finishReason: "stop" as const,
        };
      },
    });

    await harness.runtime.start();
    await harness.runtime.say(
      "야 최근 AI 모델 나온거 엑셀로 추출해서 나한테 남겨놔라",
    );
    const done = await harness.advanceUntil(() => turn >= 2);
    expect(done, "the writer never took a turn").toBe(true);

    // The lead orchestrates a file ask instead of spending its iterations
    // searching: handing it on is the only thing it can do.
    expect(toolsByTurn[0]).toEqual(["agents.mention"]);
    // The writer took the turn even though the model named Research, and it
    // arrived with the room rather than with the dataset pasted into the ask.
    const writerPrompt = prompts[1] ?? "";
    expect(writerPrompt).toContain("You are the Writer");
    expect(writerPrompt).toContain("Recent channel context");
    expect(writerPrompt).toContain("엑셀");
  });

  it("refuses agents.mention when the reason is empty", async () => {
    let turn = 0;
    const harness = boot({
      profile: "author",
      roster: DEFAULT_ROSTER,
      templates: BUILTIN_TASK_TEMPLATES,
      callModel: async () => {
        turn += 1;
        if (turn === 1) {
          return {
            text: "",
            timingMs: 0,
            modelId: "fixture",
            provider: "openrouter" as const,
            finishReason: "tool_calls" as const,
            toolCalls: [
              {
                id: "no-reason",
                name: "agents.mention",
                arguments: JSON.stringify({
                  to: WRITER_ID,
                  task: "Draft a note.",
                  reason: "   ",
                }),
              },
            ],
          };
        }
        return {
          text: JSON.stringify({
            type: "ANSWER",
            text: "이유를 적어야 해요.",
          }),
          timingMs: 0,
          modelId: "fixture",
          provider: "openrouter" as const,
          finishReason: "stop" as const,
        };
      },
    });

    await harness.runtime.start();
    await harness.runtime.say("Draft a note for me");
    await harness.advanceUntil(() => turn >= 2);

    const events = harness.runtime.channelEvents.list(DEFAULT_CHANNEL_ID);
    expect(events.some((event) => event.type === "delegate")).toBe(false);
  });

  it("shortens a lead REQUEST that pasted the deliverable", async () => {
    const paste = [
      "@Writer 아래 데이터로 엑셀 만들어줘",
      "",
      ...Array.from(
        { length: 12 },
        (_, i) => `${i + 1} | Model-${i} | Org | 50`,
      ),
    ].join("\n");
    let turn = 0;
    const asks: string[] = [];
    const harness = boot({
      profile: "author",
      roster: DEFAULT_ROSTER,
      templates: BUILTIN_TASK_TEMPLATES,
      callModel: async ({ messages }) => {
        turn += 1;
        if (turn === 1) {
          return {
            text: "",
            timingMs: 0,
            modelId: "fixture",
            provider: "openrouter" as const,
            finishReason: "tool_calls" as const,
            toolCalls: [
              {
                id: "hand-on",
                name: "agents.mention",
                arguments: JSON.stringify({
                  to: WRITER_ID,
                  task: paste,
                  reason: "File ask.",
                }),
              },
            ],
          };
        }
        if (turn === 2) {
          asks.push(String(messages[messages.length - 1]?.content ?? ""));
          return {
            text: JSON.stringify({ type: "ANSWER", text: "ok" }),
            timingMs: 0,
            modelId: "fixture",
            provider: "openrouter" as const,
            finishReason: "stop" as const,
          };
        }
        return {
          text: "정리해 뒀어요.",
          timingMs: 0,
          modelId: "fixture",
          provider: "openrouter" as const,
          finishReason: "stop" as const,
        };
      },
    });

    await harness.runtime.start();
    await harness.runtime.say("엑셀로 정리해줘");
    const trimmed = await harness.advanceUntil(async () =>
      (await readAudit({})).some((e) => e.event === "floor.requestTrimmed"),
    );
    expect(trimmed, "the pasted assignment was never shortened").toBe(true);

    // What the assignee was actually handed, rather than the paste.
    const handed = asks[0] ?? "";
    expect(handed.length).toBeLessThan(paste.length);
    expect(handed).not.toContain("Model-11");
  });

  it("says in its orders which format an ask implies", () => {
    const writer = DEFAULT_ROSTER.find((s) => s.id === WRITER_ID) as StaffSpec;
    expect(writer.scope).toContain(".xlsx");
    expect(writer.scope).toContain("doc.create");
    expect(writer.scope).toContain("ANSWER in one sentence");
    const manager = DEFAULT_ROSTER.find(
      (s) => s.id === MANAGER_ID,
    ) as StaffSpec;
    expect(manager.scope).toContain("one short sentence");
    expect(manager.scope).toContain("REQUEST the writer directly");
    expect(manager.scope).toContain("do not call tools first");
  });
});

describe("I4 anything that leaves the machine needs a person", () => {
  it("allows outbound network tools but always marks them for approval", () => {
    const bundle: SecurityPolicyBundle = {
      global: {
        deniedGroups: [],
        deniedTools: [],
        execSecurity: "allowlist",
        execAsk: "always",
        execAllowlist: [],
        elevatedEnabled: false,
      },
      profile: profileFromPreset("full"),
      sandbox: { mode: "off", workspaceRoots: [], readonly: false },
    };
    const decision = evaluateToolPolicy("net.httpPost", bundle);
    expect(decision.allowed).toBe(true);
    expect(decision.requiresApproval).toBe(true);
  });

  // Reading is not sending. A search leaves with a query and comes back with
  // public text, so gating it the way an outbound POST is gated would put a card
  // in front of every fact and make the office useless for anything current.
  it("lets a seat read the web without a card, while sending still needs one", () => {
    const bundle: SecurityPolicyBundle = {
      global: {
        deniedGroups: [],
        deniedTools: [],
        execSecurity: "allowlist",
        execAsk: "always",
        execAllowlist: [],
        elevatedEnabled: false,
      },
      // The strictest profile that still reads: looking something up is
      // reading, so it has to survive readonly.
      profile: profileFromPreset("readonly"),
      sandbox: { mode: "workspace", workspaceRoots: [], readonly: true },
    };
    for (const name of ["web.search", "web.fetch"]) {
      const decision = evaluateToolPolicy(name, bundle);
      expect(decision.allowed, name).toBe(true);
      expect(decision.requiresApproval, name).toBe(false);
    }
    // Sending is a different capability, and the default profile does not have
    // it at all: reading the web being free did not quietly widen outbound.
    expect(evaluateToolPolicy("net.httpPost", bundle).allowed).toBe(false);
  });

  it("refuses an outbound tool call end to end and files it in the tray", async () => {
    const templates: TaskTemplate[] = [
      {
        id: "office/webhook",
        title: "Webhook attempt",
        staffId: "price-watcher",
        instruction:
          "Post the confirmed price change to the external pricing webhook.",
        gates: [],
        source: "builtin",
      },
    ];
    const script: ScriptEntry[] = [
      {
        label: "webhook",
        match: (p) => p.includes("pricing webhook"),
        steps: [
          {
            toolCalls: [
              {
                name: "net.httpPost",
                arguments: { url: "https://example.com/hook", body: "{}" },
              },
            ],
          },
          {
            text: JSON.stringify({
              type: "BLOCK",
              reason: "The outbound post did not go through.",
              unblockCondition: "A human approves the post",
            }),
          },
        ],
      },
    ];
    const harness = boot({ script, templates });
    await harness.runtime.start();
    const submitted = await harness.runtime.submitTask({
      templateId: "office/webhook",
    });
    expect(submitted.ok).toBe(true);
    await harness.advanceUntil(() => harness.runtime.tray.pendingCount() === 1);

    const events = await readAudit({});
    expect(events.some((event) => event.approvalState === "requested")).toBe(
      true,
    );
    expect(harness.runtime.tray.pending()[0]?.headline).toContain(
      "net.httpPost",
    );
  });
});

describe("suspend, resume and restart", () => {
  it("checkpoints on suspend, resumes from the checkpoint and reports the gap", async () => {
    const script: ScriptEntry[] = [
      {
        label: "patrol",
        match: () => true,
        steps: [deliver("repro-verifier", "prices moved")],
      },
    ];
    const harness = boot({ script, startAt: atLocal(20_000, 23, 0) });
    await harness.runtime.start();
    await harness.runtime.submitTask({ templateId: "office/price-patrol" });
    await harness.advance(2 * MINUTE);

    harness.clock.advance(3 * 60 * MINUTE);
    await harness.runtime.handlePower("suspend");
    expect(harness.runtime.floorState.load().paused).toBe(true);
    const openInterruption = harness.runtime.floorState
      .load()
      .interruptions.find((item) => item.to === null);
    expect(openInterruption).toBeDefined();

    harness.clock.advance(5 * 60 * MINUTE);
    await harness.runtime.handlePower("resume");
    await harness.settle();
    expect(harness.runtime.floorState.load().paused).toBe(false);

    const brief = await harness.runtime.generateBrief();
    expect(brief.handoff.interruptions.length).toBeGreaterThan(0);
    expect(brief.handoff.summary).toContain("stopped");
    expect(brief.handoff.summary).toContain("resumed");
  });

  it("closes the interruption a crash left open when the Floor comes back", async () => {
    const harness = boot({ startAt: atLocal(20_000, 23, 30) });
    await harness.runtime.start();
    await harness.runtime.submitTask({ templateId: "office/price-patrol" });
    await harness.runtime.handlePower("suspend");
    expect(harness.runtime.floorState.load().paused).toBe(true);

    // Simulate a kill: drop the runtime without a clean stop, reopen the file.
    harness.runtime.close();
    const reopened = new OfficeScheduler({
      userDataPath: join(harness.root, "userData"),
      clock: harness.clock,
      basePolicy: {
        global: {
          deniedGroups: [],
          deniedTools: [],
          execSecurity: "allowlist",
          execAsk: "always",
          execAllowlist: [],
          elevatedEnabled: false,
        },
        profile: profileFromPreset("full"),
        sandbox: {
          mode: "workspace",
          workspaceRoots: [harness.workspace],
          readonly: false,
        },
      },
      providers: {},
      callModel: new ScriptedModel([]).asModelCall(),
      policy: { timezoneOffsetMinutes: TZ },
    });
    await reopened.start();
    const state = reopened.floorState.load();
    expect(state.interruptions.length).toBeGreaterThan(0);
    expect(state.interruptions.every((item) => item.to !== null)).toBe(true);
    await reopened.stop();
    reopened.close();
  });
});

describe("audit log timestamps", () => {
  it("stores eventTime and displayTime as separate fields", async () => {
    const harness = boot({ startAt: atLocal(20_000, 9, 0) });
    await harness.runtime.start();
    await harness.runtime.submitTask({ templateId: "office/price-patrol" });

    const events = await readAudit({});
    const enqueued = events.find((event) => event.event === "task.enqueued");
    expect(enqueued).toBeDefined();

    // Both fields are present and independently addressable.
    expect(Object.keys(enqueued!)).toContain("eventTime");
    expect(Object.keys(enqueued!)).toContain("displayTime");
    expect(typeof enqueued!.eventTime).toBe("number");
    expect(typeof enqueued!.displayTime).toBe("number");

    // eventTime is the domain clock the runtime was actually reading, which
    // under the virtual clock is nowhere near wall time.
    expect(Math.abs(enqueued!.eventTime - Date.now())).toBeGreaterThan(60_000);

    // Nothing dramatised the timeline, so displayTime defaults to eventTime.
    // The point is that moving one cannot move the other.
    expect(enqueued!.displayTime).toBe(enqueued!.eventTime);
  });

  it("lets a replay move displayTime without touching eventTime", async () => {
    const harness = boot({ startAt: atLocal(20_000, 9, 0) });
    const eventTime = harness.clock.now();
    const row = await appendAudit({
      kind: "lifecycle",
      event: "task.started",
      clock: harness.clock,
      displayTime: eventTime + 90 * MINUTE,
      resultSummary: "replayed",
    });
    expect(row.eventTime).toBe(eventTime);
    expect(row.displayTime).toBe(eventTime + 90 * MINUTE);
    expect(row.displayTime).not.toBe(row.eventTime);
  });
});

describe("pacing without sleep", () => {
  it("hands a staff message straight on, with no impression of typing", async () => {
    // Not started, so the row is still there to look at: a running office
    // claims it in the same tick now that nothing holds it back.
    const harness = boot();
    const result = await harness.runtime.bus.publish({
      message: {
        id: "msg-paced",
        traceId: "trace-paced",
        depth: 1,
        channelId: DEFAULT_CHANNEL_ID,
        type: "DELIVER",
        from: "price-watcher",
        to: "repro-verifier",
        artifactRef: { kind: "artifact", id: "a" },
        claim: "paced",
      },
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    // A handoff is a spawn. The minutes this used to wait between seats were
    // most of the wall time on a real run, with an empty channel to show for
    // them. `notBefore` stays, because a scheduled brief still needs an hour to
    // be queued against, but nothing pretends to be a person writing.
    expect(result.message.notBefore).toBe(result.message.createdAt);
    expect(harness.runtime.queue.claimReady(4)).toHaveLength(1);
  });

  it("gives human input zero delay", async () => {
    const harness = boot();
    await harness.runtime.start();
    const result = await harness.runtime.bus.publish({
      fromHuman: true,
      message: {
        id: "msg-human-fast",
        traceId: "trace-human-fast",
        depth: 0,
        channelId: DEFAULT_CHANNEL_ID,
        type: "REQUEST",
        from: "floor-intake",
        to: "price-watcher",
        needs: [{ kind: "task", id: "t1" }],
        dueBy: harness.clock.now() + MINUTE,
        instruction: "go",
      },
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.message.notBefore).toBe(result.message.createdAt);
  });
});

describe("directives", () => {
  it("attaches STEER to the trace and reports when it lands", async () => {
    const harness = boot();
    await harness.runtime.start();
    const submitted = await harness.runtime.submitTask({
      templateId: "office/price-patrol",
    });
    expect(submitted.ok).toBe(true);
    if (!submitted.ok) return;

    const applied = await harness.runtime.applyDirective({
      kind: "STEER",
      body: "Quote the source line every time",
      traceId: submitted.traceId,
    });
    expect(applied.ok).toBe(true);
    if (!applied.ok) return;
    expect(applied.etaMinutes).toBeGreaterThan(0);
    expect(harness.runtime.traces.get(submitted.traceId)?.steer).toContain(
      "Quote the source",
    );

    const inherited = harness.runtime.directives.effectiveFor(
      submitted.traceId,
      applied.appliesFrom,
    );
    expect(inherited.some((item) => item.kind === "STEER")).toBe(true);
  });

  it("ABORT stops the trace immediately and keeps partial output", async () => {
    const harness = boot();
    await harness.runtime.start();
    const submitted = await harness.runtime.submitTask({
      templateId: "office/price-patrol",
    });
    if (!submitted.ok) throw new Error(submitted.reason);
    const aborted = await harness.runtime.applyDirective({
      kind: "ABORT",
      body: "stop",
      traceId: submitted.traceId,
    });
    expect(aborted.ok).toBe(true);
    if (aborted.ok) expect(aborted.etaMinutes).toBe(0);
    expect(harness.runtime.traces.get(submitted.traceId)?.state).toBe(
      "aborted",
    );
    expect(harness.runtime.queue.pendingCount()).toBe(0);
  });

  it("PIN applies from now to every trace", async () => {
    const harness = boot();
    await harness.runtime.start();
    const pinned = await harness.runtime.applyDirective({
      kind: "PIN",
      body: "Never publish an unverified number",
    });
    expect(pinned.ok).toBe(true);
    if (pinned.ok) expect(pinned.etaMinutes).toBe(0);
    const applies = harness.runtime.directives.effectiveFor(
      "any-trace",
      harness.clock.now() + 1,
    );
    expect(applies.some((item) => item.kind === "PIN")).toBe(true);
  });
});

describe("deterministic gates run before the model", () => {
  it("fails the grep gate when a claimed number is absent from the source", async () => {
    const sourceLog = join(
      mkdtempSync(join(tmpdir(), "redrob-floor-src-")),
      "fetch.log",
    );
    writeFileSync(sourceLog, "openai gpt inputPerMTok 3.0\n", "utf8");
    const harness = boot({
      script: [
        {
          label: "watcher",
          match: (p) => p.includes("You are the Price Watcher"),
          steps: [
            {
              text: JSON.stringify({
                type: "DELIVER",
                to: "repro-verifier",
                artifactRef: {
                  kind: "file",
                  id: sourceLog,
                  label: "provider fetch log",
                },
                claim: 'the price is "3.50" per MTok',
              }),
            },
          ],
        },
        {
          label: "verifier",
          match: (p) => p.includes("You are the Repro Verifier"),
          steps: [
            {
              text: JSON.stringify({
                type: "CHALLENGE",
                to: "price-watcher",
                targetClaim: '"3.50"',
                evidenceRef: [
                  { kind: "log", id: "fetch.log", locator: "line 2" },
                ],
                alternative: "the log says 3.0",
              }),
            },
          ],
        },
      ],
    });
    await harness.runtime.start();
    await harness.runtime.submitTask({ templateId: "office/price-patrol" });
    await harness.advanceUntil(async () => {
      const seen = await readAudit({});
      return seen.some((event) => event.event === "gate.failed");
    });

    const events = await readAudit({});
    const gateEvent = events.find((event) => event.event === "gate.failed");
    expect(gateEvent).toBeDefined();
  });
});

describe("a goal typed at the channel", () => {
  it("reaches the lead, gets delegated, delivered, verified and approved", async () => {
    const filed: Array<{ path: string; title: string }> = [];
    const harness = boot({
      roster: DEFAULT_ROSTER,
      templates: BUILTIN_TASK_TEMPLATES,
      fileDeliverable: async (input) => {
        filed.push(input);
        return "artifact-1";
      },
      script: [
        {
          label: "manager-delegates",
          match: (p) =>
            p.includes("You are the Manager") && p.includes("offsite"),
          steps: [
            delegate(
              WRITER_ID,
              "Draft the one-page offsite plan and send it to review.",
            ),
            { text: "작가에게 넘겼어요." },
          ],
        },
        {
          label: "writer-delivers",
          match: (p) =>
            p.includes("You are the Writer") && p.includes("offsite plan"),
          steps: [
            {
              text: JSON.stringify({
                type: "DELIVER",
                to: REVIEWER_ID,
                artifactRef: {
                  kind: "file",
                  id: "plan.md",
                  label: "Offsite plan",
                },
                claim: "The offsite plan is written.",
              }),
            },
          ],
        },
        {
          label: "reviewer-escalates",
          match: (p) =>
            p.includes("You are the Reviewer") &&
            p.includes("Verify this delivery"),
          steps: [
            {
              text: JSON.stringify({
                type: "ESCALATE",
                reason: "The plan books a venue, which spends money.",
                options: ["Book the venue", "Keep looking"],
                evidenceRef: [
                  { kind: "file", id: "plan.md", locator: "line 4" },
                ],
              }),
            },
          ],
        },
      ],
    });
    await harness.runtime.start();

    const said = await harness.runtime.say(
      "Write a one-page plan for the Q3 offsite",
    );
    expect(said.ok).toBe(true);

    const landed = await harness.advanceUntil(
      async () => harness.runtime.tray.pendingCount() > 0,
      4 * 60 * MINUTE,
    );
    expect(landed).toBe(true);

    const posts = await harness.runtime.channel();
    // The words the person typed are in the channel as theirs, not as a template.
    const spoken = posts.find((post) => post.origin === "human");
    expect(spoken?.body).toContain("Q3 offsite");

    // The lead handed it to a named colleague rather than doing it. The handoff
    // is a tool call in its own loop now, so what proves it is that the writer
    // took a turn and the lead never touched a document tool.
    expect(harness.runtime.tasks.list().map((task) => task.staffId)).toContain(
      WRITER_ID,
    );

    // The delivery is a file the person can open from the channel.
    const delivered = posts.find((post) => post.type === "DELIVER");
    expect(delivered?.from).toBe(WRITER_ID);
    expect(delivered?.artifact?.artifactId).toBe("artifact-1");
    expect(filed).toHaveLength(1);

    // An escalation cannot be addressed to a person (I7), so it reaches the
    // channel as a tray note rather than as a message.
    const escalated = posts.find((post) => post.type === "approval.queued");
    expect(escalated?.from).toBe(REVIEWER_ID);

    const item = harness.runtime.tray.pending()[0];
    expect(item?.options).toHaveLength(2);
    expect(item).toBeDefined();
    const resolved = await harness.runtime.resolveApproval(
      item!.id,
      true,
      "Book the venue",
    );
    expect(resolved.ok).toBe(true);
    expect(resolved.pending).toBe(0);
  });

  // A bound route only records which model the office would call. On a machine
  // with GGUF weights but no llama-server binary installed, that binding
  // succeeds and the call underneath it cannot. The turn used to die mid-flight
  // and reach the channel as "Handler crashed: ERR_LLAMA_SERVER_NOT_STARTED",
  // which reads as a bug in the office rather than as a missing install.
  it("refuses in words when the bound route cannot serve a call", async () => {
    const harness = boot({
      roster: DEFAULT_ROSTER,
      templates: BUILTIN_TASK_TEMPLATES,
      withoutScriptedModel: true,
      inferenceReady: async () => ({
        ok: false,
        reason: "The local model cannot start: no GPU backend is installed.",
      }),
    });
    harness.runtime.setInference({
      providers: {},
      provider: "local",
      model: "local",
    });
    await harness.runtime.start();

    const said = await harness.runtime.say(
      "Write a one-page plan for the Q3 offsite",
    );
    expect(said.ok).toBe(true);

    const failed = await harness.advanceUntil(async () =>
      (await harness.runtime.channel()).some(
        (post) => post.type === "task.failed",
      ),
    );
    expect(failed).toBe(true);

    const posts = await harness.runtime.channel();
    const note = posts.find((post) => post.type === "task.failed");
    expect(note?.body).toContain("no GPU backend is installed");
    expect(posts.some((post) => post.body.includes("Handler crashed"))).toBe(
      false,
    );
  });
});

describe("channels", () => {
  it("starts with one office channel that cannot be deleted", () => {
    const harness = boot();
    const channels = harness.runtime.listChannels();
    expect(channels).toHaveLength(1);
    expect(channels[0]?.id).toBe(DEFAULT_CHANNEL_ID);
    expect(channels[0]?.system).toBe(true);
    expect(channels[0]?.memberIds).toEqual(["assistant"]);
    // A room with only Redrob in it is still a room, not a chat with Redrob.
    expect(channels[0]?.isDM).toBe(false);

    const removed = harness.runtime.deleteChannel(DEFAULT_CHANNEL_ID);
    expect(removed.ok).toBe(false);
    expect(harness.runtime.listChannels()).toHaveLength(1);
  });

  it("seeds the built-in assistant teammate", () => {
    const harness = boot();
    const members = harness.runtime.teamMembers.list();
    expect(members.some((member) => member.id === "assistant")).toBe(true);
  });

  it("turns a persona into an addressable skill seat", () => {
    const harness = boot();
    const created = harness.runtime.addTeamMember({
      id: "market-analyst",
      name: "Market Analyst",
      persona: "Compare markets and cite every claim.",
      toneHints: "Lead with the conclusion.",
      permission: "read",
    });

    expect(created.ok).toBe(true);
    const seat = harness.runtime.roster.find(
      (member) => member.id === "market-analyst",
    );
    expect(seat?.role).toBe("Market Analyst");
    expect(seat?.tools).toContain("web.search");
    expect(seat?.scope).toContain("Compare markets");
    expect(seat?.scope).toContain("Lead with the conclusion");
  });

  // Read means read: a teammate on that setting cannot touch the disk or the
  // machine however the model is asked.
  it("keeps a read-only teammate away from writing and the shell", () => {
    const harness = boot();
    harness.runtime.addTeamMember({
      id: "market-analyst",
      name: "Market Analyst",
      persona: "Compare markets.",
      permission: "read",
    });

    const seat = harness.runtime.roster.find(
      (member) => member.id === "market-analyst",
    );
    expect(seat?.tools).toContain("fs.read");
    expect(seat?.tools).not.toContain("fs.write");
    expect(seat?.tools).not.toContain("shell.exec");
  });

  // Nobody has to pick a reach to add somebody, so the default has to be a
  // teammate you can hand work to: read, search and write.
  it("gives a teammate write tools when nobody chose a permission", () => {
    const harness = boot();
    const created = harness.runtime.addTeamMember({
      id: "copywriter",
      name: "Copywriter",
      persona: "Write the launch note.",
    });
    expect(created.ok).toBe(true);

    const seat = harness.runtime.roster.find(
      (member) => member.id === "copywriter",
    );
    expect(seat?.tools).toContain("fs.write");
    expect(seat?.tools).toContain("web.search");
    expect(seat?.tools).not.toContain("shell.exec");
  });

  it("hands the full reach the machine and the network", () => {
    const harness = boot();
    harness.runtime.addTeamMember({
      id: "operator",
      name: "Operator",
      persona: "Run the build.",
      permission: "full",
    });

    const seat = harness.runtime.roster.find(
      (member) => member.id === "operator",
    );
    expect(seat?.tools).toContain("shell.exec");
    expect(seat?.tools).toContain("net.httpPost");
    expect(seat?.tools).toContain("fs.write");
    // Eyes after opening a browser — otherwise Calendar stays a blank window.
    expect(seat?.tools).toContain("screen.capture");
    expect(seat?.tools).toContain("app.launch");
  });

  // Everybody is in the default channel; the rooms somebody made are invited.
  it("puts everybody in the default channel and only invites into the rest", () => {
    const harness = boot();
    harness.runtime.addTeamMember({
      id: "market-analyst",
      name: "Market Analyst",
      persona: "Compare markets.",
    });

    const general = harness.runtime
      .listChannels()
      .find((channel) => channel.id === DEFAULT_CHANNEL_ID);
    expect(general?.memberIds).toEqual(["assistant", "market-analyst"]);
    // The assistant still answers what nobody addressed.
    expect(general?.defaultMemberId).toBe("assistant");
    expect(general?.isDM).toBe(false);

    // Nobody can be shown out of the room everybody is in.
    expect(
      harness.runtime.removeFromChannel(DEFAULT_CHANNEL_ID, "market-analyst")
        .ok,
    ).toBe(false);

    const room = harness.runtime.createChannel({
      name: "q3-plan",
      purpose: "Everything about Q3.",
    });
    expect(room.ok).toBe(true);
    if (!room.ok) return;
    expect(room.channel.memberIds).toEqual(["assistant"]);
    // A new room holds only Redrob and is still a room: opening it must not
    // look like a one-to-one chat with Redrob.
    expect(room.channel.isDM).toBe(false);

    const removed = harness.runtime.removeFromChannel(
      room.channel.id,
      "market-analyst",
    );
    expect(removed.ok).toBe(true);
    // A room with nobody in it has nowhere to send what you say.
    expect(
      harness.runtime.removeFromChannel(room.channel.id, "assistant").ok,
    ).toBe(false);
  });

  it("keeps one chat per teammate, out of the channel list", () => {
    const harness = boot();
    harness.runtime.addTeamMember({
      id: "market-analyst",
      name: "Market Analyst",
      persona: "Compare markets.",
    });

    const opened = harness.runtime.ensureDmChannel("market-analyst");
    expect(opened.ok).toBe(true);
    if (!opened.ok) return;
    expect(opened.channel.memberIds).toEqual(["market-analyst"]);
    expect(opened.channel.isDM).toBe(true);
    expect(opened.channel.defaultMemberId).toBe("market-analyst");

    const again = harness.runtime.ensureDmChannel("market-analyst");
    expect(again.ok).toBe(true);
    if (again.ok) expect(again.channel.id).toBe(opened.channel.id);
    // A chat with a person is not a room, so it is not in the room list.
    expect(harness.runtime.listChannels()).toHaveLength(1);
    expect(harness.runtime.deleteChannel(opened.channel.id).ok).toBe(false);

    expect(harness.runtime.ensureDmChannel("nobody").ok).toBe(false);
  });

  it("deactivates the person but keeps their messages and chat", () => {
    const harness = boot();
    harness.runtime.addTeamMember({
      id: "market-analyst",
      name: "Market Analyst",
      persona: "Compare markets.",
    });
    const opened = harness.runtime.ensureDmChannel("market-analyst");
    expect(opened.ok).toBe(true);
    if (!opened.ok) return;

    expect(harness.runtime.removeTeamMember("market-analyst").ok).toBe(true);
    // Deactivated, not deleted: the row stays so old messages keep a name.
    const still = harness.runtime.teamMembers.get("market-analyst");
    expect(still?.active).toBe(false);
    // Gone from the working roster and the pickers.
    expect(
      harness.runtime.teamMembers
        .listActive()
        .some((member) => member.id === "market-analyst"),
    ).toBe(false);
    // Their one-to-one chat survives as history rather than being wiped.
    expect(harness.runtime.channels.get(opened.channel.id)).not.toBeNull();
    // They have left #general so nothing routes to them any more.
    expect(
      harness.runtime
        .listChannels()
        .find((channel) => channel.id === DEFAULT_CHANNEL_ID)?.memberIds,
    ).toEqual(["assistant"]);
  });

  it("normalises the name a person types and refuses a duplicate", () => {
    const harness = boot();
    const created = harness.runtime.createChannel({
      name: "  Q3 Hiring Plan!  ",
      purpose: "Everything about the Q3 backend req.",
    });
    expect(created.ok).toBe(true);
    if (created.ok) expect(created.channel.name).toBe("q3-hiring-plan");

    const clash = harness.runtime.createChannel({
      name: "Q3 hiring plan",
      purpose: "",
    });
    expect(clash.ok).toBe(false);

    // A name made entirely of punctuation leaves nothing to address.
    expect(harness.runtime.createChannel({ name: "!!!", purpose: "" }).ok).toBe(
      false,
    );
  });

  // The audit log is one office-wide file, so a channel opened this afternoon
  // used to be handed this morning's crashes the moment it was created. An
  // empty new room reading "Handler crashed" looks like a broken office.
  it("shows a new channel nothing from before it existed", async () => {
    const harness = boot();
    await harness.advance(MINUTE);
    await appendAudit({
      kind: "error",
      event: "task.failed",
      clock: harness.clock,
      resultSummary: "Handler crashed: ERR_LLAMA_SERVER_NOT_STARTED",
    });

    const office = await harness.runtime.channel(DEFAULT_CHANNEL_ID);
    expect(office.some((post) => post.body.includes("Handler crashed"))).toBe(
      true,
    );

    await harness.advance(MINUTE);
    const created = harness.runtime.createChannel({
      name: "fresh",
      purpose: "",
    });
    expect(created.ok).toBe(true);
    if (!created.ok) return;

    expect(await harness.runtime.channel(created.channel.id)).toEqual([]);
  });

  // A note about work that happened elsewhere is somebody else's news.
  it("keeps a trace-bound event in the channel its trace spoke in", async () => {
    const harness = boot();
    const created = harness.runtime.createChannel({
      name: "quiet",
      purpose: "",
    });
    expect(created.ok).toBe(true);
    if (!created.ok) return;

    await harness.advance(MINUTE);
    await appendAudit({
      kind: "error",
      event: "task.failed",
      clock: harness.clock,
      traceId: "trace-somewhere-else",
      resultSummary: "Handler crashed: nothing to do with this room",
    });

    expect(await harness.runtime.channel(created.channel.id)).toEqual([]);
  });

  it("keeps a goal and everything derived from it in the channel it was said in", async () => {
    const harness = boot({
      roster: DEFAULT_ROSTER,
      templates: BUILTIN_TASK_TEMPLATES,
      script: [
        {
          label: "manager-delegates",
          match: (p) => p.includes("You are the Manager"),
          steps: [
            {
              text: JSON.stringify({
                type: "REQUEST",
                to: WRITER_ID,
                needs: [{ kind: "task", id: "offsite", label: "offsite plan" }],
                dueByMinutes: 30,
                instruction: "Draft the plan.",
              }),
            },
          ],
        },
      ],
    });
    await harness.runtime.start();
    const created = harness.runtime.createChannel({
      name: "hiring",
      purpose: "Backend reqs.",
    });
    expect(created.ok).toBe(true);
    if (!created.ok) return;

    const said = await harness.runtime.say(
      "Plan the Q3 offsite",
      created.channel.id,
    );
    expect(said.ok).toBe(true);
    await harness.advanceUntil(async () =>
      (await harness.runtime.channel(created.channel.id)).some(
        (post) => post.from === MANAGER_ID && post.type === "REQUEST",
      ),
    );

    const inHiring = await harness.runtime.channel(created.channel.id);
    expect(inHiring.some((post) => post.origin === "human")).toBe(true);
    expect(inHiring.some((post) => post.from === MANAGER_ID)).toBe(true);

    // The office channel never saw any of it.
    const inOffice = await harness.runtime.channel(DEFAULT_CHANNEL_ID);
    expect(inOffice.some((post) => post.kind === "message")).toBe(false);
  });

  it("tells the office what a channel is for without putting it in the bubble", async () => {
    const prompts: string[] = [];
    const harness = boot({
      roster: DEFAULT_ROSTER,
      templates: BUILTIN_TASK_TEMPLATES,
      script: [
        {
          label: "capture",
          match: (p) => {
            prompts.push(p);
            return true;
          },
          steps: [
            {
              text: JSON.stringify({
                type: "BLOCK",
                reason: "n/a",
                unblockCondition: "n/a",
              }),
            },
          ],
        },
      ],
    });
    await harness.runtime.start();
    const created = harness.runtime.createChannel({
      name: "legal",
      purpose: "Contract review only.",
    });
    if (!created.ok) return;

    await harness.runtime.say("Check this NDA", created.channel.id);
    await harness.advanceUntil(() => prompts.length > 0);

    // The model is told the channel's purpose and the intake standing orders.
    const prompt = prompts.join("\n");
    expect(prompt).toContain("Contract review only.");
    expect(prompt).toContain("send one REQUEST per step");
    // And told the purpose is background. Handed over as what the channel is
    // for, it became a brief the lead measured the goal against, so a question
    // in a planning channel came back refused for being off-topic.
    expect(prompt).toContain("It does not narrow the goal");

    // The reader gets back exactly what they typed.
    const posts = await harness.runtime.channel(created.channel.id);
    const spoken = posts.find((post) => post.origin === "human");
    expect(spoken?.body).toBe("Check this NDA");
    expect(spoken?.body).not.toContain("send one REQUEST per step");
    expect(spoken?.body).not.toContain("Contract review only.");
  });

  // A dropped file used to have nowhere to go: the floor took text and nothing
  // else, so a pasted CSV was either pasted into the channel by hand or lost.
  it("gives a seat the attached file without pasting it into the channel", async () => {
    const prompts: string[] = [];
    const harness = boot({
      roster: DEFAULT_ROSTER,
      templates: BUILTIN_TASK_TEMPLATES,
      script: [
        {
          label: "capture",
          match: (p) => {
            prompts.push(p);
            return true;
          },
          steps: [
            { text: JSON.stringify({ type: "ANSWER", text: "봤어요." }) },
          ],
        },
      ],
    });
    await harness.runtime.start();

    const attached = [
      "<<<UNTRUSTED_ATTACHED_FILES>>>",
      "--- File: q3.csv (18 chars) ---",
      "quarter,revenue\nQ3,7",
      "<<<END_UNTRUSTED_ATTACHED_FILES>>>",
    ].join("\n");
    await harness.runtime.say(
      "이거 좀 봐줘",
      DEFAULT_CHANNEL_ID,
      undefined,
      attached,
    );
    await harness.advanceUntil(() => prompts.length > 0);

    const prompt = prompts.join("\n");
    expect(prompt).toContain("quarter,revenue");
    // Marked as data, because a file can carry instructions aimed at the model.
    expect(prompt).toContain("UNTRUSTED_ATTACHED_FILES");

    // The channel shows what was said, not the contents of the spreadsheet.
    const posts = await harness.runtime.channel(DEFAULT_CHANNEL_ID);
    const spoken = posts.find((post) => post.origin === "human");
    expect(spoken?.body).toBe("이거 좀 봐줘");
    expect(spoken?.body).not.toContain("quarter,revenue");
  });

  // Handing "좋은 아침" to a manager told to break a goal into assigned steps
  // produced an essay about why a greeting cannot be broken into steps, and then
  // an approval card carrying that essay as its headline.
  it("greets back rather than asking a manager to plan a greeting", async () => {
    const prompts: string[] = [];
    const harness = boot({
      roster: DEFAULT_ROSTER,
      templates: BUILTIN_TASK_TEMPLATES,
      script: [
        {
          label: "capture",
          match: (p) => {
            prompts.push(p);
            return true;
          },
          steps: [
            {
              text: JSON.stringify({
                type: "ESCALATE",
                reason: "There is no concrete task to break down.",
                options: ["a", "b"],
              }),
            },
          ],
        },
      ],
    });
    await harness.runtime.start();

    const said = await harness.runtime.say("좋은 아침");
    expect(said.ok).toBe(true);

    const answered = await harness.advanceUntil(async () =>
      (await harness.runtime.channel()).some(
        (post) => post.type === "floor.greeted",
      ),
    );
    expect(answered).toBe(true);

    const posts = await harness.runtime.channel();
    // Their words are in the room as their own.
    expect(posts.find((post) => post.origin === "human")?.body).toBe(
      "좋은 아침",
    );
    // The reply travels as a kind, not a sentence, so the channel can word it.
    expect(posts.find((post) => post.type === "floor.greeted")?.detail).toBe(
      "greeting",
    );
    // No model was asked to plan anything, so nothing can be said about why a
    // greeting is not a deliverable, and no card is waiting on the reader.
    expect(prompts).toEqual([]);
    expect(harness.runtime.tray.pendingCount()).toBe(0);
  });

  it("still sends a greeting with an ask attached to the manager", async () => {
    const prompts: string[] = [];
    const harness = boot({
      roster: DEFAULT_ROSTER,
      templates: BUILTIN_TASK_TEMPLATES,
      script: [
        {
          label: "capture",
          match: (p) => {
            prompts.push(p);
            return true;
          },
          steps: [
            {
              text: JSON.stringify({
                type: "BLOCK",
                reason: "n/a",
                unblockCondition: "n/a",
              }),
            },
          ],
        },
      ],
    });
    await harness.runtime.start();

    await harness.runtime.say("안녕하세요, NDA 검토 부탁해요");
    await harness.advanceUntil(() => prompts.length > 0);

    expect(prompts.join("\n")).toContain("send one REQUEST per step");
  });

  // A bare "야" used to be handed to a decomposer whose only exits were BLOCK and
  // ESCALATE, so the reader got the model's account of why their line was not a
  // deliverable, in its own language, with a card asking them to approve the
  // argument. A conversation has no such exit: it just answers.
  it("answers a bare greeting instead of asking what the deliverable is", async () => {
    const harness = boot({
      roster: DEFAULT_ROSTER,
      templates: BUILTIN_TASK_TEMPLATES,
      script: [
        {
          label: "greets back",
          match: (p) => p.includes("You are the Manager"),
          steps: [{ text: "네, 말씀하세요." }],
        },
      ],
    });
    await harness.runtime.start();

    await harness.runtime.say("야");
    const answered = await harness.advanceUntil(async () =>
      (await harness.runtime.channel()).some(
        (post) => post.body === "네, 말씀하세요.",
      ),
    );
    expect(answered).toBe(true);

    const posts = await harness.runtime.channel();
    // Their words are theirs, and nothing under them names the office's filing
    // system back at them.
    const spoken = posts.find((post) => post.origin === "human");
    expect(spoken?.body).toBe("야");
    expect(spoken?.detail).toBe("");
    // Nobody was asked what the goal was, and nothing landed in the tray.
    expect(posts.some((post) => post.type === "floor.needsGoal")).toBe(false);
    expect(harness.runtime.tray.pendingCount()).toBe(0);
  });

  // Assigning was once the only way out of an intake turn, so a question had to
  // be forced into the shape of a project, and a manager that could see it was
  // not one had nothing to answer with but a refusal.
  it("answers a question rather than making a project out of it", async () => {
    const answer = "오늘 서울은 맑고 28도예요.";
    const harness = boot({
      roster: DEFAULT_ROSTER,
      templates: BUILTIN_TASK_TEMPLATES,
      script: [
        {
          label: "answer",
          match: (p) => p.includes("You are the Manager"),
          // Talking to a person is prose. There is no envelope to put it in.
          steps: [{ text: answer }],
        },
      ],
    });
    await harness.runtime.start();

    await harness.runtime.say("오늘 날씨 뭐냐 좀 알려줘라");
    const spoke = await harness.advanceUntil(async () =>
      (await harness.runtime.channel()).some((post) => post.body === answer),
    );
    expect(spoke).toBe(true);

    const posts = await harness.runtime.channel();
    // It came from the manager, in the language it was asked in, and it did not
    // become somebody's assignment or a card for the reader to approve.
    expect(posts.find((post) => post.body === answer)?.from).toBe(MANAGER_ID);
    // The reader's own line is the intake REQUEST, so what must not exist is one
    // the manager handed on to a seat.
    expect(
      posts.some((post) => post.type === "REQUEST" && post.from === MANAGER_ID),
    ).toBe(false);
    expect(harness.runtime.tray.pendingCount()).toBe(0);
  });

  // Every `say` used to open its own trace, so a second line was a rival job
  // that knew nothing about the first. Answering a question with "뭐라고?" put a
  // fresh manager in front of a greeting with no goal in it, and the reply came
  // back as a refusal to plan one.
  it("hands a line typed mid-turn to the work already running", async () => {
    const seen: string[][] = [];
    const scripted = new ScriptedModel([
      {
        label: "answers twice",
        match: (p) => p.includes("You are the Manager"),
        steps: [{ text: "네, 볼게요." }, { text: "이번 주만 보면요." }],
      },
    ]).asModelCall();
    let interjected = false;
    let harness: Harness;
    harness = boot({
      roster: DEFAULT_ROSTER,
      templates: BUILTIN_TASK_TEMPLATES,
      callModel: async (input) => {
        // Said while this very call is outstanding, which is the case the
        // composer creates and nothing else can reproduce as reliably.
        if (!interjected) {
          interjected = true;
          await harness.runtime.say("아니 이번 주만");
        }
        seen.push(input.messages.map((message) => String(message.content)));
        return scripted(input);
      },
    });
    await harness.runtime.start();

    await harness.runtime.say("매출 좀 보자");
    const answered = await harness.advanceUntil(async () =>
      (await harness.runtime.channel()).some(
        (post) => post.body === "이번 주만 보면요.",
      ),
    );
    expect(answered).toBe(true);

    // The interjection reached the seat inside the turn that was already
    // running, rather than after it or beside it.
    expect(seen.length).toBeGreaterThan(1);
    expect(seen[1]?.some((text) => text.includes("아니 이번 주만"))).toBe(true);

    const posts = await harness.runtime.channel();
    const mine = posts.filter((post) => post.origin === "human");
    expect(mine.map((post) => post.body)).toEqual([
      "매출 좀 보자",
      "아니 이번 주만",
    ]);
    // One conversation, so one trace: both lines and the answer belong to it.
    expect(new Set(mine.map((post) => post.traceId)).size).toBe(1);
    // And the second line did not put a second job on anybody's desk.
    expect(
      harness.runtime.tasks
        .list()
        .filter((task) => task.templateId === INTAKE_TEMPLATE_ID).length,
    ).toBe(1);
  });

  // Naming a seat is the person making the assignment themselves, so the lead
  // has nothing left to decide and is not asked to.
  it("takes a tagged goal straight to that seat", async () => {
    const harness = boot({
      roster: DEFAULT_ROSTER,
      templates: BUILTIN_TASK_TEMPLATES,
      script: [
        {
          label: "researcher answers",
          match: (p) => p.includes("You are the Researcher"),
          steps: [{ text: "찾았어요." }],
        },
      ],
    });
    await harness.runtime.start();

    await harness.runtime.say(
      "이거 좀 찾아봐",
      DEFAULT_CHANNEL_ID,
      RESEARCHER_ID,
    );
    const answered = await harness.advanceUntil(async () =>
      (await harness.runtime.channel()).some(
        (post) => post.body === "찾았어요.",
      ),
    );
    expect(answered).toBe(true);

    const posts = await harness.runtime.channel();
    expect(posts.find((post) => post.body === "찾았어요.")?.from).toBe(
      RESEARCHER_ID,
    );
    // The lead was skipped: no desk of its own, and nothing for it to plan.
    expect(
      harness.runtime.tasks.list().map((task) => task.staffId),
    ).not.toContain(MANAGER_ID);
  });

  it("lets permission-scoped agents mention each other in one channel", async () => {
    const harness = boot({
      roster: DEFAULT_ROSTER,
      templates: BUILTIN_TASK_TEMPLATES,
      script: [
        {
          label: "agent 1 mentions agent 2",
          match: (p) => p.includes("You are Agent 1,"),
          steps: [
            delegate(
              "agent-2",
              "Draft the findings.",
              "Needs a concise draft.",
            ),
            { text: "Agent 2 drafted it." },
          ],
        },
        {
          label: "agent 2 mentions agent 3",
          match: (p) => p.includes("You are Agent 2,"),
          steps: [
            delegate(
              "agent-3",
              "Check the draft.",
              "Needs an independent check.",
            ),
            {
              text: JSON.stringify({
                type: "ANSWER",
                text: "Draft checked and ready.",
              }),
            },
          ],
        },
        {
          label: "agent 3 answers",
          match: (p) => p.includes("You are Agent 3,"),
          steps: [
            {
              text: JSON.stringify({
                type: "ANSWER",
                text: "The draft passes.",
              }),
            },
          ],
        },
      ],
    });
    for (const member of [
      {
        id: "agent-1",
        name: "Agent 1",
        persona: "Coordinate this request without job titles.",
        permission: "read" as const,
      },
      {
        id: "agent-2",
        name: "Agent 2",
        persona: "Create the requested output.",
        permission: "write" as const,
      },
      {
        id: "agent-3",
        name: "Agent 3",
        persona: "Use all available tools when needed.",
        permission: "full" as const,
      },
    ]) {
      expect(harness.runtime.addTeamMember(member).ok).toBe(true);
    }
    await harness.runtime.start();

    await harness.runtime.say(
      "조사해서 초안을 확인해줘",
      DEFAULT_CHANNEL_ID,
      "agent-1",
    );
    const answered = await harness.advanceUntil(async () =>
      (await harness.runtime.channel()).some(
        (post) => post.body === "Agent 2 drafted it.",
      ),
    );
    expect(answered).toBe(true);

    const delegateEvents = harness.runtime.channelEvents
      .list(DEFAULT_CHANNEL_ID)
      .filter((event) => event.type === "delegate");
    expect(
      delegateEvents.map((event) => ({
        from: event.authorId,
        to: event.payload["to"],
        permission: event.payload["permission"],
        task: event.payload["task"],
      })),
    ).toEqual([
      {
        from: "agent-1",
        to: "agent-2",
        permission: "write",
        task: "Draft the findings.",
      },
      {
        from: "agent-2",
        to: "agent-3",
        permission: "full",
        task: "Check the draft.",
      },
    ]);
    const agentReplies = harness.runtime.channelEvents
      .list(DEFAULT_CHANNEL_ID)
      .filter(
        (event) =>
          event.type === "message" &&
          ["agent-1", "agent-2", "agent-3"].includes(event.authorId),
      )
      .map((event) => ({
        from: event.authorId,
        text: event.payload["text"],
      }));
    expect(agentReplies).toEqual([
      { from: "agent-3", text: "The draft passes." },
      { from: "agent-2", text: "Draft checked and ready." },
      { from: "agent-1", text: "Agent 2 drafted it." },
    ]);
  });

  it("refuses a goal aimed at a seat that is not on the floor", async () => {
    const harness = boot({
      roster: DEFAULT_ROSTER,
      templates: BUILTIN_TASK_TEMPLATES,
    });
    await harness.runtime.start();

    const said = await harness.runtime.say(
      "이거 해줘",
      DEFAULT_CHANNEL_ID,
      "nobody",
    );
    expect(said.ok).toBe(false);
  });

  // Held at the sampler rather than asked for in the prompt. The tool loop
  // cannot be constrained - a grammar leaves no room for a tool call - so the
  // hold goes on the one turn that has to be typed, and only once it is clear
  // the model did not type it on its own.
  it("takes the answer again under grammar when the first one cannot be read", async () => {
    const seen: Array<{ grammar: boolean; tools: number }> = [];
    const scripted = new ScriptedModel([
      // Talking to the person is prose, so the shape is only ever held on the
      // seat doing the work: that answer has to route.
      {
        label: "lead hands it on",
        match: (p) => p.includes("You are the Manager"),
        steps: [delegate(RESEARCHER_ID, "오늘 서울 날씨"), { text: "맑아요." }],
      },
      {
        label: "prose then typed",
        match: (p) => p.includes("You are the Researcher"),
        steps: [
          { text: "I'll have a look at the weather for you." },
          { text: JSON.stringify({ type: "ANSWER", text: "맑아요." }) },
        ],
      },
    ]).asModelCall();
    const harness = boot({
      roster: DEFAULT_ROSTER,
      templates: BUILTIN_TASK_TEMPLATES,
      callModel: async (input) => {
        if (
          input.messages.some((message) =>
            String(message.content).includes("You are the Researcher"),
          )
        ) {
          seen.push({
            grammar: Boolean(input.grammar),
            tools: input.tools.length,
          });
        }
        return scripted(input);
      },
    });
    await harness.runtime.start();

    await harness.runtime.say("오늘 날씨 뭐냐");
    const answered = await harness.advanceUntil(async () =>
      (await harness.runtime.channel()).some((post) => post.body === "맑아요."),
    );
    expect(answered).toBe(true);

    // The working turn keeps its tools and no grammar; the retake is the exact
    // opposite, because the two cannot be held at once.
    expect(seen[0]).toEqual({ grammar: false, tools: expect.any(Number) });
    expect(seen[0]?.tools).toBeGreaterThan(0);
    expect(seen[1]).toEqual({ grammar: true, tools: 0 });
  });

  // A server that will not compile the grammar refuses the call outright, and
  // that refusal ended the run: the seat crashed on the one turn the grammar was
  // there to rescue. Asked plainly instead, the contract still has to parse.
  it("asks again without the grammar when the sampler refuses it", async () => {
    const seen: boolean[] = [];
    const scripted = new ScriptedModel([
      {
        label: "lead hands it on",
        match: (p) => p.includes("You are the Manager"),
        steps: [delegate(RESEARCHER_ID, "오늘 서울 날씨"), { text: "맑아요." }],
      },
      {
        label: "prose then typed",
        match: (p) => p.includes("You are the Researcher"),
        steps: [
          { text: "I'll have a look at the weather for you." },
          { text: JSON.stringify({ type: "ANSWER", text: "맑아요." }) },
        ],
      },
    ]).asModelCall();
    const harness = boot({
      roster: DEFAULT_ROSTER,
      templates: BUILTIN_TASK_TEMPLATES,
      callModel: async (input) => {
        const forResearcher = input.messages.some((message) =>
          String(message.content).includes("You are the Researcher"),
        );
        if (forResearcher) seen.push(Boolean(input.grammar));
        if (input.grammar) {
          throw new Error(
            "openai chat failed: HTTP 400 Bad Request — Failed to initialize samplers: failed to parse grammar",
          );
        }
        return scripted(input);
      },
    });
    await harness.runtime.start();

    await harness.runtime.say("오늘 날씨 뭐냐");
    const answered = await harness.advanceUntil(async () =>
      (await harness.runtime.channel()).some((post) => post.body === "맑아요."),
    );
    expect(answered).toBe(true);
    expect(seen).toEqual([false, true, false]);
  });

  // Asked for today's weather, both the lead and the researcher answered that
  // they had no tool for it - correctly, because the floor's only outbound tool
  // was a POST, while the chat panel beside it searched the same question. The
  // seat has to be handed the tool before its answer can change.
  it("hands a seat the means to look something up", async () => {
    const seen: string[][] = [];
    const scripted = new ScriptedModel([
      {
        label: "answers",
        match: (p) => p.includes("You are the Manager"),
        steps: [{ text: "맑아요." }],
      },
    ]).asModelCall();
    const harness = boot({
      roster: DEFAULT_ROSTER,
      templates: BUILTIN_TASK_TEMPLATES,
      callModel: async (input) => {
        seen.push(input.tools.map((tool) => tool.name));
        return scripted(input);
      },
    });
    await harness.runtime.start();

    await harness.runtime.say("오늘 날씨 어때");
    await harness.advanceUntil(async () =>
      (await harness.runtime.channel()).some((post) => post.body === "맑아요."),
    );

    expect(seen[0]).toContain("web.search");
    expect(seen[0]).toContain("web.fetch");
  });

  // One switch for the whole app: a person who turned search off in the chat
  // composer has turned it off for the office too, and would not think to look
  // for a second setting.
  it("withholds it when the person has web search switched off", async () => {
    const seen: string[][] = [];
    const scripted = new ScriptedModel([
      {
        label: "answers",
        match: (p) => p.includes("You are the Manager"),
        steps: [{ text: "못 찾았어요." }],
      },
    ]).asModelCall();
    const harness = boot({
      roster: DEFAULT_ROSTER,
      templates: BUILTIN_TASK_TEMPLATES,
      webSearchAllowed: () => false,
      callModel: async (input) => {
        seen.push(input.tools.map((tool) => tool.name));
        return scripted(input);
      },
    });
    await harness.runtime.start();

    await harness.runtime.say("오늘 날씨 어때");
    await harness.advanceUntil(async () =>
      (await harness.runtime.channel()).some(
        (post) => post.body === "못 찾았어요.",
      ),
    );

    expect(seen[0]).not.toContain("web.search");
    expect(seen[0]).not.toContain("web.fetch");
    // Withholding one capability must not quietly take the others away.
    expect(seen[0]).toContain("fs.read");
  });

  // A broken turn is the office breaking, not the office having something to
  // say. It used to be published as the manager's own reply, so a question got
  // back "Unusable output: needs.0: Invalid input: expected object, received
  // string" from a colleague tagging itself, in a language the reader had not
  // been writing in. Prose cannot fail to parse, so the one way a conversation
  // still breaks is a turn that came back with nothing at all.
  it("owns an empty answer instead of quoting the validator", async () => {
    const harness = boot({
      roster: DEFAULT_ROSTER,
      templates: BUILTIN_TASK_TEMPLATES,
      script: [
        {
          label: "says nothing",
          match: (p) => p.includes("You are the Manager"),
          steps: [{ text: "   " }],
        },
      ],
    });
    await harness.runtime.start();

    await harness.runtime.say("오늘 날씨 뭐냐 좀 알려줘라");
    const owned = await harness.advanceUntil(async () =>
      (await harness.runtime.channel()).some(
        (post) => post.type === "floor.glitch",
      ),
    );
    expect(owned).toBe(true);

    const posts = await harness.runtime.channel();
    expect(posts.find((post) => post.type === "floor.glitch")?.detail).toBe("");
    expect(posts.some((post) => post.body.includes("Unusable output"))).toBe(
      false,
    );
    expect(posts.some((post) => post.body.includes("Invalid input"))).toBe(
      false,
    );
    expect(harness.runtime.tray.pendingCount()).toBe(0);
  });

  // A seat that keeps calling tools until its budget is gone used to return
  // whatever prose was in flight, which the seat that delegated to it cannot
  // read. Asked for a spreadsheet of new models, it searched until it ran out
  // and the person got an apology instead of the work.
  it("still ends in a typed message when the iterations run out", async () => {
    let looked = "";
    let turns = 0;
    let handedBack = "";
    const harness = boot({
      roster: DEFAULT_ROSTER,
      templates: BUILTIN_TASK_TEMPLATES,
      callModel: async (input) => {
        const prompt = input.messages
          .map((message) => String(message.content))
          .join("\n");
        if (prompt.includes("You are the Manager")) {
          // Talking to the person: hand it on, then say what came back.
          if (turns === 0) {
            return {
              text: "",
              timingMs: 0,
              modelId: "fixture",
              provider: "openrouter" as const,
              finishReason: "tool_calls" as const,
              toolCalls: [
                {
                  id: "hand-on",
                  name: "agents.mention",
                  arguments: JSON.stringify({
                    to: RESEARCHER_ID,
                    task: "올해 나온 모델을 날짜와 함께 정리해줘.",
                    reason: "Research tools.",
                  }),
                },
              ],
            };
          }
          handedBack = prompt;
          return {
            text: "조사 결과 정리했어요.",
            timingMs: 0,
            modelId: "fixture",
            provider: "openrouter" as const,
            finishReason: "stop" as const,
          };
        }
        // The retake is the one call made with no tools on it.
        if (input.tools.length === 0) {
          return {
            text: JSON.stringify({
              type: "ANSWER",
              text: "올해 나온 모델은 아직 확인 중이에요.",
            }),
            timingMs: 0,
            modelId: "fixture",
            provider: "openrouter" as const,
            finishReason: "stop" as const,
          };
        }
        turns += 1;
        return {
          text: "Still looking.",
          timingMs: 0,
          modelId: "fixture",
          provider: "openrouter" as const,
          finishReason: "tool_calls" as const,
          toolCalls: [
            {
              id: `look-${turns}`,
              name: "fs.list",
              arguments: JSON.stringify({ path: looked }),
            },
          ],
        };
      },
    });
    looked = harness.workspace;
    await harness.runtime.start();

    await harness.runtime.say("최근 새로 나온 AI 모델들을 조사해줘라");
    const answered = await harness.advanceUntil(async () =>
      (await harness.runtime.channel()).some(
        (post) => post.body === "조사 결과 정리했어요.",
      ),
    );
    expect(answered, "the lead never answered the person").toBe(true);
    // It really did run out rather than stopping early, and what came back was
    // the typed answer rather than the prose that happened to be in flight.
    expect(turns).toBeGreaterThan(1);
    expect(handedBack).toContain("올해 나온 모델은 아직 확인 중이에요.");
    expect(handedBack).not.toContain("Still looking.");
    expect(
      (await harness.runtime.channel()).some(
        (post) => post.type === "floor.glitch",
      ),
    ).toBe(false);
  });

  // Two failures in a row produced the same apology twice, which reads as an
  // office that only ever misses things: "왜 계속 놏치기만 하냐".
  it("says something else when it fails a second time in a row", async () => {
    const harness = boot({
      roster: DEFAULT_ROSTER,
      templates: BUILTIN_TASK_TEMPLATES,
      script: [
        {
          label: "empty twice",
          match: (p) => p.includes("You are the Manager"),
          steps: [{ text: "  " }, { text: "   " }],
        },
      ],
    });
    await harness.runtime.start();

    await harness.runtime.say("중간 보고 해줘");
    await harness.advanceUntil(async () =>
      (await harness.runtime.channel()).some(
        (post) => post.type === "floor.glitch",
      ),
    );
    await harness.runtime.say("왜 계속 놓치기만 하냐");
    await harness.advanceUntil(
      async () =>
        (await harness.runtime.channel()).filter(
          (post) => post.type === "floor.glitch",
        ).length > 1,
    );

    const glitches = (await harness.runtime.channel()).filter(
      (post) => post.type === "floor.glitch",
    );
    expect(glitches).toHaveLength(2);
    // The first owns it and asks again; the second admits it is not working.
    expect(glitches[0]?.detail).toBe("");
    expect(glitches[1]?.detail).toBe("repeated");
  });

  // An approval card carries a trace but no channel of its own, so the tray
  // used to show every card in every room. A person reading one channel was
  // being asked to decide on work another channel had asked for.
  //
  // The card has to come from a seat doing the work rather than from intake
  // refusing to start it: a refusal on the first turn is the office saying it
  // cannot begin, and asking someone to approve that is the behaviour the
  // needs-goal floor exists to remove.
  it("tells the tray which channel each waiting card came from", async () => {
    const harness = boot({
      roster: DEFAULT_ROSTER,
      templates: BUILTIN_TASK_TEMPLATES,
      script: [
        {
          label: "manager-delegates",
          match: (p) => p.includes("You are the Manager"),
          steps: [
            delegate(WRITER_ID, "Draft the offer letter."),
            { text: "작성 맡겼어요." },
          ],
        },
        {
          label: "writer-escalates",
          match: (p) => p.includes("You are the Writer"),
          steps: [
            {
              text: JSON.stringify({
                type: "ESCALATE",
                reason: "The band conflicts with the posted range.",
                options: ["ship", "stop"],
                evidenceRef: [],
              }),
            },
          ],
        },
      ],
    });
    await harness.runtime.start();
    const created = harness.runtime.createChannel({
      name: "hiring",
      purpose: "",
    });
    expect(created.ok).toBe(true);
    if (!created.ok) return;

    await harness.runtime.say(
      "Draft the offer letter for the staff engineer role",
      created.channel.id,
    );
    await harness.advanceUntil(async () => {
      const snapshot = await harness.runtime.snapshot();
      return snapshot.tray.items.length > 0;
    });

    const snapshot = await harness.runtime.snapshot();
    expect(snapshot.tray.items.length).toBeGreaterThan(0);
    for (const item of snapshot.tray.items) {
      expect(item.channelId).toBe(created.channel.id);
    }
  });

  it("stops the work still running in a channel that is deleted", async () => {
    const harness = boot({
      roster: DEFAULT_ROSTER,
      templates: BUILTIN_TASK_TEMPLATES,
      script: [
        {
          label: "delegate",
          match: (p) => p.includes("You are the Manager"),
          steps: [
            {
              text: JSON.stringify({
                type: "REQUEST",
                to: WRITER_ID,
                needs: [{ kind: "task", id: "x", label: "x" }],
                dueByMinutes: 30,
                instruction: "Draft it.",
              }),
            },
          ],
        },
      ],
    });
    await harness.runtime.start();
    const created = harness.runtime.createChannel({
      name: "temp",
      purpose: "",
    });
    if (!created.ok) return;

    const said = await harness.runtime.say("Do a thing", created.channel.id);
    expect(said.ok).toBe(true);
    await harness.settle();

    const removed = harness.runtime.deleteChannel(created.channel.id);
    expect(removed.ok).toBe(true);
    expect(
      harness.runtime.queue.listByTrace(said.ok ? said.traceId : ""),
    ).toHaveLength(0);
    expect(
      harness.runtime
        .listChannels()
        .some((item) => item.id === created.channel.id),
    ).toBe(false);
  });

  // Settings → clear local documents used to leave the Floor alone, so a wipe
  // that said it cleared chats still left greetings and their approval cards.
  it("wipes every channel conversation and empties the approval tray", async () => {
    const harness = boot({
      roster: DEFAULT_ROSTER,
      templates: BUILTIN_TASK_TEMPLATES,
      script: [
        {
          label: "manager-escalates",
          match: (p) => p.includes("You are the Manager"),
          steps: [delegate(WRITER_ID, "Draft it."), { text: "맡겼어요." }],
        },
        {
          label: "writer-escalates",
          match: (p) => p.includes("You are the Writer"),
          steps: [
            {
              text: JSON.stringify({
                type: "ESCALATE",
                reason: "Needs a human.",
                options: ["ship", "stop"],
                evidenceRef: [],
              }),
            },
          ],
        },
      ],
    });
    await harness.runtime.start();
    const created = harness.runtime.createChannel({
      name: "temp",
      purpose: "",
    });
    expect(created.ok).toBe(true);
    if (!created.ok) return;

    await harness.runtime.say("Draft something", created.channel.id);
    await harness.advanceUntil(
      async () => harness.runtime.tray.pendingCount() > 0,
    );
    expect(harness.runtime.tray.pendingCount()).toBeGreaterThan(0);
    expect(
      (await harness.runtime.channel(created.channel.id)).length,
    ).toBeGreaterThan(0);

    const wiped = await harness.runtime.wipeChat();
    expect(wiped.messages).toBeGreaterThan(0);
    expect(wiped.channels).toBe(1);
    expect(wiped.approvals).toBeGreaterThan(0);

    expect(await harness.runtime.channel()).toEqual([]);
    expect(await harness.runtime.channel(created.channel.id)).toEqual([]);
    expect(harness.runtime.tray.pendingCount()).toBe(0);
    expect(
      harness.runtime
        .listChannels()
        .some((item) => item.id === created.channel.id),
    ).toBe(false);
    expect(
      harness.runtime
        .listChannels()
        .some((item) => item.id === DEFAULT_CHANNEL_ID),
    ).toBe(true);
  });
});

describe("saying something does not wait on a model", () => {
  it("puts the line in the channel while the route is still being resolved", async () => {
    // Resolving a route probes the GPU and stats weights. This one never
    // finishes, which is the worst case of a cold machine.
    let releaseRoute = (): void => undefined;
    const routeResolved = new Promise<void>((resolve) => {
      releaseRoute = resolve;
    });
    const harness = boot({
      roster: DEFAULT_ROSTER,
      templates: BUILTIN_TASK_TEMPLATES,
      withoutScriptedModel: true,
      inferenceReady: async () => {
        await routeResolved;
        return { ok: true };
      },
    });
    harness.runtime.setInference({
      providers: {},
      provider: "local",
      model: "local",
    });
    await harness.runtime.start();

    const said = await Promise.race([
      harness.runtime.say("Plan the Q3 offsite"),
      new Promise<"timed out">((resolve) =>
        setTimeout(() => resolve("timed out"), 2_000),
      ),
    ]);
    expect(said).not.toBe("timed out");

    const posts = await harness.runtime.channel();
    expect(
      posts.some(
        (post) =>
          post.origin === "human" && post.body === "Plan the Q3 offsite",
      ),
    ).toBe(true);
    releaseRoute();
  });

  it("marks the seat as typing for the whole model call, not just the paced tail", async () => {
    let releaseModel = (): void => undefined;
    const modelDone = new Promise<void>((resolve) => {
      releaseModel = resolve;
    });
    // The harness is here for its temp directories and clock; the scheduler
    // under test needs a model call that hangs, which `boot` cannot express.
    const harness = boot({ withoutScriptedModel: true });
    // A turn that has started but written nothing yet: exactly the stretch the
    // channel used to show as silence.
    const scheduler = new OfficeScheduler({
      userDataPath: join(harness.root, "userData2"),
      clock: harness.clock,
      basePolicy: {
        global: {
          deniedGroups: [],
          deniedTools: [],
          execSecurity: "allowlist",
          execAsk: "always",
          execAllowlist: [],
          elevatedEnabled: false,
        },
        profile: profileFromPreset("full"),
        sandbox: {
          mode: "workspace",
          workspaceRoots: [harness.workspace],
          readonly: false,
        },
      },
      providers: {},
      roster: DEFAULT_ROSTER,
      templates: BUILTIN_TASK_TEMPLATES,
      policy: { timezoneOffsetMinutes: TZ },
      callModel: async () => {
        await modelDone;
        return {
          text: JSON.stringify({
            type: "BLOCK",
            reason: "n/a",
            unblockCondition: "n/a",
          }),
          timingMs: 0,
          modelId: "test",
          provider: "openrouter" as const,
        };
      },
    });
    await scheduler.start();
    await scheduler.say("Plan the Q3 offsite");

    let typing = false;
    for (let i = 0; i < 200 && !typing; i += 1) {
      await new Promise<void>((r) => setImmediate(r));
      typing = (await scheduler.snapshot()).seats.some((seat) => seat.typing);
    }
    expect(typing).toBe(true);

    releaseModel();
    await scheduler.stop();
    scheduler.close();
  });

  it("does not narrate a long think on a timer", async () => {
    let releaseModel = (): void => undefined;
    const modelDone = new Promise<void>((resolve) => {
      releaseModel = resolve;
    });
    const harness = boot({ withoutScriptedModel: true });
    const scheduler = new OfficeScheduler({
      userDataPath: join(harness.root, "userData3"),
      clock: harness.clock,
      basePolicy: {
        global: {
          deniedGroups: [],
          deniedTools: [],
          execSecurity: "allowlist",
          execAsk: "always",
          execAllowlist: [],
          elevatedEnabled: false,
        },
        profile: profileFromPreset("full"),
        sandbox: {
          mode: "workspace",
          workspaceRoots: [harness.workspace],
          readonly: false,
        },
      },
      providers: {},
      roster: DEFAULT_ROSTER,
      templates: BUILTIN_TASK_TEMPLATES,
      policy: {
        timezoneOffsetMinutes: TZ,
        pace: {
          ...DEFAULT_OFFICE_POLICY.pace,
          progressQuietMs: MINUTE,
          progressRepeatMs: MINUTE,
        },
      },
      callModel: async (input) => {
        // The turn announces a tool call and then hangs, which is the shape of
        // every wait a person actually complains about.
        input.onTextChunk?.("");
        await modelDone;
        return {
          text: JSON.stringify({
            type: "BLOCK",
            reason: "n/a",
            unblockCondition: "n/a",
          }),
          timingMs: 0,
          modelId: "test",
          provider: "openrouter" as const,
        };
      },
    });
    await scheduler.start();
    await scheduler.say("Plan the Q3 offsite");

    // Wait for the turn to actually be in flight before moving the clock.
    let typing = false;
    for (let i = 0; i < 200 && !typing; i += 1) {
      await new Promise<void>((r) => setImmediate(r));
      typing = (await scheduler.snapshot()).seats.some((seat) => seat.typing);
    }
    expect(typing).toBe(true);

    const progressCount = async (): Promise<number> =>
      (await scheduler.channel()).filter(
        (post) => post.type === "task.progress",
      ).length;

    // Thinking alone is already visible from the typing seat. It does not add
    // periodic loader-like messages to the channel.
    expect(await progressCount()).toBe(0);

    harness.clock.advance(MINUTE);
    for (let i = 0; i < 20; i += 1) {
      await new Promise<void>((r) => setImmediate(r));
    }
    expect(await progressCount()).toBe(0);

    releaseModel();
    await scheduler.stop();

    harness.clock.advance(5 * MINUTE);
    for (let i = 0; i < 20; i += 1)
      await new Promise<void>((r) => setImmediate(r));
    expect(await progressCount()).toBe(0);

    scheduler.close();
  });

  // The quiet period is for a turn that has nothing to say yet. Reaching for a
  // file is something to say, and holding it back for half a minute is what made
  // a working seat look stalled.
  it("announces the first concrete action once and keeps later tools quiet", async () => {
    let releaseModel = (): void => undefined;
    const modelDone = new Promise<void>((resolve) => {
      releaseModel = resolve;
    });
    let turn = 0;
    const harness = boot({
      roster: DEFAULT_ROSTER,
      templates: BUILTIN_TASK_TEMPLATES,
      callModel: async (input) => {
        turn += 1;
        if (turn === 1) {
          return {
            text: "",
            timingMs: 0,
            modelId: "fixture",
            provider: "openrouter" as const,
            finishReason: "tool_calls" as const,
            toolCalls: [
              {
                id: "call-list",
                name: "fs.list",
                arguments: JSON.stringify({ path: harness.workspace }),
              },
              {
                id: "call-read",
                name: "fs.read",
                arguments: JSON.stringify({
                  path: join(harness.workspace, "notes.md"),
                }),
              },
            ],
          };
        }
        // The second turn hangs, so the only thing that can have been reported
        // is the tool call itself.
        await modelDone;
        return {
          text: JSON.stringify({ type: "ANSWER", text: "done" }),
          timingMs: 0,
          modelId: "fixture",
          provider: "openrouter" as const,
          finishReason: "stop" as const,
        };
      },
    });

    await harness.runtime.start();
    await harness.runtime.say("워크스페이스 좀 봐줘");

    const notes = async (): Promise<ChannelPost[]> =>
      (await harness.runtime.channel()).filter(
        (post) => post.type === "task.progress",
      );

    let seen: ChannelPost[] = [];
    for (let i = 0; i < 400 && seen.length === 0; i += 1) {
      await new Promise<void>((r) => setImmediate(r));
      seen = await notes();
    }
    // Said without the clock moving at all: the quiet period is 4s of virtual
    // time and nothing here advanced it.
    expect(seen, "the tool call was not announced exactly once").toHaveLength(
      1,
    );
    expect(seen[0]?.progress?.target).toBe("");
    // Said out loud, so the channel keeps it as a line the seat spoke rather
    // than a spinner the next update overwrites.
    expect(seen[0]?.progress?.spoken).toBe(true);

    releaseModel();
    await harness.runtime.stop();
  });
});

describe("hiring a colleague", () => {
  it("derives an id, tools and a budget from the role and the job", () => {
    const harness = boot({
      roster: DEFAULT_ROSTER,
      templates: BUILTIN_TASK_TEMPLATES,
    });
    const hired = harness.runtime.hireStaff({
      role: "Legal Counsel",
      layer: "review",
      personality:
        "You read contracts for risk and quote the clause you object to.",
    });
    expect(hired.ok).toBe(true);
    if (!hired.ok) return;
    expect(hired.staff.id).toBe("legal-counsel");

    const seat = harness.runtime.roster.find(
      (member) => member.id === "legal-counsel",
    );
    expect(seat?.custom).toBe(true);
    expect(seat?.layer).toBe("review");
    // Tools come from the job, never from the person hiring.
    expect(seat?.tools).toContain("fs.read");
    expect(seat?.tools).not.toContain("net.httpPost");
    expect(seat?.budget.perTaskTokens).toBeGreaterThan(0);
  });

  it("refuses a seat with no role, no instructions or an invented job", () => {
    const harness = boot();
    expect(
      harness.runtime.hireStaff({
        role: "  ",
        layer: "review",
        personality: "x",
      }).ok,
    ).toBe(false);
    expect(
      harness.runtime.hireStaff({
        role: "Auditor",
        layer: "review",
        personality: " ",
      }).ok,
    ).toBe(false);
    expect(
      harness.runtime.hireStaff({
        role: "Auditor",
        layer: "chief-of-staff",
        personality: "x",
      }).ok,
    ).toBe(false);
  });

  it("makes the new seat addressable by everyone already on the floor", async () => {
    const prompts: string[] = [];
    const harness = boot({
      roster: DEFAULT_ROSTER,
      templates: BUILTIN_TASK_TEMPLATES,
      script: [
        {
          label: "capture",
          match: (p) => {
            prompts.push(p);
            return true;
          },
          steps: [
            {
              text: JSON.stringify({
                type: "BLOCK",
                reason: "n/a",
                unblockCondition: "n/a",
              }),
            },
          ],
        },
      ],
    });
    await harness.runtime.start();
    harness.runtime.hireStaff({
      role: "Legal Counsel",
      layer: "review",
      personality: "You read contracts for risk.",
    });

    await harness.runtime.say("Check this NDA");
    await harness.advanceUntil(() => prompts.length > 0);

    // Without the directory the lead has no way to know the seat exists, and a
    // colleague nobody can name never gets any work.
    expect(prompts.join("\n")).toContain('"legal-counsel" (Legal Counsel)');
  });

  it("only lets go of seats a person hired", () => {
    const harness = boot({
      roster: DEFAULT_ROSTER,
      templates: BUILTIN_TASK_TEMPLATES,
    });
    expect(harness.runtime.dismissStaff(MANAGER_ID).ok).toBe(false);
    expect(
      harness.runtime.roster.some((member) => member.id === MANAGER_ID),
    ).toBe(true);

    const hired = harness.runtime.hireStaff({
      role: "Auditor",
      layer: "review",
      personality: "You check the numbers.",
    });
    if (!hired.ok) return;
    expect(harness.runtime.dismissStaff(hired.staff.id).ok).toBe(true);
    expect(
      harness.runtime.roster.some((member) => member.id === hired.staff.id),
    ).toBe(false);
  });

  it("keeps hired seats across a restart", async () => {
    const harness = boot({
      roster: DEFAULT_ROSTER,
      templates: BUILTIN_TASK_TEMPLATES,
    });
    await harness.runtime.start();
    harness.runtime.hireStaff({
      role: "Auditor",
      layer: "review",
      personality: "You check the numbers.",
    });
    harness.runtime.close();

    const reopened = new OfficeScheduler({
      userDataPath: join(harness.root, "userData"),
      clock: harness.clock,
      basePolicy: {
        global: {
          deniedGroups: [],
          deniedTools: [],
          execSecurity: "allowlist",
          execAsk: "always",
          execAllowlist: [],
          elevatedEnabled: false,
        },
        profile: profileFromPreset("full"),
        sandbox: {
          mode: "workspace",
          workspaceRoots: [harness.workspace],
          readonly: false,
        },
      },
      providers: {},
      callModel: new ScriptedModel([]).asModelCall(),
      roster: DEFAULT_ROSTER,
      templates: BUILTIN_TASK_TEMPLATES,
      policy: { timezoneOffsetMinutes: TZ },
    });
    expect(reopened.roster.some((member) => member.id === "auditor")).toBe(
      true,
    );
    reopened.close();
  });
});

describe("staff output contract", () => {
  it("accepts the five typed messages and refuses free text", () => {
    expect(
      parseStaffOutput(
        JSON.stringify({
          type: "DELIVER",
          to: "repro-verifier",
          artifactRef: { kind: "file", id: "a.md" },
          claim: "done",
        }),
      ).ok,
    ).toBe(true);
    expect(parseStaffOutput("Hi, I finished the work, let me know!").ok).toBe(
      false,
    );
    expect(
      parseStaffOutput(
        JSON.stringify({ type: "ESCALATE", reason: "stuck", options: ["a"] }),
      ).ok,
    ).toBe(false);
    expect(
      parseStaffOutput(
        JSON.stringify({
          type: "ESCALATE",
          reason: "stuck",
          options: ["a", "b"],
        }),
      ).ok,
    ).toBe(true);
  });

  // A 4B model asked for "needs" writes down what is needed. Throwing the plan
  // away over that shape put `needs.0: Invalid input: expected object, received
  // string` in the channel, addressed to whoever had asked a question.
  it("reads a plainly named need as a need", () => {
    const parsed = parseStaffOutput(
      JSON.stringify({
        type: "REQUEST",
        to: "researcher",
        needs: ["오늘 날씨"],
        dueByMinutes: 30,
        instruction: "Look up today's weather",
      }),
    );
    expect(parsed.ok).toBe(true);
    if (!parsed.ok || parsed.output.type !== "REQUEST") return;
    expect(parsed.output.needs).toEqual([
      { kind: "task", id: "오늘-날씨", label: "오늘 날씨" },
    ]);
  });

  it("keeps typed needs when only some entries were named", () => {
    const parsed = parseStaffOutput(
      JSON.stringify({
        type: "REQUEST",
        to: "writer",
        needs: [{ kind: "file", id: "brief.md" }, "a headline"],
        dueByMinutes: 30,
        instruction: "Draft it",
      }),
    );
    expect(parsed.ok).toBe(true);
    if (!parsed.ok || parsed.output.type !== "REQUEST") return;
    expect(parsed.output.needs).toEqual([
      { kind: "file", id: "brief.md" },
      { kind: "task", id: "a-headline", label: "a headline" },
    ]);
  });

  it("names the need from the instruction when the list came back empty", () => {
    const parsed = parseStaffOutput(
      JSON.stringify({
        type: "REQUEST",
        to: "researcher",
        needs: [],
        dueByMinutes: 30,
        instruction: "Find today's forecast for Seoul",
      }),
    );
    expect(parsed.ok).toBe(true);
    if (!parsed.ok || parsed.output.type !== "REQUEST") return;
    expect(parsed.output.needs[0]?.label).toBe(
      "Find today's forecast for Seoul",
    );
  });

  it("still refuses a REQUEST with nothing to hand over", () => {
    expect(
      parseStaffOutput(
        JSON.stringify({ type: "REQUEST", to: "writer", dueByMinutes: 30 }),
      ).ok,
    ).toBe(false);
  });
});
