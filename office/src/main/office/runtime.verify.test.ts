import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import type { CloudChatResult, CloudToolCall } from "@redrob/kernel";
import { configureComputerUse, getAllowedPaths } from "../office/config.js";
import { runTask } from "../office/runtime.js";
import { RealTimeSource } from "../office/time/index.js";
import type { Task } from "../office/tasks/types.js";
import { configureToolAudit, readRecentAudit } from "../audit/tool-audit.js";
import { executeComputerTool } from "../tools/registry.js";

function resultWithTools(calls: CloudToolCall[], text = ""): CloudChatResult {
  return {
    text,
    finishReason: "tool_calls",
    toolCalls: calls,
    timingMs: 1,
    modelId: "test",
    provider: "openrouter",
  };
}

function finalText(text: string): CloudChatResult {
  return {
    text,
    finishReason: "stop",
    timingMs: 1,
    modelId: "test",
    provider: "openrouter",
  };
}

function writeComputerUseConfig(root: string, workspace: string): void {
  writeFileSync(
    join(root, "computer-use.json"),
    JSON.stringify(
      {
        allowedPaths: [workspace],
        profile: "full",
        execSecurity: "allowlist",
        execAsk: "always",
        sandboxMode: "workspace",
        elevatedEnabled: false,
      },
      null,
      2,
    ),
    "utf8",
  );
}

const testClock = new RealTimeSource();

function testTask(instruction: string): Task {
  return {
    taskId: "task-verify",
    traceId: "trace-verify",
    staffMemberId: "staff:verify",
    spec: { templateId: "office/verify", title: "verify", instruction },
    budget: { tokens: 100_000, costMicros: 0 },
    notBefore: testClock.now(),
  };
}

