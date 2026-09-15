#!/usr/bin/env node
/**
 * Download verified GGUF artifacts for the detected (or overridden) tier.
 *
 * Usage:
 *   pnpm download:models
 *   pnpm download:models -- --tier T8
 *   pnpm download:models -- --role text
 *   REDROB_MODELS_DIR=D:/models pnpm download:models
 */
import { mkdir, stat, writeFile } from "node:fs/promises";
import { join } from "node:path";
import {
  MODEL_ARTIFACTS,
  TIERS,
  defaultModelsDir,
  detectDeviceProfile,
  downloadModel,
  modelLocalPath,
} from "../packages/kernel/dist/index.js";

function parseArgs(argv) {
  let tier;
  let role;
  let force = false;
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--tier") {
      const value = argv[i + 1];
      if (value !== "T4" && value !== "T8" && value !== "T16") {
        throw new Error(`Invalid --tier ${value ?? "(missing)"}`);
      }
      tier = value;
      i += 1;
    } else if (arg === "--role") {
      const value = argv[i + 1];
      if (value !== "embed" && value !== "rerank" && value !== "text") {
        throw new Error(`Invalid --role ${value ?? "(missing)"}`);
      }
      role = value;
      i += 1;
    } else if (arg === "--force") {
      force = true;
    } else if (arg === "--help" || arg === "-h") {
      console.log(
        "Usage: download-models [--tier T4|T8|T16] [--role text|embed|rerank] [--force]",
      );
      process.exit(0);
    }
  }
  return { tier, role, force };
}

async function fileExists(path) {
  try {
    await stat(path);
    return true;
  } catch {
    return false;
  }
}

function formatMb(bytes) {
  return (bytes / (1024 * 1024)).toFixed(1);
}

async function downloadWithProgress(artifact, modelsDir) {
  const started = Date.now();
  process.stdout.write(`↓ ${artifact.id}  (${artifact.hfRepo}/${artifact.hfFile})\n`);
  let lastPct = -1;
  const path = await downloadModel(artifact, modelsDir, {
    onProgress: ({ bytesReceived, totalBytes }) => {
      if (totalBytes === null || totalBytes <= 0) {
        return;
      }
      const pct = Math.floor((bytesReceived / totalBytes) * 100);
      if (pct === lastPct || (pct % 5 !== 0 && pct !== 100)) {
        return;
      }
      lastPct = pct;
      process.stdout.write(
        `  … ${pct}%  ${formatMb(bytesReceived)} / ${formatMb(totalBytes)} MB\n`,
      );
    },
  });
  const size = (await stat(path)).size;
  const sec = ((Date.now() - started) / 1000).toFixed(1);
  process.stdout.write(`  ✓ ${formatMb(size)} MB in ${sec}s → ${path}\n`);
  return path;
}

async function maybeDownloadMmproj(artifact, modelsDir, force) {
  if (!artifact.mmprojFile) {
    return;
  }
  const mmproj = {
    ...artifact,
    id: `${artifact.id}-mmproj`,
    hfFile: artifact.mmprojFile,
  };
  const dest = modelLocalPath(mmproj, modelsDir);
  if (!force && (await fileExists(dest))) {
    process.stdout.write(`· skip mmproj (exists) ${mmproj.hfFile}\n`);
    return;
  }
  await downloadWithProgress(mmproj, modelsDir);
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const profile = await detectDeviceProfile();
  const tier = args.tier ?? "T4";
  const modelsDir = defaultModelsDir();
  await mkdir(modelsDir, { recursive: true });

  process.stdout.write(
    `Device: ${profile.totalRamMb} MB RAM → hardware tier ${profile.tier}; downloading pack ${tier} (default local pack is T4)\n`,
  );
  process.stdout.write(`Models dir: ${modelsDir}\n`);
  if (tier !== profile.tier) {
    process.stdout.write(`(tier override via --tier ${tier})\n`);
  }

  const roles = TIERS[tier];
  const ids = [roles.text, roles.embed, roles.rerank];
  const artifacts = ids
    .map((id) => {
      const artifact = MODEL_ARTIFACTS[id];
      if (!artifact) {
        throw new Error(`Unknown model id in TIERS[${tier}]: ${id}`);
      }
      return artifact;
    })
    .filter((artifact) => (args.role ? artifact.role === args.role : true));

  artifacts.sort((a, b) => {
    const order = { text: 0, embed: 1, rerank: 2 };
    return order[a.role] - order[b.role];
  });

  for (const artifact of artifacts) {
    if (artifact.specQuantMismatch) {
      process.stdout.write(
        `! ${artifact.id}: SPEC asks for Q4 but only ${artifact.hfFile} exists on HF — downloading that.\n`,
      );
    }
    const dest = modelLocalPath(artifact, modelsDir);
    if (!args.force && (await fileExists(dest))) {
      process.stdout.write(`· skip (exists) ${artifact.id}\n`);
    } else {
      await downloadWithProgress(artifact, modelsDir);
    }
    await maybeDownloadMmproj(artifact, modelsDir, args.force);
  }

  await writeFile(join(modelsDir, "REDROB_MODELS_DIR.txt"), `${modelsDir}\n`, "utf8");
  process.stdout.write(`\nDone. Before running Desk / rrx:\n`);
  process.stdout.write(`  export REDROB_MODELS_DIR="${modelsDir.replaceAll("\\", "/")}"\n`);
  if (process.platform === "win32") {
    process.stdout.write(`  setx REDROB_MODELS_DIR "${modelsDir}"\n`);
  }
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`download-models failed: ${message}\n`);
  process.exitCode = 1;
});
