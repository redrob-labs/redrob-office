/**
 * One-shot draftJd fill with long English title — check truncation.
 * Do NOT use `node --input-type=module` (breaks CUDA binding test).
 */
import { join } from "node:path";
import { pathToFileURL } from "node:url";

const modelPath =
  process.argv.includes("--model")
    ? process.argv[process.argv.indexOf("--model") + 1]
    : join(
        process.env.LOCALAPPDATA ?? "",
        "redrob",
        "models",
        "unsloth",
        "Qwen3.5-2B-GGUF",
        "Qwen3.5-2B-Q4_K_M.gguf",
      );
const execTier = process.argv.includes("--exec-tier")
  ? process.argv[process.argv.indexOf("--exec-tier") + 1]
  : "cuda";

process.env.REDROB_BACKEND = execTier;
process.env.REDROB_VERIFY_MODEL_PATH = modelPath;
process.env.REDROB_PACK_TIER = process.env.REDROB_PACK_TIER || "T4";
process.env.REDROB_MODELS_DIR =
  process.env.REDROB_MODELS_DIR ||
  join(process.env.LOCALAPPDATA ?? "", "redrob", "models");

const root = process.cwd();
const kernel = await import(pathToFileURL(join(root, "packages/kernel/dist/index.js")).href);
await kernel.applyExecutionPlan({ memTier: "T4", backendOverride: execTier });
console.log(kernel.formatExecutionPlanLog(kernel.getActiveExecutionPlan()));

const slots = [
  { id: "roleTitle", description: "Job title only", maxChars: 60, required: true },
  { id: "oneLiner", description: "One-sentence role summary", maxChars: 160, required: true },
  {
    id: "responsibilities",
    description: "Bullet list of primary responsibilities",
    maxChars: 300,
    required: true,
  },
  {
    id: "qualifications",
    description: "Bullet list of required qualifications",
    maxChars: 300,
    required: true,
  },
  { id: "niceToHave", description: "Optional nice-to-have", maxChars: 200, required: false },
  { id: "location", description: "Work location", maxChars: 80, required: false },
  { id: "teamContext", description: "Team context", maxChars: 160, required: false },
];
const specs = slots.map((s) => kernel.draftSlotToSpec(s));
const hints = Object.fromEntries(slots.map((s) => [s.id, kernel.draftSlotCompileHints(s)]));
const fields = kernel.slotFieldsToFillable(specs, hints);
for (const f of fields) {
  console.log(
    `budget ${f.path} maxChars=${f.maxChars} maxTokens=${f.maxTokens} need=${(f.maxChars ?? 0) * 3 + 2}`,
  );
}

const document = [
  "직무명: Senior Backend Engineer, Platform",
  "주요 업무:\n- Own NestJS API platform used by 20 product teams\n- Design PostgreSQL schemas and migration strategy\n- Improve p99 latency for on-device inference gateways\n- Mentor juniors on TypeScript service patterns",
  "자격 요건:\n- 5+ years TypeScript/Node.js in production\n- Strong PostgreSQL and distributed systems experience\n- Comfortable with cloud networking and observability",
  "근무지: Seoul, Korea (hybrid, 3 days in office)",
  "팀: Platform group building the inference control plane",
].join("\n\n");

const t0 = performance.now();
const filled = await kernel.generateFieldFill({
  modelPath,
  document,
  fields,
  systemPrompt:
    "Fill each JD slot from the facts only. Value only per label. Use - bullets where asked.",
});
const wall = Math.round(performance.now() - t0);

let anyTruncated = false;
for (const item of filled.fields) {
  const v = item.absent ? null : String(item.value ?? "");
  const mc = fields.find((f) => f.path === item.path)?.maxChars;
  const truncated = typeof v === "string" && mc !== undefined && v.length >= mc;
  if (truncated) anyTruncated = true;
  console.log(
    `VALUE ${item.path} chars=${v?.length ?? 0}/${mc} truncated_at_bound=${truncated} bleed=${!!item.bleedTrimmed}`,
  );
  console.log(JSON.stringify(v));
}
console.log(
  JSON.stringify(
    {
      wallMs: wall,
      error: filled.errors,
      gfail: filled.grammarFails,
      rebuild: filled.rebuilds,
      bleed_trimmed: filled.bleedTrimmed,
      any_truncated_at_bound: anyTruncated,
    },
    null,
    2,
  ),
);
