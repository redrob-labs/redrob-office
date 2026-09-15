/**
 * Track A: llama-server cache_prompt field-fill probe (text-only Qwen3-4B).
 * Track B helpers invoked from vision-schema-track after A.
 *
 * node office/scripts/track-a-cache-prompt.mjs
 */
import { spawn } from "node:child_process";
import { createServer } from "node:net";
import { mkdir, writeFile, readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "../..");
const OUT = join(ROOT, "tmp/qwen35-ab-phase0");
const SLOT_DIR = join(OUT, "slot-cache-track-a");
const RESULT = join(OUT, "track-a-cache-prompt.json");

const LM = join(
  process.env.LOCALAPPDATA ?? "",
  "redrob/models/Qwen/Qwen3-4B-GGUF/Qwen3-4B-Q4_K_M.gguf",
);
const BIN = join(
  process.env.LOCALAPPDATA ?? "",
  "redrob/verify-tools/bin-cuda/llama-server.exe",
);

const DOCUMENT = [
  "name: 김민수",
  "email: minsu.kim@example.com",
  "skills: TypeScript, NestJS, PostgreSQL",
  "experience: 4 years backend at SaaS",
  "delivered API platform used by 20 teams",
  "phone: 010-1234-5678",
].join("\n");

const FIELDS = [
  { path: "name", type: "string", required: true, label: "name", maxChars: 32 },
  { path: "email", type: "string", required: true, label: "email", semanticType: "email", maxChars: 64 },
  { path: "skills", type: "string", required: true, label: "skills", semanticType: "list", maxChars: 96 },
  { path: "experience", type: "string", required: true, label: "experience", maxChars: 80 },
  { path: "phone", type: "string", required: false, label: "phone", semanticType: "phone", maxChars: 24 },
];

function localRequire() {
  return createRequire(join(ROOT, "packages/kernel/package.json"));
}

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

