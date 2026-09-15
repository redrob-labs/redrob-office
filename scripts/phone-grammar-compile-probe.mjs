/**
 * Solo phone GBNF compile + all-schema grammar assert.
 * Prefer cuda; fall back to cpu for compile-only.
 */
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
// Resolve workspace packages via extract's node_modules (has @redrob links)
const extractNm = join(process.cwd(), "packages/extract/node_modules");

async function loadDist(pkgRel, file = "dist/index.js") {
  const href = pathToFileURL(join(process.cwd(), pkgRel, file)).href;
  return import(href);
}

const kernel = await loadDist("packages/kernel");
const registry = await loadDist("packages/registry");

const {
  applyExecutionPlan,
  getCachedLlama,
  fieldValueToGbnf,
  assertSchemaFieldsGrammarsCompile,
} = kernel;
const { listSchemaIds, loadSchema } = registry;

async function tryBackend(backendOverride) {
  await applyExecutionPlan({ backendOverride });
  return getCachedLlama();
}

async function main() {
  let llama;
  let backend = "cuda";
  try {
    llama = await tryBackend("cuda");
    console.info("backend: cuda");
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.warn(`cuda plan/load failed (${msg}); falling back to cpu for compile-only`);
    backend = "cpu";
    llama = await tryBackend("cpu");
    console.info("backend: cpu");
  }

  const phoneField = {
    path: "/phone",
    type: "string",
    required: false,
    semanticType: "phone",
    maxChars: 32,
  };
  const gbnf = fieldValueToGbnf(phoneField);
  console.info("phone GBNF length:", gbnf.length);
  await llama.createGrammar({ grammar: gbnf });
  console.log("PHONE_COMPILE_OK");

  const schemaIds = listSchemaIds();
  await assertSchemaFieldsGrammarsCompile(
    schemaIds.map((id) => ({ id, fields: loadSchema(id).fields })),
  );
  console.log("SCHEMA_GRAMMAR_ASSERT_OK");
  console.info(`schemas asserted: ${schemaIds.length} (backend=${backend})`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
