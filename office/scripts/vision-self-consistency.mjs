/**
 * Self-consistency: 6 pages (excl p-pdf-3) × budget 1024 × 3 repeats, same server session.
 * Does not change temperature/sampling defaults used by dense-remeasure-fixed (temp 0.1).
 * Fixes seed if API accepts it; records whether seed was set.
 *
 * node office/scripts/vision-self-consistency.mjs
 */
import { spawn } from "node:child_process";
import { createServer } from "node:net";
import { readFile, writeFile, mkdir, appendFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "../..");
createRequire(join(ROOT, "packages/kernel/package.json"));
const { prepareImageForModel } = await import(
  `file:///${join(ROOT, "packages/kernel/dist/vision/prepare-image.js").replace(/\\/g, "/")}`
);

const OUT = join(ROOT, "tmp/qwen35-ab-phase0");
const PAGES_DIR = join(OUT, "dense-pages");
const MANIFEST = join(PAGES_DIR, "manifest.json");
const BENCH_MD = join(OUT, "BENCH.md");
const RESULT_JSON = join(OUT, "self-consistency-1024.json");

const ATTR_PROMPT = [
  "You are extracting structured attributes from ONE page image.",
  "Reply with ONLY a single JSON object (no markdown fences, no commentary) with exactly these keys:",
  '  "caseStudyCount": number,',
  '  "hasProcessDocumentation": boolean,',
  '  "layoutTypes": string[],',
  '  "toolEvidence": string[],',
  '  "screenCount": number',
  "If unsure, still guess from visible evidence. Do not invent keys.",
].join("\n");

const FIELDS = [
  "caseStudyCount",
  "hasProcessDocumentation",
  "layoutTypes",
  "toolEvidence",
  "screenCount",
];

const BUDGET = 1024;
const REPEATS = 3;
const FIXED_SEED = 42;

/** Prior 512↔1024 mismatches (parsed pages only; from attrs-field-compare). */
const BUDGET_MISMATCH = {
  caseStudyCount: 3,
  hasProcessDocumentation: 1,
  layoutTypes: 5,
  toolEvidence: 5,
  screenCount: 0,
};

function localAppData() {
  return process.env.LOCALAPPDATA ?? join(process.env.USERPROFILE ?? "", "AppData", "Local");
}
function resolveBin(name) {
  const root = join(localAppData(), "redrob", "verify-tools");
  // Prefer CUDA build so -ngl > 0 actually offloads.
  for (const p of [join(root, "bin-cuda", `${name}.exe`), join(root, "bin", `${name}.exe`)]) {
    if (existsSync(p)) return p;
  }
  throw new Error(`missing ${name}`);
}

