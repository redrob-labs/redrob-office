/**
 * Installs the GPU runtime this machine needs and proves llama-server starts.
 *
 * Run against a real box with `node scripts/run-electron-ts.mjs
 * scripts/backend-install-check.ts`. It exercises the same code path the Device
 * panel button does, because the parts that can only be wrong on real hardware -
 * the pinned asset digests, the directory layout an archive unpacks into, and
 * whether the extracted binary actually runs - are not things a unit test on CI
 * can tell us.
 */
import { app } from "electron";
import {
  ensureLlamaServer,
  getLlamaServerStatus,
  resolveExecutionPlan,
  shutdownLlamaServer,
} from "@redrob/kernel";
import { getBackendStatus, installBackend } from "../src/main/services/backend-install.js";

function mb(bytes: number): string {
  return `${(bytes / 1_000_000).toFixed(0)}MB`;
}

async function main(): Promise<number> {
  const before = await getBackendStatus();
  console.info(`detection: ${before.detectionChain}`);
  console.info(`recommended: ${before.recommendedId ?? "(none)"} installed=${String(before.ready)}`);
  for (const option of before.options) {
    console.info(
      `  ${option.id} installed=${String(option.installed)} ` +
        `download=${option.downloadBytes === null ? "manual" : mb(option.downloadBytes)}`,
    );
  }

  if (before.recommendedId === null) {
    console.error("No backend to install on this platform.");
    return 1;
  }

  if (!before.ready) {
    let lastPercent = -1;
    const after = await installBackend(before.recommendedId, (event) => {
      if (event.kind === "download") {
        const percent = event.percent ?? 0;
        if (percent === lastPercent) return;
        lastPercent = percent;
        if (percent % 5 !== 0) return;
        console.info(
          `download ${String(percent)}% (${String(event.archiveIndex ?? 1)}/${String(event.archiveCount ?? 1)})`,
        );
        return;
      }
      console.info(`${event.kind}${event.detail ? `: ${event.detail}` : ""}`);
    });
    console.info(`installed: ${after.activeId ?? "(none)"} at ${after.binaryPath ?? "(none)"}`);
    if (!after.ready) {
      console.error("Install reported success but no binary resolved.");
      return 1;
    }
  } else {
    console.info(`already installed at ${before.binaryPath ?? "(none)"}`);
  }

  const plan = await resolveExecutionPlan();
  console.info(`plan: backend=${plan.backend} model=${plan.modelId} path=${plan.modelPath}`);

  await ensureLlamaServer({
    backendId: plan.backendId,
    modelPath: plan.modelPath,
    ...(plan.mmprojPath ? { mmprojPath: plan.mmprojPath } : {}),
    contextSize: plan.contextSize,
    gpuLayers: plan.gpuLayers,
  });
  const status = getLlamaServerStatus();
  console.info(`llama-server: running=${String(status.running)} url=${status.baseUrl ?? "(none)"}`);
  await shutdownLlamaServer();
  return status.running ? 0 : 1;
}

void app.whenReady().then(async () => {
  let code = 1;
  try {
    code = await main();
  } catch (error) {
    console.error(error instanceof Error ? (error.stack ?? error.message) : String(error));
  }
  app.exit(code);
});