async function loadGrammarHelpers() {
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

function buildPreamble(helpers, fields) {
  const fieldLines = fields
    .map(
      (field) =>
        `- ${helpers.fillLabel(field)} (${field.type}${field.required ? ", required" : ""}): ${helpers.describeFillField(field)}`,
    )
    .join("\n");
  const system = [
    "Read the document. After each label, write only the value then a newline.",
    `If unknown or not present, write exactly ${helpers.getAbsentToken()}.`,
    "Do not write JSON, keys, or explanations.",
  ].join(" ");
  const schema = ["Fields (label → value on the following lines):", fieldLines].join("\n");
  const body = helpers.assembleInferencePrompt({ system, schema, document: DOCUMENT });
  // Qwen3 (not 3.5)
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
      "8192",
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
    this._err = () => err;
    const t0 = Date.now();
    while (Date.now() - t0 < 180_000) {
      if (this.child.exitCode != null) throw new Error(`server exit ${this.child.exitCode}\n${err.slice(-1500)}`);
      try {
        const res = await fetch(`http://127.0.0.1:${this.port}/health`);
        if (res.ok) return;
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
    await new Promise((r) => setTimeout(r, 2000));
  }
}

async function streamCompletion(port, body, { abortAfterBytes = null } = {}) {
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
  let aborted = false;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += dec.decode(value, { stream: true });
    if (abortAfterBytes != null && text.length >= abortAfterBytes) {
      aborted = true;
      try {
        await reader.cancel();
      } catch {
        /* */
      }
      break;
    }
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
  // non-stream fallback fields sometimes on last object
  const tokensCached =
    lastTimings?.cache_n ??
    lastMeta?.tokens_cached ??
    lastMeta?.timings?.cache_n ??
    null;
  const promptN = lastTimings?.prompt_n ?? lastMeta?.timings?.prompt_n ?? null;
  const promptMs = lastTimings?.prompt_ms ?? lastMeta?.timings?.prompt_ms ?? null;
  return { text, tokensCached, promptN, promptMs, timings: lastTimings, aborted, lastMeta };
}

async function runA1A2(server, helpers) {
  const preamble = buildPreamble(helpers, FIELDS);
  const rows = [];
  let filled = "";

  for (let i = 0; i < FIELDS.length; i++) {
    const field = FIELDS[i];
    const label = helpers.fillLabel(field);
    const gbnf = helpers.fieldValueToGbnf(field);
    const prompt = `${preamble}${filled}${label}: `;
    const nPredict = helpers.maxTokensForField(field, 64);
    const r = await streamCompletion(server.port, {
      prompt,
      n_predict: nPredict,
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
      timings: r.timings,
    });
    console.log("A1", JSON.stringify(rows[rows.length - 1]));
  }

  // A-2 bleed: mid-generation abort on last field style, then continue with truncated
  const bleedField = FIELDS[2]; // skills — longer
  const bleedLabel = helpers.fillLabel(bleedField);
  // reset filled through field 1 only
  filled = rows
    .slice(0, 2)
    .map((r) => `${r.label}: ${r.value}\n`)
    .join("");
  const bleedPrompt = `${preamble}${filled}${bleedLabel}: `;
  const bleedGbnf = helpers.fieldValueToGbnf(bleedField);
  const bleed = await streamCompletion(
    server.port,
    {
      prompt: bleedPrompt,
      n_predict: helpers.maxTokensForField(bleedField, 64),
      temperature: 0,
      cache_prompt: true,
      grammar: bleedGbnf,
      stream: true,
      n_probs: 5,
      id_slot: 0,
    },
    { abortAfterBytes: 6 },
  );
  const truncated = bleed.text.replace(/\n.*/s, "").trim() || "Type";
  console.log("A2 abort", { truncated, tokens_cached: bleed.tokensCached, prompt_ms: bleed.promptMs, aborted: bleed.aborted });

  // next request with truncated value included — does cache still hit?
  const contPrompt = `${preamble}${filled}${bleedLabel}: ${truncated}`;
  const cont = await streamCompletion(server.port, {
    prompt: contPrompt,
    n_predict: 32,
    temperature: 0,
    cache_prompt: true,
    grammar: bleedGbnf,
    stream: true,
    n_probs: 5,
    id_slot: 0,
    stop: ["\n"],
  });
  console.log("A2 continue", {
    prompt_n: cont.promptN,
    tokens_cached: cont.tokensCached,
    prompt_ms: cont.promptMs,
    text: cont.text.slice(0, 80),
  });

  // health after abort — slot stuck?
  let healthOk = false;
  let slotNote = null;
  try {
    const h = await fetch(`http://127.0.0.1:${server.port}/health`);
    healthOk = h.ok;
    const slots = await fetch(`http://127.0.0.1:${server.port}/slots`).then((r) => r.json()).catch(() => null);
    slotNote = slots;
  } catch (e) {
    slotNote = { error: e instanceof Error ? e.message : String(e) };
  }

  return {
    a1: rows,
    a2: {
      aborted: bleed,
      continue: {
        prompt_n: cont.promptN,
        tokens_cached: cont.tokensCached,
        prompt_ms: cont.promptMs,
        text: cont.text,
      },
      healthOk,
      slots: slotNote,
    },
  };
}

// (no module-level mutable leftovers)

async function runA3Nlc(helpers) {
  // Stop competing for GPU first — caller stops server.
  const t0 = performance.now();
  process.env.REDROB_BACKEND = "cuda";
  process.env.REDROB_MODELS_DIR =
    process.env.REDROB_MODELS_DIR || join(process.env.LOCALAPPDATA ?? "", "redrob", "models");
  const kernel = await import(pathToFileURL(join(ROOT, "packages/kernel/dist/index.js")).href);
  await kernel.applyExecutionPlan({ memTier: "T4", backendOverride: "cuda" });
  const result = await helpers.generateFieldFill({
    modelPath: LM,
    document: DOCUMENT,
    fields: FIELDS,
  });
  const wallMs = performance.now() - t0;
  return {
    wallMs,
    raw: result.raw,
    fields: result.fields.map((f) => ({
      path: f.path,
      rawText: f.rawText,
      absent: f.absent,
    })),
  };
}

if (!existsSync(LM)) throw new Error(`missing ${LM}`);
if (!existsSync(BIN)) throw new Error(`missing ${BIN}`);

const helpers = await loadGrammarHelpers();
const server = new TextServer();
const out = {
  at: new Date().toISOString(),
  model: LM,
  document: DOCUMENT,
  fields: FIELDS.map((f) => f.path),
};

try {
  await server.start();
  out.spawnCmd = server.spawnCmd;
  const { a1, a2 } = await runA1A2(server, helpers);
  out.a1 = a1;
  out.a2 = a2;

  const firstMs = a1[0]?.prompt_ms;
  const later = a1.slice(1).map((r) => r.prompt_ms).filter((n) => Number.isFinite(n));
  const maxLater = later.length ? Math.max(...later) : null;
  const ratio = firstMs && maxLater != null ? maxLater / firstMs : null;
  const prefixReuse = ratio != null && ratio <= 0.2;
  out.decision = {
    firstPromptMs: firstMs,
    maxLaterPromptMs: maxLater,
    laterOverFirstRatio: ratio,
    rule: "2nd+ prompt_ms <= 20% of first → prefix reuse",
    result: prefixReuse ? "마이그레이션 검토 가능" : "NLC 유지 확정",
  };
  console.log("A decision", out.decision);

  await server.stop();
  console.log("A3 NLC wall-clock…");
  out.a3 = await runA3Nlc(helpers);
  const httpWall = a1.reduce((s, r) => s + (r.prompt_ms ?? 0), 0);
  out.a3.httpSumPromptMs = httpWall;
  out.a3.compareNote = `NLC wallMs=${out.a3.wallMs.toFixed(0)}; HTTP sum prompt_ms (incomplete vs decode)=${httpWall?.toFixed?.(0) ?? httpWall}`;
  console.log("A3", out.a3.compareNote, out.a3.raw);
} finally {
  await server.stop();
}

await mkdir(OUT, { recursive: true });
await writeFile(RESULT, `${JSON.stringify(out, null, 2)}\n`);
console.log("wrote", RESULT);
