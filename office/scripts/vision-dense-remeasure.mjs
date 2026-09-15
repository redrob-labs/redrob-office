/**
 * Dense real-input remeasure — measurement only.
 * Run from repo: node office/scripts/vision-dense-remeasure.mjs
 */
import { spawn } from "node:child_process";
import { createServer } from "node:net";
import { readFile, writeFile, appendFile, mkdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "../..");
const require = createRequire(join(ROOT, "packages/kernel/package.json"));
// Ensure sharp resolves from kernel package
const kernelVision = join(ROOT, "packages/kernel/dist/vision");
const { prepareImageForModel } = await import(
  `file:///${join(kernelVision, "prepare-image.js").replace(/\\/g, "/")}`
);
const { trimImageWhitespace } = await import(
  `file:///${join(kernelVision, "trim-whitespace.js").replace(/\\/g, "/")}`
);

const OUT = join(ROOT, "tmp/qwen35-ab-phase0");
const PAGES_DIR = join(OUT, "dense-pages");
const MANIFEST = join(PAGES_DIR, "manifest.json");
const BENCH_MD = join(OUT, "BENCH.md");
const RESULT_JSON = join(OUT, "dense-remeasure.json");

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

function localAppData() {
  return process.env.LOCALAPPDATA ?? join(process.env.USERPROFILE ?? "", "AppData", "Local");
}

function resolveBin(name) {
  const root = join(localAppData(), "redrob", "verify-tools");
  for (const p of [join(root, "bin", `${name}.exe`), join(root, "bin-cuda", `${name}.exe`)]) {
    if (existsSync(p)) return p;
  }
  throw new Error(`missing ${name}`);
}

function resolveLm() {
  return join(localAppData(), "redrob", "models", "verify", "Qwen3.5-4B-Q4_K_M.gguf");
}

function resolveMmproj() {
  return join(
    localAppData(),
    "redrob",
    "models",
    "verify",
    "qwen35-4b-mmproj",
    "mmproj-F16.gguf",
  );
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
    this.stderrBuf = "";
  }

  async start(imageMaxTokens) {
    await this.stop();
    this.port = await freePort();
    this.stderrBuf = "";
    const minTok = Math.min(imageMaxTokens, 1024);
    const args = [
      "-m",
      resolveLm(),
      "--mmproj",
      resolveMmproj(),
      "--host",
      "127.0.0.1",
      "--port",
      String(this.port),
      "-ngl",
      "0",
      "-c",
      String(Math.max(8192, imageMaxTokens + 4096)),
      "--image-min-tokens",
      String(Math.min(minTok, imageMaxTokens)),
      "--image-max-tokens",
      String(imageMaxTokens),
      "--reasoning",
      "off",
    ];
    const child = spawn(resolveBin("llama-server"), args, { windowsHide: true });
    this.child = child;
    child.stderr.on("data", (d) => {
      this.stderrBuf += String(d);
      if (this.stderrBuf.length > 500_000) this.stderrBuf = this.stderrBuf.slice(-200_000);
    });
    child.stdout.on("data", () => undefined);
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
    throw new Error("server health timeout");
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
    await new Promise((r) => setTimeout(r, 500));
  }

  encodeMsSince(offset) {
    const chunk = this.stderrBuf.slice(offset);
    const matches = [
      ...chunk.matchAll(/mtmd batch encoding done in (\d+)\s*ms/gi),
      ...chunk.matchAll(/encoding(?: mtmd batch)? done in (\d+)\s*ms/gi),
    ];
    if (!matches.length) return null;
    return Number(matches[matches.length - 1][1]);
  }

  async chat(png, maxTokens = 256) {
    const before = this.stderrBuf.length;
    const body = {
      model: "qwen35",
      messages: [
        {
          role: "user",
          content: [
            { type: "text", text: ATTR_PROMPT },
            {
              type: "image_url",
              image_url: { url: `data:image/png;base64,${png.toString("base64")}` },
            },
          ],
        },
      ],
      max_tokens: maxTokens,
      temperature: 0.1,
      stream: false,
    };
    const t0 = Date.now();
    const res = await fetch(`http://127.0.0.1:${this.port}/v1/chat/completions`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const wallMs = Date.now() - t0;
    if (!res.ok) throw new Error(`HTTP ${res.status} ${await res.text().catch(() => "")}`);
    const json = await res.json();
    const text = (json.choices?.[0]?.message?.content ?? "").trim();
    const t = json.timings;
    const timings =
      t && typeof t.prompt_ms === "number"
        ? {
            promptMs: t.prompt_ms,
            predictedMs: t.predicted_ms,
            promptN: t.prompt_n ?? 0,
            predictedN: t.predicted_n ?? 0,
          }
        : null;
    await new Promise((r) => setTimeout(r, 80));
    return { text, timings, wallMs, encodeMs: this.encodeMsSince(before) };
  }
}

