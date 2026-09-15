/**
 * Minimised-window throughput bench.
 *
 * Chromium throttles timers in a backgrounded renderer, which is exactly why
 * the Floor worker pool lives in the main process. This runs the real pump in
 * an Electron main process, measures completed staff turns with the window
 * visible and again with it minimised, and prints both numbers. A renderer
 * timer is counted alongside as the control: it is the one that drops.
 */
import { app, BrowserWindow } from "electron";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { configureToolAudit } from "../src/main/audit/tool-audit.js";
import { nowMs } from "../src/main/app-time.js";
import { configureComputerUse } from "../src/main/office/config.js";
import { profileFromPreset } from "../src/main/security/index.js";
import type { SecurityPolicyBundle } from "../src/main/security/index.js";
import { OfficeScheduler } from "../src/main/office/scheduler.js";
import { DEFAULT_ROSTER } from "../src/main/office/staff/roster.js";
import type { TaskTemplate } from "../src/main/office/tasks/templates.js";
import { ScriptedModel } from "../src/main/office/fixtures/scripted-model.js";
import { seedDemoWorkspace } from "../src/main/office/fixtures/demo-scenario.js";

const WINDOW_MS = Number(process.env["FLOOR_BENCH_WINDOW_MS"] ?? 20_000);

const CONTROL_PAGE = `data:text/html,${encodeURIComponent(`
<!doctype html><meta charset="utf-8"><title>Floor bench</title>
<body style="font:14px system-ui;padding:24px">
<p>Floor throughput bench. Counting renderer timer ticks as the control.</p>
<pre id="out">0</pre>
<script>
  let ticks = 0;
  setInterval(() => { ticks += 1; document.getElementById('out').textContent = String(ticks); }, 10);
  window.__ticks = () => ticks;
</script>
</body>`)}`;

async function main(): Promise<void> {
  const root = join(tmpdir(), `redrob-floor-bench-${nowMs()}`);
  const userData = join(root, "userData");
  const workspace = join(root, "workspace");
  mkdirSync(userData, { recursive: true });
  mkdirSync(workspace, { recursive: true });
  configureToolAudit(userData);
  configureComputerUse(userData);
  seedDemoWorkspace(workspace);

  // One tiny deterministic turn per task: the bench measures the pump, not
  // the model.
  const scripted = new ScriptedModel([
    {
      label: "bench",
      match: () => true,
      steps: [
        {
          text: JSON.stringify({
            type: "DELIVER",
            to: "repro-verifier",
            artifactRef: { kind: "artifact", id: "bench", label: "bench" },
            claim: "bench turn complete",
          }),
        },
      ],
    },
  ]);

  const template: TaskTemplate = {
    id: "floor/bench",
    title: "Bench turn",
    staffId: "price-watcher",
    instruction: "Answer with one typed message and nothing else.",
    gates: [],
    source: "builtin",
  };

  const basePolicy: SecurityPolicyBundle = {
    global: {
      deniedGroups: [],
      deniedTools: [],
      execSecurity: "allowlist",
      execAsk: "always",
      execAllowlist: [],
      elevatedEnabled: false,
    },
    profile: profileFromPreset("readonly"),
    sandbox: { mode: "workspace", workspaceRoots: [workspace], readonly: true },
  };

  const runtime = new OfficeScheduler({
    userDataPath: userData,
    basePolicy,
    providers: {},
    callModel: scripted.asModelCall(),
    roster: DEFAULT_ROSTER,
    templates: [template],
    policy: { tokenBudget: 50_000_000 },
  });
  console.log("runtime: starting");
  await runtime.start();
  console.log("runtime: started");

  const window_ = new BrowserWindow({ width: 720, height: 420, show: true });
  await window_.loadURL(CONTROL_PAGE);
  console.log("window: loaded");

  /**
   * Keeps claimable work in the queue so the pump is always the bottleneck.
   * Intake is human-initiated, so it is never paced; the DELIVER each turn
   * produces is paced and simply waits in `not_before`, which is the point.
   */
  let feeding = true;
  let submitted = 0;
  const feed = async (): Promise<void> => {
    while (feeding) {
      if (submitted - runtime.turnsCompleted < 12) {
        await runtime.submitTask({ templateId: template.id });
        submitted += 1;
      } else {
        await new Promise((r) => setTimeout(r, 2));
      }
    }
  };
  void feed().catch((error: unknown) => {
    console.error("feed failed", error);
  });
  const heartbeat = setInterval(() => {
    console.log(
      `  .. submitted=${submitted} turns=${runtime.turnsCompleted} pending=${runtime.queue.pendingCount()} inflight=${runtime.inflight}`,
    );
  }, 2_000);

  const rendererTicks = async (): Promise<number> =>
    (await window_.webContents.executeJavaScript("window.__ticks()")) as number;

  const measure = async (label: string): Promise<{
    turns: number;
    perSecond: number;
    rendererPerSecond: number;
  }> => {
    const turns0 = runtime.turnsCompleted;
    const ticks0 = await rendererTicks();
    const started = nowMs();
    await new Promise((r) => setTimeout(r, WINDOW_MS));
    const elapsed = (nowMs() - started) / 1000;
    const turns = runtime.turnsCompleted - turns0;
    const ticks = (await rendererTicks()) - ticks0;
    const result = {
      turns,
      perSecond: turns / elapsed,
      rendererPerSecond: ticks / elapsed,
    };
    console.log(
      `${label}: ${turns} staff turns in ${elapsed.toFixed(1)}s = ${result.perSecond.toFixed(1)}/s ` +
        `(renderer control ${result.rendererPerSecond.toFixed(1)} ticks/s)`,
    );
    return result;
  };

  // Warm the caches so the first window is not measuring startup.
  await new Promise((r) => setTimeout(r, 3_000));

  const visible = await measure("visible ");
  window_.minimize();
  await new Promise((r) => setTimeout(r, 1_000));
  const minimized = await measure("minimized");

  feeding = false;
  clearInterval(heartbeat);
  const ratio = visible.perSecond === 0 ? 0 : minimized.perSecond / visible.perSecond;
  const rendererRatio =
    visible.rendererPerSecond === 0 ? 0 : minimized.rendererPerSecond / visible.rendererPerSecond;
  console.log(`\nMain-process throughput while minimised: ${(ratio * 100).toFixed(0)}% of visible`);
  console.log(`Renderer timer while minimised:          ${(rendererRatio * 100).toFixed(0)}% of visible`);
  const ok = ratio >= 0.9;
  console.log(ok ? "\nPASS  minimising the window did not slow the queue" : "\nFAIL  queue slowed down");

  const report = join(tmpdir(), "redrob-floor-bench.json");
  writeFileSync(
    report,
    `${JSON.stringify({ windowMs: WINDOW_MS, visible, minimized, ratio, rendererRatio, ok }, null, 2)}\n`,
  );
  console.log(`Report: ${report}`);

  await runtime.stop();
  runtime.close();
  window_.destroy();
  rmSync(root, { recursive: true, force: true });
  app.exit(ok ? 0 : 1);
}

void app.whenReady().then(main);
app.on("window-all-closed", () => undefined);
