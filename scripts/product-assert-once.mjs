/**
 * Compile all four product path slot grammars (boot assert parity).
 * Do NOT use `node --input-type=module`.
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
const registry = await import(pathToFileURL(join(root, "packages/registry/dist/index.js")).href);
await kernel.applyExecutionPlan({ memTier: "T4", backendOverride: execTier });

const fields = [];
for (const id of registry.listSchemaIds()) {
  fields.push(...kernel.schemaFieldsToFillable(registry.loadSchema(id).fields));
}
for (const id of registry.listRubricIds()) {
  for (const axis of registry.loadRubric(id).axes) {
    const { specs, hints } = kernel.axisToSlotSpecs(axis);
    for (const s of specs) fields.push(kernel.slotFieldToFillable(s, hints[s.id] ?? {}));
  }
}
const jdSlots = [
  { id: "roleTitle", maxChars: 60, required: true, description: "t" },
  { id: "oneLiner", maxChars: 160, required: true, description: "t" },
  { id: "responsibilities", maxChars: 300, required: true, description: "t" },
  { id: "qualifications", maxChars: 300, required: true, description: "t" },
  { id: "niceToHave", maxChars: 200, required: false, description: "t" },
  { id: "location", maxChars: 80, required: false, description: "t" },
  { id: "teamContext", maxChars: 160, required: false, description: "t" },
];
fields.push(...kernel.slotFieldsToFillable(jdSlots.map((s) => kernel.draftSlotToSpec(s))));
for (const id of registry.listTemplateIds()) {
  const t = registry.loadTemplate(id);
  const slots = t.slots.map((s) => ({
    id: s.id,
    description: s.description || s.id,
    maxChars: s.maxChars ?? 200,
    required: s.required,
  }));
  fields.push(...kernel.slotFieldsToFillable(slots.map((s) => kernel.draftSlotToSpec(s))));
}
await kernel.assertFieldGrammarsCompile(fields);
console.log(
  `PRODUCT_ASSERT_OK fields=${fields.length} schemas=${registry.listSchemaIds().length} rubrics=${registry.listRubricIds().length} templates=${registry.listTemplateIds().length} jd=${jdSlots.length}`,
);
