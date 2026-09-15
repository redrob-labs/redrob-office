/**
 * Assess once. Do NOT use `node --input-type=module` — it breaks CUDA binding tests.
 * Usage: node scripts/assess-once.mjs --model <gguf> --exec-tier cpu|cuda
 */
import { join } from "node:path";
import { pathToFileURL } from "node:url";

function arg(name) {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

const modelPath = arg("--model");
if (!modelPath) throw new Error("--model required");
const execTier = arg("--exec-tier") === "cuda" ? "cuda" : "cpu";

process.env.REDROB_BACKEND = execTier;
process.env.REDROB_MODELS_DIR =
  process.env.REDROB_MODELS_DIR ||
  join(process.env.LOCALAPPDATA ?? "", "redrob", "models");
process.env.REDROB_VERIFY_MODEL_PATH = modelPath;
process.env.REDROB_PACK_TIER = process.env.REDROB_PACK_TIER || "T4";

const root = process.cwd();
const compare = await import(
  pathToFileURL(join(root, "packages/compare/dist/index.js")).href
);
const kernel = await import(
  pathToFileURL(join(root, "packages/kernel/dist/index.js")).href
);
const ff = await import(
  pathToFileURL(join(root, "packages/kernel/dist/inference/field-fill.js")).href
);

await kernel.applyExecutionPlan({ memTier: "T4", backendOverride: execTier });
console.log(kernel.formatExecutionPlanLog(kernel.getActiveExecutionPlan()));
console.log("VERIFY_MODEL", modelPath);
console.log("CHAT_FAMILY", ff.detectChatFamily(modelPath));
console.log("exec-tier", execTier);

const text = [
  "name: 김민수",
  "skills: TypeScript, NestJS, PostgreSQL",
  "experience: 4 years backend at SaaS",
  "delivered API platform used by 20 teams",
].join("\n");

const t0 = performance.now();
const result = await compare.compare({
  artifact: { kind: "text", content: text },
  rubricId: "recruiting/candidate-6axis",
});
const wall = Math.round(performance.now() - t0);
console.log(
  JSON.stringify(
    {
      wallMs: wall,
      scores: (result.scores ?? []).length,
      unscored: result.unscoredAxes,
      scoreIds: (result.scores ?? []).map((s) => s.axisId),
      scoreSample: (result.scores ?? []).map((s) => ({
        id: s.axisId,
        value: s.value,
        excerpt: s.evidence?.excerpt,
      })),
      error: result.errors,
      gfail: result.grammarFails,
      rebuild: result.rebuilds,
      bleed_trimmed: result.bleedTrimmed,
    },
    null,
    2,
  ),
);