function parseAttrs(raw) {
  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  if (start < 0 || end < start) return { _unparsed: raw.slice(0, 500) };
  try {
    return JSON.parse(raw.slice(start, end + 1));
  } catch {
    return { _unparsed: raw.slice(0, 500) };
  }
}

function attrsKey(a) {
  try {
    return JSON.stringify(a);
  } catch {
    return String(a);
  }
}

function ms(n) {
  if (n == null || !Number.isFinite(n)) return "—";
  return n >= 1000 ? `${(n / 1000).toFixed(1)}s` : `${Math.round(n)}ms`;
}

function renderMarkdown(pages, cells, trimCells) {
  const lines = [];
  lines.push("## Dense real-input remeasure (PDF@200DPI + CareerChat÷3 + day-log)");
  lines.push("");
  lines.push(`Date: ${new Date().toISOString()}`);
  lines.push("");
  lines.push("### Input set");
  lines.push("");
  lines.push(
    "Composition: **3 PDF rasters @200 DPI** + **CareerChat vertical 3-split** + **1 day-log** → **7 pages** (CareerChat expanded by split rule so the tall page is not crushed by the cap).",
  );
  lines.push("");
  lines.push("| id | size | whitespace | source |");
  lines.push("|---|---|---|---|");
  for (const p of pages) {
    lines.push(
      `| ${p.id} | ${p.width}×${p.height} | ${p.hasWhitespace ? "yes" : "no"} (score ${p.marginScore}) | ${p.note} |`,
    );
  }
  lines.push("");
  lines.push("### Judgment rules (fixed before run)");
  lines.push("");
  lines.push("- `prompt_n < image-max-tokens` → **상한 미적용**; exclude from time comparison for that cell.");
  lines.push(
    "- If 512 attribute JSON is substantially identical to 1024 on cap-applied pages → adopt 512 as default.",
  );
  lines.push("- Wrong attribute extracts recorded as-is (no prompt retry).");
  lines.push("");
  lines.push("### A — Token caps × pages (trim on)");
  lines.push("");
  lines.push(
    "| page | budget | prompt_n | cap? | vision encode | prefill (prompt−encode) | prompt_ms | decode | attrs |",
  );
  lines.push("|---|---|---|---|---|---|---|---|---|");
  for (const budget of [512, 1024, 2048]) {
    for (const page of pages) {
      const c = cells.find((x) => x.pageId === page.id && x.budget === budget && x.trim);
      if (!c) {
        lines.push(`| ${page.id} | ${budget} | — | — | — | — | — | — | missing |`);
        continue;
      }
      if (c.error) {
        lines.push(
          `| ${page.id} | ${budget} | — | — | — | — | — | — | ERROR ${String(c.error).slice(0, 80)} |`,
        );
        continue;
      }
      const capLabel = c.capApplied ? "적용" : "**상한 미적용**";
      const enc = c.capApplied ? ms(c.visionEncodeMs) : "—";
      const pref = c.capApplied ? ms(c.prefillMs) : "—";
      const prompt = c.capApplied ? ms(c.promptMs) : "—";
      const dec = c.capApplied ? ms(c.decodeMs) : "—";
      lines.push(
        `| ${page.id} | ${budget} | **${c.prompt_n}** | ${capLabel} | ${enc} | ${pref} | ${prompt} | ${dec} | \`${JSON.stringify(c.attrs).slice(0, 120)}\` |`,
      );
    }
  }
  lines.push("");
  lines.push("#### Cap-applied only — timing means");
  lines.push("");
  for (const budget of [512, 1024, 2048]) {
    const applied = cells.filter(
      (c) => c.budget === budget && c.trim && c.capApplied && !c.error && c.promptMs != null,
    );
    if (!applied.length) {
      lines.push(`- budget ${budget}: no pages hit cap (all 상한 미적용)`);
      continue;
    }
    const avg = (xs) => xs.reduce((a, b) => a + b, 0) / xs.length;
    lines.push(
      `- budget ${budget} (n=${applied.length}): mean prompt_ms=${ms(avg(applied.map((c) => c.promptMs)))}, mean decode=${ms(avg(applied.map((c) => c.decodeMs ?? 0)))}, pages=${applied.map((c) => c.pageId).join(",")}`,
    );
  }
  lines.push("");
  lines.push("#### 512 vs 1024 attribute extract (cap-applied pages only)");
  lines.push("");
  lines.push("| page | same@512vs1024? | attrs@512 | attrs@1024 |");
  lines.push("|---|---|---|---|");
  const pages512 = new Set(
    cells.filter((c) => c.budget === 512 && c.capApplied && !c.error).map((c) => c.pageId),
  );
  const pages1024 = new Set(
    cells.filter((c) => c.budget === 1024 && c.capApplied && !c.error).map((c) => c.pageId),
  );
  const both = [...pages512].filter((id) => pages1024.has(id));
  let sameCount = 0;
  for (const id of both) {
    const a = cells.find((c) => c.pageId === id && c.budget === 512);
    const b = cells.find((c) => c.pageId === id && c.budget === 1024);
    const same = attrsKey(a.attrs) === attrsKey(b.attrs);
    if (same) sameCount += 1;
    lines.push(
      `| ${id} | ${same} | \`${JSON.stringify(a.attrs).slice(0, 100)}\` | \`${JSON.stringify(b.attrs).slice(0, 100)}\` |`,
    );
  }
  if (!both.length) lines.push("| — | no overlapping cap-applied pages | — | — |");
  const adopt512 =
    both.length > 0 && sameCount === both.length
      ? "YES — adopt 512 as default"
      : both.length > 0 && sameCount / both.length >= 0.8
        ? "LEAN YES — mostly identical; adopt 512"
        : "NO — keep 1024 (or higher) as default";
  lines.push("");
  lines.push(
    `**Default token cap decision:** ${adopt512} (same ${sameCount}/${both.length || 0} overlapping cap-applied pages).`,
  );
  lines.push("");
  lines.push("### B — Trim on/off @ 512 (per page)");
  lines.push("");
  lines.push(
    "| page | whitespace? | trim | area reduction | prompt_n | Δprompt_n (on−off) | encode | prompt_ms | decode |",
  );
  lines.push("|---|---|---|---|---|---|---|---|---|");
  for (const page of pages) {
    const on = trimCells.find((c) => c.pageId === page.id && c.trim === true);
    const off = trimCells.find((c) => c.pageId === page.id && c.trim === false);
    for (const c of [on, off]) {
      if (!c) continue;
      const other = c.trim ? off : on;
      const delta = other && !c.error && !other.error ? c.prompt_n - other.prompt_n : null;
      const ar =
        c.trimMeta?.areaReduction != null
          ? `${(c.trimMeta.areaReduction * 100).toFixed(1)}%`
          : "—";
      lines.push(
        `| ${page.id} | ${page.hasWhitespace ? "yes" : "no"} | ${c.trim} | ${ar} | ${c.prompt_n} | ${delta == null ? "—" : delta} | ${ms(c.visionEncodeMs)} | ${ms(c.promptMs)} | ${ms(c.decodeMs)} |`,
      );
    }
  }
  lines.push("");
  lines.push(
    "Whitespace pages (chat/PDF) vs full-bleed day-log: compare rows above individually — no averages.",
  );
  lines.push("");
  return lines.join("\n");
}

