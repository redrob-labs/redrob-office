/**
 * 1-field field-fill smoke for Qwen3.5 template / raw-byte diagnosis.
 * Usage: node scripts/field-fill-smoke.mjs --model <gguf>
 */
import { join } from "node:path";
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
    "verify",
    "Qwen3.5-2B-Q4_K_M.gguf",
  );

process.env.REDROB_BACKEND = arg("--exec-tier") || process.env.REDROB_BACKEND || "cpu";
process.env.REDROB_MODELS_DIR =
  process.env.REDROB_MODELS_DIR ||
  join(process.env.LOCALAPPDATA ?? "", "redrob", "models");
process.env.REDROB_VERIFY_MODEL_PATH = modelPath;
process.env.REDROB_PACK_TIER = process.env.REDROB_PACK_TIER || "T4";

const execTier = process.env.REDROB_BACKEND === "cuda" ? "cuda" : "cpu";

const kernelRoot = join(process.cwd(), "packages/kernel");
const kernel = await import(pathToFileURL(join(kernelRoot, "dist/index.js")).href);
const ff = await import(
  pathToFileURL(join(kernelRoot, "dist/inference/field-fill.js")).href
);

// Byte-assert vs known llama-server --jinja apply-template output
const JINJA_PING =
  "<|im_start|>user\nping<|im_end|>\n<|im_start|>assistant\n<think>\n\n</think>\n\n";
const expectedSuffix = "<|im_start|>assistant\n<think>\n\n</think>\n\n";
if (ff.QWEN35_JINJA_NON_THINK_ASSISTANT_SUFFIX !== expectedSuffix) {
  throw new Error(
    `constant drift: ${JSON.stringify(ff.QWEN35_JINJA_NON_THINK_ASSISTANT_SUFFIX)}`,
  );
}
if (!JINJA_PING.endsWith(expectedSuffix)) {
  throw new Error("jinja ping fixture suffix mismatch");
}

const gbnf = (await import(pathToFileURL(join(kernelRoot, "dist/field-fill-grammar.js")).href))
  .fieldValueToGbnf({ path: "/name", type: "string", required: true });
console.log("grammar_string=\n" + gbnf);
if (!gbnf.includes("root ::= absent nl | text nl")) {
  throw new Error(`expected value+nl root, got: ${gbnf}`);
}
if (/\bws\b/.test(gbnf)) {
  throw new Error(`open-ended ws still present: ${gbnf}`);
}

await kernel.applyExecutionPlan({ memTier: "T4", backendOverride: execTier });
console.log(kernel.formatExecutionPlanLog(kernel.getActiveExecutionPlan()));
console.log("exec-tier=", execTier);
console.log("model=", modelPath);
console.log("family=", ff.detectChatFamily(modelPath));

const session = await ff.FieldFillSession.open({
  modelPath,
  document: "이름: 김민수\n",
  fields: [
    {
      path: "/name",
      type: "string",
      required: true,
      description: "Candidate full name",
    },
  ],
});

const t0 = performance.now();
const item = await session.fill({
  path: "/name",
  type: "string",
  required: true,
  description: "Candidate full name",
});
await session.close();
console.log(
  JSON.stringify(
    {
      wallMs: Math.round(performance.now() - t0),
      value: item.value,
      absent: item.absent,
      rawText: item.rawText,
      error: item.error ?? null,
    },
    null,
    2,
  ),
);