function nglLayers() {
  const raw = process.env.REDROB_VISION_NGL?.trim();
  if (raw !== undefined && raw !== "") {
    const n = Number(raw);
    if (Number.isFinite(n) && n >= 0) return Math.floor(n);
  }
  return 99; // GPU default for this measurement (not CPU ngl=0)
}
function resolveLm() {
  return join(localAppData(), "redrob", "models", "verify", "Qwen3.5-4B-Q4_K_M.gguf");
}
function resolveMmproj() {
  return join(localAppData(), "redrob", "models", "verify", "qwen35-4b-mmproj", "mmproj-F16.gguf");
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

class MeasServer {
  constructor() {
    this.child = null;
    this.port = 0;
    this.lastArgs = [];
  }

  async start(imageMaxTokens) {
    await this.stop();
    this.port = await freePort();
    this.lastArgs = [
      "-m",
      resolveLm(),
      "--mmproj",
      resolveMmproj(),
      "--host",
      "127.0.0.1",
      "--port",
      String(this.port),
      "-ngl",
      String(nglLayers()),
      "-c",
      String(Math.max(8192, imageMaxTokens + 4096)),
      "--image-max-tokens",
      String(imageMaxTokens),
      "--reasoning",
      "off",
    ];
    console.log("SPAWN", resolveBin("llama-server"), this.lastArgs.join(" "));
    const child = spawn(resolveBin("llama-server"), this.lastArgs, {
      windowsHide: true,
      cwd: dirname(resolveBin("llama-server")),
    });
    this.child = child;
    let stderrBuf = "";
    child.stderr.on("data", (d) => {
      stderrBuf += d.toString();
      if (stderrBuf.length > 8000) stderrBuf = stderrBuf.slice(-4000);
    });
    child.stdout.on("data", () => undefined);
    this._stderr = () => stderrBuf;
    const started = Date.now();
    while (Date.now() - started < 180_000) {
      try {
        const res = await fetch(`http://127.0.0.1:${this.port}/health`);
        if (res.ok) return;
      } catch {
        /* wait */
      }
      await new Promise((r) => setTimeout(r, 400));
    }
    const tip = typeof this._stderr === "function" ? this._stderr().slice(-800) : "";
    throw new Error(`server health timeout${tip ? `\nstderr:\n${tip}` : ""}`);
  }

  async stop() {
    if (!this.child) return;
    try {
      this.child.kill();
    } catch {
      /* ignore */
    }
    this.child = null;
    this.port = 0;
    await new Promise((r) => setTimeout(r, 600));
  }

  async chat({ png, maxTokens = 256, seed = null }) {
    const content = [{ type: "text", text: ATTR_PROMPT }];
    if (png) {
      content.push({
        type: "image_url",
        image_url: { url: `data:image/png;base64,${png.toString("base64")}` },
      });
    }
    // Sampling: same as dense-remeasure-fixed (do not change for this run).
    const body = {
      model: "qwen35",
      messages: [{ role: "user", content }],
      max_tokens: maxTokens,
      temperature: 0.1,
      stream: false,
      cache_prompt: false,
    };
    if (seed != null) body.seed = seed;
    const t0 = Date.now();
    const res = await fetch(`http://127.0.0.1:${this.port}/v1/chat/completions`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const wallMs = Date.now() - t0;
    if (!res.ok) throw new Error(`HTTP ${res.status} ${await res.text()}`);
    const json = await res.json();
    const text = (json.choices?.[0]?.message?.content ?? "").trim();
    const t = json.timings ?? {};
    return {
      text,
      wallMs,
      prompt_n: t.prompt_n ?? json.usage?.prompt_tokens ?? 0,
      prompt_ms: t.prompt_ms ?? null,
      decode_ms: t.predicted_ms ?? null,
      predicted_n: t.predicted_n ?? json.usage?.completion_tokens ?? null,
      finish_reason: json.choices?.[0]?.finish_reason ?? null,
      system_fingerprint: json.system_fingerprint ?? null,
      usage: json.usage ?? null,
      rawResponseKeys: Object.keys(json),
    };
  }
}

function parseAttrs(raw) {
  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  if (start < 0 || end < start) return { _unparsed: raw.slice(0, 800) };
  try {
    return JSON.parse(raw.slice(start, end + 1));
  } catch {
    return { _unparsed: raw.slice(0, 800) };
  }
}

function normField(v) {
  if (Array.isArray(v)) {
    return JSON.stringify(
      [...v].map((x) => (typeof x === "string" ? x : JSON.stringify(x))).sort(),
    );
  }
  return JSON.stringify(v);
}

function allEqual(norms) {
  return norms.every((n) => n === norms[0]);
}

const allPages = JSON.parse(await readFile(MANIFEST, "utf8"));
const pages = allPages.filter((p) => p.id !== "p-pdf-3");
console.log(
  "pages",
  pages.map((p) => p.id),
);

const sampling = {
  temperature: 0.1,
  top_p: "not sent (server default)",
  top_k: "not sent (server default)",
  max_tokens: 256,
  cache_prompt: false,
  seed: FIXED_SEED,
  seedFixed: true,
  ngl: nglLayers(),
  bin: resolveBin("llama-server"),
  note: "temperature/max_tokens match dense-remeasure-fixed; seed newly fixed; GPU via bin-cuda -ngl 99 (or REDROB_VISION_NGL)",
};

const server = new MeasServer();
const cells = [];

try {
  await server.start(BUDGET);
  const spawnExample = `${resolveBin("llama-server")} ${server.lastArgs.join(" ")}`;

  for (const page of pages) {
    const prepared = await prepareImageForModel(await readFile(page.path));
    for (let rep = 1; rep <= REPEATS; rep++) {
      const r = await server.chat({ png: prepared, maxTokens: 256, seed: FIXED_SEED });
      const attrs = parseAttrs(r.text);
      const cell = {
        pageId: page.id,
        budget: BUDGET,
        repeat: rep,
        prompt_n: r.prompt_n,
        prompt_ms: r.prompt_ms,
        decode_ms: r.decode_ms,
        predicted_n: r.predicted_n,
        finish_reason: r.finish_reason,
        attrs,
        attrsRaw: r.text,
      };
      cells.push(cell);
      console.log(
        JSON.stringify({
          page: page.id,
          rep,
          prompt_ms: r.prompt_ms,
          decode_ms: r.decode_ms,
          finish_reason: r.finish_reason,
          attrsPreview: JSON.stringify(attrs).slice(0, 160),
        }),
      );
    }
  }

  // Per-field: count pages where 3 repeats are not all equal
  const repeatMismatch = {};
  for (const f of FIELDS) repeatMismatch[f] = 0;
  const perPage = [];

  for (const page of pages) {
    const reps = cells.filter((c) => c.pageId === page.id).sort((a, b) => a.repeat - b.repeat);
    const pageRow = { pageId: page.id, fields: {} };
    for (const f of FIELDS) {
      const vals = reps.map((c) => c.attrs?.[f]);
      const norms = vals.map(normField);
      const stable = allEqual(norms) && !reps.some((c) => c.attrs?._unparsed);
      if (!stable) repeatMismatch[f] += 1;
      pageRow.fields[f] = {
        stable,
        values: vals,
      };
    }
    perPage.push(pageRow);
  }

  const verdictByField = {};
  for (const f of FIELDS) {
    const r = repeatMismatch[f];
    const b = BUDGET_MISMATCH[f];
    let verdict;
    if (b === 0 && r === 0) verdict = "both-stable";
    else if (r === 0 && b > 0) verdict = "resolution-sensitive (repeat<<budget)";
    else if (Math.abs(r - b) <= 1) verdict = "resolution-irrelevant (repeat≈budget)";
    else if (r < b - 1) verdict = "resolution-sensitive (repeat<<budget)";
    else verdict = "instability-dominant (repeat≥budget)";
    verdictByField[f] = { repeatMismatch: r, budgetMismatch: b, verdict };
  }

  const overall =
    Object.values(verdictByField).every((v) =>
      v.verdict.startsWith("resolution-irrelevant"),
    ) ||
    (Object.values(verdictByField).filter((v) => v.verdict.includes("resolution-irrelevant")).length >=
      3 &&
      !Object.values(verdictByField).some((v) => v.verdict.includes("resolution-sensitive")))
      ? "LEAN 512 — repeat≈budget → resolution irrelevant; stabilize output next"
      : Object.values(verdictByField).every((v) => v.verdict.includes("resolution-sensitive") || v.verdict === "both-stable")
        ? "KEEP 1024 — repeat<<budget → resolution matters"
        : "FIELD-SPLIT — judge per field (see verdictByField)";

  const result = {
    at: new Date().toISOString(),
    budget: BUDGET,
    repeats: REPEATS,
    sameServerSession: true,
    sampling,
    spawnExample,
    pages: pages.map((p) => p.id),
    cells,
    perPage,
    repeatMismatch,
    budgetMismatch: BUDGET_MISMATCH,
    verdictByField,
    overall,
  };

  await mkdir(OUT, { recursive: true });
  await writeFile(RESULT_JSON, `${JSON.stringify(result, null, 2)}\n`, "utf8");

  const md = [];
  md.push("");
  md.push("## Self-consistency @ 1024 × 3 (same session)");
  md.push("");
  md.push(`Date: ${result.at}`);
  md.push("");
  md.push("### Sampling (unchanged except seed)");
  md.push("");
  md.push(`- temperature: **${sampling.temperature}**`);
  md.push(`- top_p: ${sampling.top_p}`);
  md.push(`- top_k: ${sampling.top_k}`);
  md.push(`- max_tokens: ${sampling.max_tokens}`);
  md.push(`- cache_prompt: ${sampling.cache_prompt}`);
  md.push(`- seed: **${sampling.seed}** (seedFixed=${sampling.seedFixed})`);
  md.push(`- server restart between repeats: **no** (one session)`);
  md.push("");
  md.push("| field | repeat mismatch (of 6 pages) | 512↔1024 mismatch | verdict |");
  md.push("|---|---|---|---|");
  for (const f of FIELDS) {
    const v = verdictByField[f];
    md.push(`| ${f} | ${v.repeatMismatch} | ${v.budgetMismatch} | ${v.verdict} |`);
  }
  md.push("");
  md.push(`**Overall:** ${overall}`);
  md.push("");
  md.push("Product default unchanged this turn.");
  md.push("");
  await appendFile(BENCH_MD, md.join("\n"), "utf8");
  console.log("\n=== COMPARE ===");
  console.log(md.join("\n"));
  console.log("wrote", RESULT_JSON);
} finally {
  await server.stop();
}
