/**
 * One-shot smoke: assess + draftJd-equivalent + draftFromTemplate-equivalent.
 * Honors REDROB_BACKEND (set to cpu for CPU-path verification).
 * REDROB_MODELS_DIR defaults to %LOCALAPPDATA%/redrob/models
 */
import { writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
process.env.REDROB_MODELS_DIR =
  process.env.REDROB_MODELS_DIR ||
  join(process.env.LOCALAPPDATA || "", "redrob", "models");

async function load(rel) {
  return import(pathToFileURL(join(root, rel)).href);
}

function assembleJdMarkdown(slots, profile) {
  const roleTitle = slots.roleTitle?.trim() || "Untitled role";
  const formatList = (text) =>
    text
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter(Boolean)
      .map((l) => (l.startsWith("-") || l.startsWith("•") ? l : `- ${l}`))
      .join("\n");
  const section = (title, body) => {
    const t = body?.trim();
    return t ? ["", `## ${title}`, t] : [];
  };
  return [
    `# ${roleTitle}`,
    ...(slots.oneLiner?.trim() ? ["", slots.oneLiner.trim()] : []),
    ...section("주요 업무", slots.responsibilities && formatList(slots.responsibilities)),
    ...section("자격 요건", slots.qualifications && formatList(slots.qualifications)),
    ...section("우대 사항", slots.niceToHave && formatList(slots.niceToHave)),
    ...section("근무지", slots.location),
    ...section("팀 / 제품", slots.teamContext),
    ...section("복리후생", profile.benefits),
    ...section("근무조건", profile.workConditions),
    ...section("지원절차", profile.applicationProcess),
    ...section("회사소개", `${profile.name}\n\n${profile.about}`),
  ]
    .join("\n")
    .trim()
    .concat("\n");
}

async function smokeAssess(compareMod, kernel) {
  const { compare, citationHolds, numberLines } = compareMod;
  const plan = await kernel.applyExecutionPlan();
  const text = [
    "name: 김민수",
    "skills: TypeScript, NestJS, PostgreSQL",
    "experience: 4 years backend at SaaS",
    "delivered API platform used by 20 teams",
  ].join("\n");
  const { lines } = numberLines(text);
  const rejectDemo = {
    onLine2TypeScript: citationHolds(lines, [2], "TypeScript"),
    hallucinatedKubernetesOnLine2: citationHolds(lines, [2], "Kubernetes"),
  };
  const result = await compare({
    artifact: { kind: "text", content: text },
    rubricId: "recruiting/candidate-6axis",
  });
  return {
    plan: {
      backend: plan.backend,
      modelId: plan.modelId,
      gpuLayers: plan.gpuLayers,
      threads: plan.threads,
      contextSize: plan.contextSize,
      reason: plan.reason,
    },
    rejectDemo,
    scores: (result.scores ?? []).map((s) => ({
      axisId: s.axisId,
      value: s.value,
      max: s.max,
      evidence: s.evidence,
    })),
    unscoredAxes: result.unscoredAxes,
    findingsCount: result.findings.length,
    timingMs: Math.round(result.timing.totalMs),
  };
}

async function smokeJd(kernel) {
  const { applyExecutionPlan, generateFieldFill, formatExecutionPlanLog } = kernel;
  const plan = await applyExecutionPlan();
  console.error(formatExecutionPlanLog(plan));
  const slots = [
    { id: "roleTitle", description: "Job title", maxChars: 60, required: true },
    { id: "oneLiner", description: "One-sentence summary", maxChars: 160, required: true },
    { id: "responsibilities", description: "Responsibilities as - bullets", maxChars: 300, required: true },
    { id: "qualifications", description: "Qualifications as - bullets", maxChars: 300, required: true },
    { id: "niceToHave", description: "Nice-to-have or 없음", maxChars: 200, required: false },
    { id: "location", description: "Location or 없음", maxChars: 80, required: false },
    { id: "teamContext", description: "Team context or 없음", maxChars: 160, required: false },
  ];
  const document = [
    "직무명: Backend Engineer",
    "주요 업무:\n- API design\n- On-device inference integration",
    "자격 요건:\n- TypeScript\n- Node.js",
    "근무지: Seoul / Hybrid",
  ].join("\n\n");
  const filled = await generateFieldFill({
    modelPath: plan.modelPath,
    document,
    fields: slots.map((s) => ({
      path: `/${s.id}`,
      type: "string",
      required: s.required,
      label: s.id,
      description: s.description,
      maxChars: s.maxChars,
      maxTokens: s.maxChars * 3 + 2,
    })),
    systemPrompt: "Fill each JD slot from the facts only. Value then newline. No headings.",
  });
  const values = {};
  for (const item of filled.fields) {
    const id = item.path.slice(1);
    if (!item.absent && item.value != null) values[id] = String(item.value);
  }
  if (!values.roleTitle) values.roleTitle = "Backend Engineer";
  if (!values.responsibilities) values.responsibilities = "- API design\n- On-device inference integration";
  if (!values.qualifications) values.qualifications = "- TypeScript\n- Node.js";
  const profile = {
    name: "Redrob",
    about: "On-device recruiting tools.",
    benefits: "- Health insurance\n- Learning stipend",
    workConditions: "- Full-time\n- Hybrid",
    applicationProcess: "1. Resume\n2. Screen\n3. Interview",
  };
  const markdown = assembleJdMarkdown(values, profile);
  return {
    backend: plan.backend,
    modelId: plan.modelId,
    values,
    hasBenefits: /복리후생/.test(markdown),
    hasAbout: /회사소개/.test(markdown),
    markdown,
    documentTruncated: filled.documentTruncated ?? false,
  };
}

async function smokeTemplate(kernel) {
  const { applyExecutionPlan, generateFieldFill } = kernel;
  const plan = await applyExecutionPlan();
  const slots = [
    { id: "roleTitle", description: "Role title", maxChars: 60, required: true },
    { id: "responsibilities", description: "Responsibilities", maxChars: 300, required: true },
    { id: "qualifications", description: "Qualifications", maxChars: 300, required: true },
  ];
  const filled = await generateFieldFill({
    modelPath: plan.modelPath,
    document: "roleTitle: Platform Engineer\nresponsibilities: own CI\nqualifications: Go",
    fields: slots.map((s) => ({
      path: `/${s.id}`,
      type: "string",
      required: s.required,
      label: s.id,
      description: s.description,
      maxChars: s.maxChars,
      maxTokens: s.maxChars * 3 + 2,
    })),
  });
  const sections = filled.fields
    .filter((f) => !f.absent && f.value != null)
    .map((f) => `## ${f.path.slice(1)}\n\n${String(f.value)}`);
  return {
    backend: plan.backend,
    modelId: plan.modelId,
    markdown: `${sections.join("\n\n")}\n`,
    fieldCount: sections.length,
  };
}

async function main() {
  const compareMod = await load("packages/compare/dist/index.js");
  const kernel = await load("packages/kernel/dist/index.js");

  console.error(`REDROB_BACKEND=${process.env.REDROB_BACKEND || "(auto)"}`);
  console.error("1/3 assess (compare)…");
  const assess = await smokeAssess(compareMod, kernel);
  console.error(
    `   backend=${assess.plan.backend} model=${assess.plan.modelId} scores=${assess.scores.length} unscored=${assess.unscoredAxes.length} ${assess.timingMs}ms`,
  );

  console.error("2/3 draftJd slot-fill…");
  const draftJd = await smokeJd(kernel);
  console.error(`   backend=${draftJd.backend} benefits=${draftJd.hasBenefits} about=${draftJd.hasAbout}`);

  console.error("3/3 draftFromTemplate slot-fill…");
  const draftFromTemplate = await smokeTemplate(kernel);
  console.error(`   backend=${draftFromTemplate.backend} fields=${draftFromTemplate.fieldCount}`);

  const report = {
    isolationNote: "Desk app uses Electron utilityProcess; this smoke runs in-process Node.",
    assess,
    draftJd,
    draftFromTemplate,
  };
  writeFileSync(join(root, "smoke-field-fill-result.json"), `${JSON.stringify(report, null, 2)}\n`);
  console.log(JSON.stringify(report, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