describe("computer-use criteria", () => {
  let root = "";

  afterEach(() => {
    if (root) rmSync(root, { recursive: true, force: true });
    root = "";
  });

  it("reads txt files and writes summary.md via the runtime", async () => {
    root = mkdtempSync(join(tmpdir(), "redrob-task-ok-"));
    const workspace = join(root, "workspace");
    mkdirSync(workspace, { recursive: true });
    writeFileSync(join(workspace, "a.txt"), "Alpha notes about hiring.", "utf8");
    writeFileSync(join(workspace, "b.txt"), "Beta notes about onboarding.", "utf8");
    configureComputerUse(root);
    configureToolAudit(root);
    writeComputerUseConfig(root, workspace);

    const summaryPath = join(workspace, "summary.md").replace(/\\/g, "\\\\");
    const queue: CloudChatResult[] = [
      resultWithTools([
        {
          id: "c1",
          name: "fs.list",
          arguments: JSON.stringify({ path: workspace }),
        },
      ]),
      resultWithTools([
        {
          id: "c2",
          name: "fs.read",
          arguments: JSON.stringify({ path: join(workspace, "a.txt") }),
        },
        {
          id: "c3",
          name: "fs.read",
          arguments: JSON.stringify({ path: join(workspace, "b.txt") }),
        },
      ]),
      resultWithTools([
        {
          id: "c4",
          name: "fs.write",
          arguments: JSON.stringify({
            path: join(workspace, "summary.md"),
            content:
              "# Summary\n\n- Alpha notes about hiring.\n- Beta notes about onboarding.\n",
          }),
        },
      ]),
      finalText(`Saved summary to ${summaryPath}`),
    ];

    const out = await runTask({
      task: testTask("이 폴더의 .txt 파일을 읽고 요약해서 summary.md로 저장해줘"),
      clock: testClock,
      scope: { at: testClock.now() },
      providers: {},
      provider: "openrouter",
      model: "test",
      thinking: false,
      userDataPath: root,
      callModel: async () => {
        const next = queue.shift();
        if (!next) throw new Error("Unexpected extra model call");
        return next;
      },
      requestApproval: async () => "allow_once",
      onEvent: () => undefined,
    });

    expect(out.iterations).toBeGreaterThan(0);
    const summary = readFileSync(join(workspace, "summary.md"), "utf8");
    expect(summary).toMatch(/Alpha/);
    expect(summary).toMatch(/Beta/);
    const audit = await readRecentAudit(50);
    expect(
      audit.some(
        (e) =>
          e.toolName === "fs.write" &&
          e.kind === "tool_call" &&
          e.approvalState === "granted",
      ),
    ).toBe(true);
  });

  it("denies paths outside the allowlist and records audit", async () => {
    root = mkdtempSync(join(tmpdir(), "redrob-task-deny-"));
    const workspace = join(root, "workspace");
    mkdirSync(workspace, { recursive: true });
    configureComputerUse(root);
    configureToolAudit(root);
    writeComputerUseConfig(root, workspace);

    const outside = join(root, "outside.txt");
    writeFileSync(outside, "secret", "utf8");
    const allowed = await getAllowedPaths();
    const { result } = await executeComputerTool(
      "fs.read",
      { path: outside },
      { allowedPaths: allowed, userDataPath: root },
    );
    expect(result.ok).toBe(false);
    expect(result.error ?? result.summary).toMatch(/Access denied|outside/i);

    const { appendAudit } = await import("../audit/tool-audit.js");
    await appendAudit({
      clock: testClock,
      kind: "policy_deny",
      event: "policy.denied",
      toolName: "fs.read",
      args: { path: outside },
      resultSummary: result.summary,
      scope: { at: testClock.now(), allowed: false },
    });
    const audit = await readRecentAudit(10);
    expect(audit[0]?.toolName).toBe("fs.read");
    expect(audit[0]?.kind).toBe("policy_deny");
  });

  it("stops the loop when the user denies a high-risk tool", async () => {
    root = mkdtempSync(join(tmpdir(), "redrob-task-abort-"));
    const workspace = join(root, "workspace");
    mkdirSync(workspace, { recursive: true });
    configureComputerUse(root);
    configureToolAudit(root);
    writeComputerUseConfig(root, workspace);

    const events: string[] = [];
    const out = await runTask({
      task: testTask("write a file"),
      clock: testClock,
      scope: { at: testClock.now() },
      providers: {},
      provider: "openrouter",
      model: "test",
      thinking: false,
      userDataPath: root,
      callModel: async () =>
        resultWithTools([
          {
            id: "w1",
            name: "fs.write",
            arguments: JSON.stringify({
              path: join(workspace, "nope.md"),
              content: "should not write",
            }),
          },
        ]),
      requestApproval: async () => "deny",
      onEvent: (e) => events.push(e.kind),
    });

    expect(events).toContain("aborted");
    expect(out.text).toBe("");
    let missing = false;
    try {
      readFileSync(join(workspace, "nope.md"), "utf8");
    } catch {
      missing = true;
    }
    expect(missing).toBe(true);
    const audit = await readRecentAudit(10);
    expect(
      audit.some((e) => e.toolName === "fs.write" && e.approvalState === "denied"),
    ).toBe(true);
  });

  // Typing a message is one input.type per line and one input.key per Enter,
  // and each of those used to raise its own card. Nobody reads the fourth one.
  it("asks once, then stops asking for the rest of the run", async () => {
    root = mkdtempSync(join(tmpdir(), "redrob-task-approve-once-"));
    const workspace = join(root, "workspace");
    mkdirSync(workspace, { recursive: true });
    configureComputerUse(root);
    configureToolAudit(root);
    writeComputerUseConfig(root, workspace);

    // The first two reach the desktop and find nothing to act on; the third is
    // a different tool group, and it does not get its own card either.
    const queue: CloudChatResult[] = [
      resultWithTools([
        {
          id: "u1",
          name: "app.focus",
          arguments: JSON.stringify({ title: "redrob-no-such-window" }),
        },
      ]),
      resultWithTools([
        {
          id: "u2",
          name: "ui.elements",
          arguments: JSON.stringify({ app: "redrob-no-such-window" }),
        },
      ]),
      resultWithTools([
        {
          id: "n1",
          name: "net.httpPost",
          // Loopback is blocked before fetch, so this stays a different tool
          // group without spending the 20s network abort on Windows CI.
          arguments: JSON.stringify({
            url: "https://127.0.0.1/hook",
            body: "{}",
          }),
        },
      ]),
      finalText("done"),
    ];

    const asked: string[] = [];
    await runTask({
      task: testTask("슬랙 열어서 메시지 보내줘"),
      clock: testClock,
      scope: { at: testClock.now() },
      providers: {},
      provider: "openrouter",
      model: "test",
      thinking: false,
      userDataPath: root,
      callModel: async () => {
        const next = queue.shift();
        if (!next) throw new Error("Unexpected extra model call");
        return next;
      },
      requestApproval: async (request) => {
        asked.push(request.name);
        return "allow_once";
      },
      onEvent: () => undefined,
    });

    // One card for the run, including the tool from another group.
    expect(asked).toEqual(["app.focus"]);
  });

  // The same refusal, over and over, until the iteration cap: from the outside
  // that is the app spinning for minutes and then apologising.
  it("stops a run that keeps making the same failing call", async () => {
    root = mkdtempSync(join(tmpdir(), "redrob-task-stuck-"));
    const workspace = join(root, "workspace");
    mkdirSync(workspace, { recursive: true });
    configureComputerUse(root);
    configureToolAudit(root);
    writeComputerUseConfig(root, workspace);

    const call = {
      id: "s1",
      name: "fs.read",
      arguments: JSON.stringify({ path: join(root, "outside-the-allowlist.txt") }),
    };
    let asks = 0;
    const out = await runTask({
      task: testTask("read that file for me"),
      clock: testClock,
      scope: { at: testClock.now() },
      providers: {},
      provider: "openrouter",
      model: "test",
      thinking: false,
      userDataPath: root,
      maxIterations: 30,
      callModel: async (request) => {
        asks += 1;
        // Once told to stop, the model is not offered the tools again.
        if (request.toolChoice === "none") return finalText("I could not read it.");
        return resultWithTools([{ ...call, id: `s${asks}` }]);
      },
      requestApproval: async () => "allow_once",
      onEvent: () => undefined,
    });

    expect(out.text).toMatch(/could not/i);
    // Three failures, then the turn that has to answer.
    expect(asks).toBeLessThanOrEqual(5);
  });

  // A search that was never clicked leaves the previous conversation on
  // screen, and the update lands somewhere it can never be taken back from.
  it("will not type the message into a channel that was not asked for", async () => {
    root = mkdtempSync(join(tmpdir(), "redrob-task-wrong-channel-"));
    const workspace = join(root, "workspace");
    mkdirSync(workspace, { recursive: true });
    configureComputerUse(root);
    configureToolAudit(root);
    writeComputerUseConfig(root, workspace);

    const { selectElements, uiElements } = await import(
      "../desktop/ui-elements.js"
    );
    const rect = { x: 0, y: 0, width: 1920, height: 1080 };
    uiElements.replace(
      {
        hwnd: 1,
        title: "strategy_redrob-ai (Channel) - McKinley Rice - Slack",
        process: "slack",
        rect,
      },
      selectElements(
        [
          {
            name: "Message #strategy_redrob-ai",
            role: "Edit",
            rect: { x: 400, y: 900, width: 900, height: 60 },
          },
        ],
        { window: rect, generation: uiElements.nextGeneration() },
      ),
    );

    const queue: CloudChatResult[] = [
      resultWithTools([
        {
          id: "t1",
          name: "input.type",
          arguments: JSON.stringify({
            text: "labs.redrob.ai 근황을 정리했습니다. Eval, Image, Studio를 공개했습니다.",
          }),
        },
      ]),
      finalText("done"),
    ];

    const results: Array<{ ok: boolean; summary: string }> = [];
    await runTask({
      task: testTask("redrob-labs 채널에 labs.redrob.ai 근황 정리해서 올려줘"),
      clock: testClock,
      scope: { at: testClock.now() },
      providers: {},
      provider: "openrouter",
      model: "test",
      thinking: false,
      userDataPath: root,
      callModel: async () => {
        const next = queue.shift();
        if (!next) throw new Error("Unexpected extra model call");
        return next;
      },
      requestApproval: async () => "allow_once",
      onEvent: (event) => {
        if (event.kind === "tool_result") {
          results.push({ ok: event.ok, summary: event.summary });
        }
      },
    });

    expect(results).toHaveLength(1);
    expect(results[0]?.ok).toBe(false);
    expect(results[0]?.summary).toMatch(/strategy_redrob-ai/);
    expect(results[0]?.summary).toMatch(/redrob-labs/);
  });
});