const pages = JSON.parse(await readFile(MANIFEST, "utf8"));
console.log(
  "pages",
  pages.map((p) => `${p.id} ${p.width}x${p.height} ws=${p.hasWhitespace}`),
);
void require; // keep sharp resolution rooted at kernel

const server = new MeasServer();
const cells = [];
const trimCells = [];

try {
  for (const budget of [512, 1024, 2048]) {
    console.log(`\n=== A budget=${budget} ===`);
    await server.start(budget);
    for (const page of pages) {
      const raw = await readFile(page.path);
      const prepared = await prepareImageForModel(raw);
      try {
        const result = await server.chat(prepared);
        const promptN = result.timings?.promptN ?? 0;
        const encodeMs = result.encodeMs;
        const promptMs = result.timings?.promptMs ?? null;
        const cell = {
          pageId: page.id,
          budget,
          trim: true,
          prompt_n: promptN,
          capApplied: promptN >= budget,
          visionEncodeMs: encodeMs,
          prefillMs:
            promptMs != null && encodeMs != null ? Math.max(0, promptMs - encodeMs) : null,
          promptMs,
          decodeMs: result.timings?.predictedMs ?? null,
          wallMs: result.wallMs,
          attrs: parseAttrs(result.text),
          attrsRaw: result.text.slice(0, 800),
        };
        cells.push(cell);
        console.log(
          JSON.stringify({
            page: page.id,
            budget,
            prompt_n: promptN,
            capApplied: cell.capApplied,
            encode: encodeMs,
            prefill: cell.prefillMs,
            prompt: promptMs,
            decode: cell.decodeMs,
          }),
        );
      } catch (err) {
        cells.push({
          pageId: page.id,
          budget,
          trim: true,
          prompt_n: 0,
          capApplied: false,
          visionEncodeMs: null,
          prefillMs: null,
          promptMs: null,
          decodeMs: null,
          wallMs: 0,
          attrs: null,
          attrsRaw: "",
          error: err instanceof Error ? err.message : String(err),
        });
        console.error("FAIL", page.id, budget, err);
      }
    }
  }

  console.log("\n=== B trim @ 512 ===");
  await server.start(512);
  for (const page of pages) {
    const raw = await readFile(page.path);
    const trimMeta = await trimImageWhitespace(raw);
    for (const trim of [true, false]) {
      const bytes = trim ? trimMeta.buffer : raw;
      try {
        const result = await server.chat(bytes);
        const promptN = result.timings?.promptN ?? 0;
        const encodeMs = result.encodeMs;
        const promptMs = result.timings?.promptMs ?? null;
        trimCells.push({
          pageId: page.id,
          budget: 512,
          trim,
          prompt_n: promptN,
          capApplied: promptN >= 512,
          visionEncodeMs: encodeMs,
          prefillMs:
            promptMs != null && encodeMs != null ? Math.max(0, promptMs - encodeMs) : null,
          promptMs,
          decodeMs: result.timings?.predictedMs ?? null,
          wallMs: result.wallMs,
          attrs: parseAttrs(result.text),
          attrsRaw: result.text.slice(0, 800),
          trimMeta: {
            areaReduction: trimMeta.reductionRatio,
            from: `${trimMeta.originalWidth}x${trimMeta.originalHeight}`,
            to: `${trimMeta.resultWidth}x${trimMeta.resultHeight}`,
            trimmed: trimMeta.trimmed,
            expanded: trimMeta.expanded,
            hasWhitespace: page.hasWhitespace,
          },
        });
        console.log(
          JSON.stringify({
            page: page.id,
            trim,
            prompt_n: promptN,
            areaReduction: trimMeta.reductionRatio,
            encode: encodeMs,
            prompt: promptMs,
          }),
        );
      } catch (err) {
        trimCells.push({
          pageId: page.id,
          budget: 512,
          trim,
          prompt_n: 0,
          capApplied: false,
          visionEncodeMs: null,
          prefillMs: null,
          promptMs: null,
          decodeMs: null,
          wallMs: 0,
          attrs: null,
          attrsRaw: "",
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }
  }
} finally {
  await server.stop();
}

await mkdir(OUT, { recursive: true });
await writeFile(
  RESULT_JSON,
  `${JSON.stringify({ pages, cells, trimCells, at: new Date().toISOString() }, null, 2)}\n`,
  "utf8",
);
const md = renderMarkdown(pages, cells, trimCells);
await appendFile(BENCH_MD, `\n${md}\n`, "utf8");
console.log("\n==== TABLES ====\n");
console.log(md);
