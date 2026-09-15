/**
 * One-shot CUDA path smoke (not a bench). Four product paths × Qwen3.5-2B.
 * Usage: node scripts/path-smoke-once.mjs --model <gguf> --exec-tier cuda
 */
import { join } from "node:path";
import { readFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";

function arg(name) {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

const modelPath =
  arg("--model") ||
  join(
    process.env.LOCALAPPDATA ?? "",
    "redrob",
    "models",
    "unsloth",
    "Qwen3.5-2B-GGUF",
    "Qwen3.5-2B-Q4_K_M.gguf",
  );
const execTier = arg("--exec-tier") === "cpu" ? "cpu" : "cuda";

process.env.REDROB_BACKEND = execTier;
process.env.REDROB_VERIFY_MODEL_PATH = modelPath;
process.env.REDROB_PACK_TIER = process.env.REDROB_PACK_TIER || "T4";
process.env.REDROB_MODELS_DIR =
  process.env.REDROB_MODELS_DIR ||
  join(process.env.LOCALAPPDATA ?? "", "redrob", "models");

const root = process.cwd();
const kernel = await import(pathToFileURL(join(root, "packages/kernel/dist/index.js")).href);
const extractMod = await import(pathToFileURL(join(root, "packages/extract/dist/index.js")).href);
const compareMod = await import(pathToFileURL(join(root, "packages/compare/dist/index.js")).href);
const registry = await import(pathToFileURL(join(root, "packages/registry/dist/index.js")).href);

await kernel.applyExecutionPlan({ memTier: "T4", backendOverride: execTier });
const plan = kernel.getActiveExecutionPlan();
console.log(kernel.formatExecutionPlanLog(plan));
console.log("VERIFY_MODEL", modelPath);
console.log("exec-tier", execTier);

function preview(value) {
  const s = value == null ? "—" : typeof value === "string" ? value : JSON.stringify(value);
  return s.length > 80 ? `${s.slice(0, 77)}...` : s;
}

async function runExtract() {
  const doc = await readFile(join(root, "packages/extract/fixtures/01.txt"), "utf8");
  const streamed = [];
  const t0 = performance.now();
  const result = await extractMod.extract({
    source: { kind: "text", content: doc },
    schemaId: "recruiting/resume",
    onField: (field) => {
      streamed.push(field.path);
      console.log(`  [stream] ${field.path} = ${preview(field.value)}`);
    },
  });
  const wall = Math.round(performance.now() - t0);
  const sample = Object.fromEntries(
    result.fields.slice(0, 8).map((f) => [f.path, preview(f.value)]),
  );
  return {
    path: "extract",
    wallMs: wall,
    error: result.errors,
    gfail: result.grammarFails,
    rebuild: result.rebuilds,
    bleed_trimmed: result.bleedTrimmed,
    stream_events: streamed.length,
    streaming: streamed.length > 1,
    sample,
  };
}

async function runAssess() {
  const text = [
    "name: 김민수",
    "email: minsu@example.com",
    "skills: TypeScript, NestJS, PostgreSQL",
    "experience: 4 years backend at SaaS",
    "delivered API platform used by 20 teams",
  ].join("\n");
  const streamed = [];
  const t0 = performance.now();
  const result = await compareMod.compare({
    artifact: { kind: "text", content: text },
    rubricId: "recruiting/candidate-6axis",
    onField: (field) => {
      streamed.push(field.streamTarget);
      console.log(`  [stream] ${field.streamTarget} = ${preview(field.value)}`);
    },
  });
  const wall = Math.round(performance.now() - t0);
  return {
    path: "assess",
    wallMs: wall,
    error: result.errors,
    gfail: result.grammarFails,
    rebuild: result.rebuilds,
    bleed_trimmed: result.bleedTrimmed,
    stream_events: streamed.length,
    streaming: streamed.length > 1,
    sample: {
      scores: (result.scores ?? []).map((s) => `${s.axisId}=${s.value}/${s.max}`),
      unscored: result.unscoredAxes,
      excerpts: (result.scores ?? []).slice(0, 3).map((s) => s.evidence?.excerpt),
    },
  };
}

async function fillViaSlots(label, document, specs, hints, systemPrompt) {
  const fields = kernel.slotFieldsToFillable(specs, hints);
  const streamed = [];
  const t0 = performance.now();
  const filled = await kernel.generateFieldFill({
    modelPath,
    document,
    fields,
    systemPrompt,
    onField: (field) => {
      const target = field.path.replace(/^\//, "");
      streamed.push(target);
      console.log(`  [stream] ${target} = ${preview(field.value)}`);
    },
  });
  const wall = Math.round(performance.now() - t0);
  const values = {};
  for (const item of filled.fields) {
    if (!item.absent && item.value != null) values[item.path] = preview(item.value);
  }
  return {
    path: label,
    wallMs: wall,
    error: filled.errors ?? 0,
    gfail: filled.grammarFails ?? 0,
    rebuild: filled.rebuilds ?? 0,
    bleed_trimmed: filled.bleedTrimmed ?? 0,
    stream_events: streamed.length,
    streaming: streamed.length > 1,
    sample: values,
  };
}

async function runDraftJd() {
  const { draftSlotToSpec, draftSlotCompileHints } = kernel;
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
  ];
  const specs = slots.map((s) => draftSlotToSpec(s));
  const hints = Object.fromEntries(slots.map((s) => [s.id, draftSlotCompileHints(s)]));
  const document = [
    "직무명: Backend Engineer",
    "주요 업무:\n- NestJS API\n- PostgreSQL 스키마",
    "자격 요건:\n- TypeScript 3년\n- 클라우드 경험",
  ].join("\n\n");
  return fillViaSlots(
    "draftJd",
    document,
    specs,
    hints,
    "Fill each JD slot from the facts only. Value only per label.",
  );
}

async function runDraftFromTemplate() {
  const template = registry.loadTemplate("recruiting/decision-email");
  const slots = template.slots.map((slot) => ({
    id: slot.id,
    description: slot.description || slot.id,
    maxChars: slot.maxChars ?? 200,
    required: slot.required,
  }));
  const specs = slots.map((s) => kernel.draftSlotToSpec(s));
  const hints = Object.fromEntries(slots.map((s) => [s.id, kernel.draftSlotCompileHints(s)]));
  const data = {
    candidateName: "김민수",
    decision: "pass",
    roleTitle: "Backend Engineer",
    notes: "다음 주 화요일 면접",
  };
  const document = Object.entries(data)
    .map(([k, v]) => `${k}: ${v}`)
    .join("\n");
  return fillViaSlots(
    "draftFromTemplate",
    document,
    specs,
    hints,
    "Fill each slot from the facts. Do not invent. Value only per label.",
  );
}

const reports = [];
for (const [name, fn] of [
  ["extract", runExtract],
  ["assess", runAssess],
  ["draftJd", runDraftJd],
  ["draftFromTemplate", runDraftFromTemplate],
]) {
  console.log(`\n=== ${name} ===`);
  try {
    const report = await fn();
    reports.push(report);
    console.log(JSON.stringify(report, null, 2));
  } catch (error) {
    const fail = {
      path: name,
      error: 1,
      gfail: 0,
      rebuild: 0,
      bleed_trimmed: 0,
      streaming: false,
      fail: error instanceof Error ? error.message : String(error),
    };
    reports.push(fail);
    console.error(fail.fail);
    console.log(JSON.stringify(fail, null, 2));
  }
}

console.log("\n=== SUMMARY ===");
console.log(JSON.stringify(reports, null, 2));
