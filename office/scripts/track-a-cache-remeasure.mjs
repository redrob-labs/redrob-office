/**
 * Track A remasure: cache_prompt field-fill on 3 real resumes (2–4K tok),
 * HTTP wall (prefill+decode+RTT) vs NLC wall. No migration code.
 *
 * node office/scripts/track-a-cache-remeasure.mjs
 */
import { spawn } from "node:child_process";
import { createServer } from "node:net";
import { mkdir, writeFile, readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { pathToFileURL } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "../..");
const OUT = join(ROOT, "tmp/qwen35-ab-phase0");
const RESUME_DIR = join(OUT, "resumes-track-a");
const SLOT_DIR = join(OUT, "slot-cache-track-a-remeasure");
const RESULT = join(OUT, "track-a-cache-remeasure.json");

const LM = join(
  process.env.LOCALAPPDATA ?? "",
  "redrob/models/Qwen/Qwen3-4B-GGUF/Qwen3-4B-Q4_K_M.gguf",
);
const BIN = join(
  process.env.LOCALAPPDATA ?? "",
  "redrob/verify-tools/bin-cuda/llama-server.exe",
);

const FIELDS = [
  { path: "name", type: "string", required: true, label: "name", maxChars: 48 },
  { path: "email", type: "string", required: true, label: "email", semanticType: "email", maxChars: 64 },
  { path: "skills", type: "string", required: true, label: "skills", semanticType: "list", maxChars: 120 },
  { path: "experience", type: "string", required: true, label: "experience", maxChars: 120 },
  { path: "phone", type: "string", required: false, label: "phone", semanticType: "phone", maxChars: 32 },
];

async function freePort() {
  return await new Promise((resolve, reject) => {
    const probe = createServer();
    probe.once("error", reject);
    probe.listen(0, "127.0.0.1", () => {
      const address = probe.address();
      const port = address && typeof address === "object" ? address.port : 0;
      probe.close((err) => (err ? reject(err) : resolve(port)));
    });
  });
}

async function loadHelpers() {
  const mod = await import(
    pathToFileURL(join(ROOT, "packages/kernel/dist/field-fill-grammar.js")).href
  );
  const promptMod = await import(
    pathToFileURL(join(ROOT, "packages/kernel/dist/inference/prompt-assembly.js")).href
  );
  const ff = await import(
    pathToFileURL(join(ROOT, "packages/kernel/dist/inference/field-fill.js")).href
  );
  return { ...mod, ...promptMod, ...ff };
}

function buildPreamble(helpers, document) {
  const fieldLines = FIELDS.map(
    (field) =>
      `- ${helpers.fillLabel(field)} (${field.type}${field.required ? ", required" : ""}): ${helpers.describeFillField(field)}`,
  ).join("\n");
  const system = [
    "Read the document. After each label, write only the value then a newline.",
    `If unknown or not present, write exactly ${helpers.getAbsentToken()}.`,
    "Do not write JSON, keys, or explanations.",
  ].join(" ");
  const schema = ["Fields (label → value on the following lines):", fieldLines].join("\n");
  const body = helpers.assembleInferencePrompt({ system, schema, document });
  return [
    "<|im_start|>user",
    body,
    "/no_think",
    "<|im_end|>",
    "<|im_start|>assistant",
    "<think>\n\n</think>\n",
  ].join("\n");
}

class TextServer {
  constructor() {
    this.child = null;
    this.port = 0;
    this.spawnCmd = "";
  }
  async start() {
    await this.stop();
    await mkdir(SLOT_DIR, { recursive: true });
    this.port = await freePort();
    const args = [
      "-m",
      LM,
      "--host",
      "127.0.0.1",
      "--port",
      String(this.port),
      "-ngl",
      "99",
      "-c",
      "16384",
      "--parallel",
      "1",
      "--slot-save-path",
      SLOT_DIR,
      "--reasoning",
      "off",
    ];
    this.spawnCmd = `${BIN} ${args.join(" ")}`;
    console.log("SPAWN", this.spawnCmd);
    this.child = spawn(BIN, args, { windowsHide: true, cwd: dirname(BIN) });
    let err = "";
    this.child.stderr.on("data", (d) => {
      err += d.toString();
      if (err.length > 8000) err = err.slice(-4000);
    });
    const t0 = Date.now();
    while (Date.now() - t0 < 180_000) {
      if (this.child.exitCode != null) throw new Error(`server exit ${this.child.exitCode}\n${err.slice(-1500)}`);
      try {
        if ((await fetch(`http://127.0.0.1:${this.port}/health`)).ok) return;
      } catch {
        /* wait */
      }
      await new Promise((r) => setTimeout(r, 400));
    }
    throw new Error(`health timeout\n${err.slice(-1500)}`);
  }
  async stop() {
    if (!this.child) return;
    try {
      this.child.kill();
    } catch {
      /* */
    }
    this.child = null;
    this.port = 0;
    await new Promise((r) => setTimeout(r, 2500));
  }
}

