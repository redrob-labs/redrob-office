/**
 * Minimal extract accuracy compare. Not a bench harness.
 * Args: --model <path> --backend <backend-id|auto>
 * Optional: --fixtures 04,06,07 --absent <token>
 */
import { readdir, readFile } from "node:fs/promises";
import { basename, dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  BACKEND_IDS,
  applyExecutionPlan,
  assertSchemaFieldsGrammarsCompile,
  scoreFields,
  type BackendId,
  type FieldErrorClass,
} from "@redrob/kernel";
import { listSchemaIds, loadSchema } from "@redrob/registry";

import { extract } from "./index.js";

const SCHEMA_ID = "recruiting/resume";
const HERE = dirname(fileURLToPath(import.meta.url));
const FIXTURES_DIR = join(HERE, "../fixtures");

function parseArgs(argv: string[]): {
  model: string;
  backend: BackendId | "auto";
  fixtures: string[] | null;
  absent: string | null;
} {
  let model = "";
  let backend: BackendId | "auto" = "auto";
  let fixtures: string[] | null = null;
  let absent: string | null = null;
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--model") {
      model = argv[++i] ?? "";
    } else if (arg === "--backend") {
      const v = (argv[++i] ?? "").toLowerCase();
      if (v !== "auto" && !(BACKEND_IDS as string[]).includes(v)) {
        throw new Error(`--backend must be auto|${BACKEND_IDS.join("|")}, got ${v}`);
      }
      backend = v as BackendId | "auto";
    } else if (arg === "--fixtures") {
      const raw = argv[++i] ?? "";
      fixtures = raw
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);
    } else if (arg === "--absent") {
      absent = argv[++i] ?? "";
    }
  }
  if (!model) throw new Error("Required: --model <path>");
  return { model: resolve(model), backend, fixtures, absent };
}

type Counts = Record<"ok" | "value_wrong" | "miss" | "hallucination", number>;

function emptyCounts(): Counts {
  return { ok: 0, value_wrong: 0, miss: 0, hallucination: 0 };
}

function add(into: Counts, cls: FieldErrorClass): void {
  into[cls] += 1;
}

async function main(): Promise<void> {
  const { model, backend, fixtures, absent } = parseArgs(process.argv.slice(2));
  process.env.REDROB_VERIFY_MODEL_PATH = model;
  process.env.REDROB_BACKEND = backend;
  if (absent !== null) {
    process.env.REDROB_ABSENT_TOKEN = absent;
  }
  if (!process.env.REDROB_MODELS_DIR) {
    const local = process.env.LOCALAPPDATA;
    if (!local) throw new Error("Set REDROB_MODELS_DIR");
    process.env.REDROB_MODELS_DIR = join(local, "redrob", "models");
  }

  await applyExecutionPlan({
    memTier: "T4",
    backendOverride: backend,
  });

  const schemaIds = listSchemaIds();
  await assertSchemaFieldsGrammarsCompile(
    schemaIds.map((id) => ({ id, fields: loadSchema(id).fields })),
  );
  console.info(`grammar-assert: compiled ${schemaIds.length} schemas ok`);

  let names = (await readdir(FIXTURES_DIR))
    .filter((n) => n.endsWith(".txt"))
    .sort();
  if (fixtures && fixtures.length > 0) {
    const want = new Set(fixtures);
    names = names.filter((n) => want.has(basename(n, ".txt")));
  }
  if (names.length === 0) {
    throw new Error(`No fixtures in ${FIXTURES_DIR}`);
  }

  const totals = emptyCounts();
  const perField = new Map<string, Counts>();
  const details: string[] = [];
  let rebuilds = 0;
  let bleedTrimmed = 0;
  let grammarFails = 0;
  let errors = 0;
  const t0 = performance.now();

  for (const name of names) {
    const id = basename(name, ".txt");
    const docPath = join(FIXTURES_DIR, name);
    const goldPath = join(FIXTURES_DIR, `${id}.gold.json`);
    const gold = JSON.parse(await readFile(goldPath, "utf8")) as Record<
      string,
      unknown
    >;
    const document = await readFile(docPath, "utf8");

    const result = await extract({
      source: { kind: "text", content: document },
      schemaId: SCHEMA_ID,
    });
    rebuilds += result.rebuilds;
    bleedTrimmed += result.bleedTrimmed;
    grammarFails += result.grammarFails;
    errors += result.errors;

    const predicted: Record<string, unknown> = {};
    for (const field of result.fields) {
      predicted[field.path] = field.value;
    }

    for (const row of scoreFields(gold, predicted)) {
      add(totals, row.classification);
      const bucket = perField.get(row.path) ?? emptyCounts();
      add(bucket, row.classification);
      perField.set(row.path, bucket);
      details.push(
        `${id} ${row.path} ${row.classification} gold=${JSON.stringify(row.gold)} pred=${JSON.stringify(row.predicted)}`,
      );
    }
  }

  const wallMs = Math.round(performance.now() - t0);

  console.log("");
  console.log(`model: ${model}`);
  console.log(`backend: ${backend}`);
  console.log(`absent-token: ${process.env.REDROB_ABSENT_TOKEN ?? "N/A"}`);
  console.log(`fixtures: ${names.map((n) => basename(n, ".txt")).join(",")}`);
  console.log(`wall_ms: ${wallMs}`);
  console.log("");
  console.log("totals");
  console.log(
    `  ok=${totals.ok}  value_wrong=${totals.value_wrong}  miss=${totals.miss}  hallucination=${totals.hallucination}  error=${errors}  gfail=${grammarFails}  rebuild=${rebuilds}  bleed_trimmed=${bleedTrimmed}`,
  );
  console.log("");
  console.log("per-field");
  for (const path of [...perField.keys()].sort()) {
    const c = perField.get(path)!;
    console.log(
      `  ${path}  ok=${c.ok}  value_wrong=${c.value_wrong}  miss=${c.miss}  hallucination=${c.hallucination}`,
    );
  }
  console.log("");
  console.log("field-detail");
  for (const line of details) {
    console.log(`  ${line}`);
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exitCode = 1;
});
