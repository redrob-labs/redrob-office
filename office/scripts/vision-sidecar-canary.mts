/**
 * Canary for temporary llama-server vision sidecar (Step 1–2).
 * Run from repo: pnpm --filter @redrob/office exec tsx ./scripts/vision-sidecar-canary.mts
 */
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import {
  generateVisionChat,
  resetVisionSidecarForTests,
  resolveLlamaServerBinary,
  resolveVisionLmPath,
  resolveVisionMmprojPath,
  shutdownVisionSidecar,
  visionSidecarAssetsReady,
} from "../src/main/services/vision/index.ts";

const PROBE =
  process.env.REDROB_VISION_CANARY_IMAGE?.trim() ||
  join(
    process.env.USERPROFILE ?? "",
    "redrob",
    "redrob-office",
    "tmp",
    "qwen35-ab-phase0",
    "probe.prepared.png",
  );

const PROMPT =
  "What exact alphanumeric token is printed in the white box on the cyan background? Reply with only that token, nothing else.";

async function main(): Promise<void> {
  resetVisionSidecarForTests();
  const server = resolveLlamaServerBinary();
  const mmproj = resolveVisionMmprojPath();
  const lm = await resolveVisionLmPath();
  const ready = await visionSidecarAssetsReady();
  console.log(
    JSON.stringify(
      {
        server,
        mmproj,
        lm,
        ready,
        probe: PROBE,
      },
      null,
      2,
    ),
  );
  if (!ready) {
    throw new Error("vision sidecar assets not ready");
  }

  const bytes = await readFile(PROBE);

  console.log("=== A: WITH image ===");
  const a = await generateVisionChat({
    prompt: PROMPT,
    images: [{ mimeType: "image/png", bytes }],
    maxTokens: 128,
    temperature: 0.1,
  });
  console.log(a.text);
  const aHit = a.text.includes("ZEBRA-7741");
  console.log("A_HAS_ZEBRA-7741", aHit);

  console.log("=== B: NO image ===");
  let bText = "";
  let bEmptyFail = false;
  try {
    const b = await generateVisionChat({
      prompt: PROMPT,
      images: [],
      maxTokens: 128,
      temperature: 0.1,
    });
    bText = b.text;
    console.log(bText);
  } catch (err) {
    bEmptyFail = true;
    bText = err instanceof Error ? err.message : String(err);
    console.log("B_THREW", bText);
  }
  const bHit = bText.includes("ZEBRA-7741");
  console.log("B_HAS_ZEBRA-7741", bHit);
  console.log(
    JSON.stringify(
      {
        diverge: aHit && !bHit,
        aHit,
        bHit,
        bEmptyFail,
      },
      null,
      2,
    ),
  );
  if (!aHit || bHit) {
    process.exitCode = 1;
  }
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => {
    shutdownVisionSidecar();
  });