async function streamCompletion(port, body) {
  const wall0 = performance.now();
  const res = await fetch(`http://127.0.0.1:${port}/completion`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} ${await res.text()}`);
  const reader = res.body.getReader();
  const dec = new TextDecoder();
  let buf = "";
  let text = "";
  let lastTimings = null;
  let lastMeta = null;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += dec.decode(value, { stream: true });
    const lines = buf.split("\n");
    buf = lines.pop() ?? "";
    for (const line of lines) {
      const s = line.trim();
      if (!s.startsWith("data:")) continue;
      const payload = s.slice(5).trim();
      if (!payload || payload === "[DONE]") continue;
      try {
        const j = JSON.parse(payload);
        if (j.content) text += j.content;
        if (j.timings) lastTimings = j.timings;
        lastMeta = j;
      } catch {
        /* */
      }
    }
  }
  const wallMs = performance.now() - wall0;
  const tokensCached =
    lastTimings?.cache_n ?? lastMeta?.tokens_cached ?? lastMeta?.timings?.cache_n ?? null;
  const promptN = lastTimings?.prompt_n ?? lastMeta?.timings?.prompt_n ?? null;
  const promptMs = lastTimings?.prompt_ms ?? lastMeta?.timings?.prompt_ms ?? null;
  const predictedMs = lastTimings?.predicted_ms ?? lastMeta?.timings?.predicted_ms ?? null;
  return {
    text,
    tokensCached,
    promptN,
    promptMs,
    predictedMs,
    wallMs,
    timings: lastTimings,
  };
}

async function runHttpDoc(server, helpers, document) {
  const preamble = buildPreamble(helpers, document);
  const rows = [];
  let filled = "";
  const docWall0 = performance.now();
  for (let i = 0; i < FIELDS.length; i++) {
    const field = FIELDS[i];
    const label = helpers.fillLabel(field);
    const gbnf = helpers.fieldValueToGbnf(field);
    const prompt = `${preamble}${filled}${label}: `;
    const r = await streamCompletion(server.port, {
      prompt,
      n_predict: helpers.maxTokensForField(field, 64),
      temperature: 0,
      cache_prompt: true,
      grammar: gbnf,
      stream: true,
      n_probs: 5,
      id_slot: 0,
      stop: ["\n"],
    });
    const value = r.text.split(/\r?\n/)[0]?.trim() || helpers.getAbsentToken();
    filled += `${label}: ${value}\n`;
    rows.push({
      step: i + 1,
      label,
      value,
      prompt_n: r.promptN,
      tokens_cached: r.tokensCached,
      prompt_ms: r.promptMs,
      predicted_ms: r.predictedMs,
      wall_ms: r.wallMs,
    });
    console.log("HTTP", JSON.stringify(rows[rows.length - 1]));
  }
  return {
    rows,
    wallMs: performance.now() - docWall0,
    sumStepWallMs: rows.reduce((s, r) => s + (r.wall_ms ?? 0), 0),
  };
}

async function runNlcDoc(helpers, document) {
  const t0 = performance.now();
  const result = await helpers.generateFieldFill({
    modelPath: LM,
    document,
    fields: FIELDS,
  });
  return {
    wallMs: performance.now() - t0,
    fields: result.fields.map((f) => ({
      path: f.path,
      rawText: f.rawText,
      absent: f.absent,
    })),
  };
}

if (!existsSync(LM)) throw new Error(`missing ${LM}`);
if (!existsSync(BIN)) throw new Error(`missing ${BIN}`);

const manifest = JSON.parse(await readFile(join(RESUME_DIR, "manifest.json"), "utf8"));
const helpers = await loadHelpers();
const server = new TextServer();

const out = {
  at: new Date().toISOString(),
  model: LM,
  rule: "HTTP total wall-clock ≤ 1.3× NLC → 마이그레이션 성능상 가능; else NLC 유지",
  priorRuleInvalidated: "ms-ratio 20% rule voided (short-doc noise)",
  fields: FIELDS.map((f) => f.path),
  docs: [],
};

try {
  await server.start();
  out.spawnCmd = server.spawnCmd;

  for (const docMeta of manifest) {
    const document = await readFile(join(RESUME_DIR, docMeta.file), "utf8");
    console.log("=== HTTP", docMeta.id, "tokens≈", docMeta.tokens);
    const http = await runHttpDoc(server, helpers, document);
    out.docs.push({
      ...docMeta,
      http,
      nlc: null,
    });
  }
} finally {
  await server.stop();
}

console.log("=== NLC path (same 3 docs) ===");
process.env.REDROB_BACKEND = "cuda";
process.env.REDROB_MODELS_DIR =
  process.env.REDROB_MODELS_DIR || join(process.env.LOCALAPPDATA ?? "", "redrob", "models");
const kernel = await import(pathToFileURL(join(ROOT, "packages/kernel/dist/index.js")).href);
await kernel.applyExecutionPlan({ memTier: "T4", backendOverride: "cuda" });

for (const doc of out.docs) {
  const document = await readFile(join(RESUME_DIR, doc.file), "utf8");
  console.log("=== NLC", doc.id);
  doc.nlc = await runNlcDoc(helpers, document);
  const ratio = doc.nlc.wallMs > 0 ? doc.http.wallMs / doc.nlc.wallMs : null;
  doc.compare = {
    httpWallMs: doc.http.wallMs,
    nlcWallMs: doc.nlc.wallMs,
    httpOverNlc: ratio,
    within1_3: ratio != null && ratio <= 1.3,
  };
  console.log("compare", doc.id, doc.compare);
}

const ratios = out.docs.map((d) => d.compare.httpOverNlc).filter((n) => Number.isFinite(n));
const allOk = out.docs.every((d) => d.compare.within1_3);
const maxRatio = ratios.length ? Math.max(...ratios) : null;
out.decision = {
  perDocWithin1_3: out.docs.map((d) => ({ id: d.id, within1_3: d.compare.within1_3, ratio: d.compare.httpOverNlc })),
  maxHttpOverNlc: maxRatio,
  result: allOk ? "마이그레이션 성능상 가능" : "NLC 유지",
};

await mkdir(OUT, { recursive: true });
await writeFile(RESULT, `${JSON.stringify(out, null, 2)}\n`);
console.log("DECISION", out.decision);
console.log("wrote", RESULT);
