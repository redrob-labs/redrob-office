/**
 * Dense remeasure (max-only).
 * --image-max-tokens only (no --image-min-tokens).
 * Budget is a resolution *target*, not a ceiling — capApplied abandoned.
 * imageTokens = prompt_n - textOnlyBaseline (kept to verify budget→resolution).
 *
 * node office/scripts/vision-dense-remeasure-fixed.mjs
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
createRequire(join(ROOT, "packages/kernel/package.json"));
const { prepareImageForModel } = await import(
  `file:///${join(ROOT, "packages/kernel/dist/vision/prepare-image.js").replace(/\\/g, "/")}`
);

const OUT = join(ROOT, "tmp/qwen35-ab-phase0");
const PAGES_DIR = join(OUT, "dense-pages");
const MANIFEST = join(PAGES_DIR, "manifest.json");
const BENCH_MD = join(OUT, "BENCH.md");
const RESULT_JSON = join(OUT, "dense-remeasure-fixed.json");

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

const BUDGETS = [512, 1024];

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
    // TRUE CAP: max only. Do NOT pass --image-min-tokens.
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
      "0",
      "-c",
      String(Math.max(8192, imageMaxTokens + 4096)),
      "--image-max-tokens",
      String(imageMaxTokens),
      "--reasoning",
      "off",
    ];
    console.log("SPAWN", resolveBin("llama-server"), this.lastArgs.join(" "));
    const child = spawn(resolveBin("llama-server"), this.lastArgs, { windowsHide: true });
    this.child = child;
    child.stderr.on("data", () => undefined);
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
    await new Promise((r) => setTimeout(r, 600));
  }

  async chat({ png, maxTokens = 256 }) {
    const content = [{ type: "text", text: ATTR_PROMPT }];
    if (png) {
      content.push({
        type: "image_url",
        image_url: { url: `data:image/png;base64,${png.toString("base64")}` },
      });
    }
    const body = {
      model: "qwen35",
      messages: [{ role: "user", content }],
      max_tokens: maxTokens,
      temperature: 0.1,
      stream: false,
      // Prevent KV/prompt-cache from collapsing subsequent identical text-only baselines to ~4 tokens.
      cache_prompt: false,
    };
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
      usage: json.usage ?? null,
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

function fieldDiff(a, b) {
  const keys = [
    "caseStudyCount",
    "hasProcessDocumentation",
    "layoutTypes",
    "toolEvidence",
    "screenCount",
  ];
  const diffs = [];
  for (const k of keys) {
    const va = a?.[k];
    const vb = b?.[k];
    const same = JSON.stringify(va) === JSON.stringify(vb);
    if (!same) diffs.push({ field: k, at512: va, at1024: vb });
  }
  return diffs;
}

function ms(n) {
  if (n == null || !Number.isFinite(n)) return "—";
  return n >= 1000 ? `${(n / 1000).toFixed(1)}s` : `${Math.round(n)}ms`;
}

function renderMarkdown(pages, baselines, cells, spawnExample) {
  const lines = [];
  lines.push("## Dense remeasure FIXED cap (max-only, imageTokens)");
  lines.push("");
  lines.push(`Date: ${new Date().toISOString()}`);
  lines.push("");
  lines.push("### Harness (corrected)");
  lines.push("");
  lines.push("- `--image-max-tokens <budget>` only — **no** `--image-min-tokens` (server default)");
  lines.push("- **Budget is a resolution target, not a ceiling.** Images scale to ~95% of budget → `capApplied` concept abandoned.");
  lines.push("- `textOnlyBaseline` measured per page (ATTR_PROMPT, no image) before image runs");
  lines.push("- `imageTokens = prompt_n - textOnlyBaseline` (kept to verify budget→resolution)");
  lines.push("- All 7 pages are valid comparison subjects (no cap gate)");
  lines.push("- Budgets: **512 / 1024** only (2048 excluded)");
  lines.push("");
  lines.push("Example spawn:");
  lines.push("```");
  lines.push(spawnExample);
  lines.push("```");
  lines.push("");
  lines.push("### textOnlyBaseline (per page)");
  lines.push("");
  lines.push("| page | textOnlyBaseline |");
  lines.push("|---|---|");
  for (const p of pages) {
    lines.push(`| ${p.id} | ${baselines[p.id]} |`);
  }
  lines.push("");
  lines.push("### A — budgets × pages");
  lines.push("");
  lines.push(
    "| page | budget | textOnlyBaseline | prompt_n | imageTokens | prompt_ms | decode_ms | attrs |",
  );
  lines.push("|---|---|---|---|---|---|---|---|");
  for (const budget of BUDGETS) {
    for (const page of pages) {
      const c = cells.find((x) => x.pageId === page.id && x.budget === budget);
      if (!c) {
        lines.push(`| ${page.id} | ${budget} | — | — | — | — | — | missing |`);
        continue;
      }
      if (c.error) {
        lines.push(
          `| ${page.id} | ${budget} | ${c.textOnlyBaseline} | — | — | — | — | ERROR ${String(c.error).slice(0, 60)} |`,
        );
        continue;
      }
      lines.push(
        `| ${page.id} | ${budget} | ${c.textOnlyBaseline} | ${c.prompt_n} | **${c.imageTokens}** | ${ms(c.prompt_ms)} | ${ms(c.decode_ms)} | \`${JSON.stringify(c.attrs).slice(0, 140)}\` |`,
      );
    }
  }
  lines.push("");
  lines.push("#### Timing means (all pages)");
  lines.push("");
  for (const budget of BUDGETS) {
    const ok = cells.filter(
      (c) => c.budget === budget && !c.error && c.prompt_ms != null,
    );
    if (!ok.length) {
      lines.push(`- budget ${budget}: no successful cells`);
      continue;
    }
    const avg = (xs) => xs.reduce((a, b) => a + b, 0) / xs.length;
    lines.push(
      `- budget ${budget} (n=${ok.length}): mean prompt_ms=${ms(avg(ok.map((c) => c.prompt_ms)))}, mean decode=${ms(avg(ok.map((c) => c.decode_ms ?? 0)))}`,
    );
  }
  lines.push("");
  lines.push("#### 512 vs 1024 attrs (all pages, no cap gate)");
  lines.push("");
  lines.push("| page | substantially same? | differing fields |");
  lines.push("|---|---|---|");
  const comparable = pages
    .map((p) => p.id)
    .filter((id) => {
      const a = cells.find((c) => c.pageId === id && c.budget === 512);
      const b = cells.find((c) => c.pageId === id && c.budget === 1024);
      return a && b && !a.error && !b.error;
    });
  let sameCount = 0;
  for (const id of comparable) {
    const a = cells.find((c) => c.pageId === id && c.budget === 512);
    const b = cells.find((c) => c.pageId === id && c.budget === 1024);
    const diffs = fieldDiff(a.attrs, b.attrs);
    const same = diffs.length === 0;
    if (same) sameCount += 1;
    lines.push(
      `| ${id} | ${same} | ${same ? "—" : diffs.map((d) => `${d.field}: 512=${JSON.stringify(d.at512)} / 1024=${JSON.stringify(d.at1024)}`).join("; ")} |`,
    );
  }
  if (!comparable.length) {
    lines.push("| — | no comparable pages | — |");
  }
  lines.push("");
  const decision =
    comparable.length === 0
      ? "DEFER — no comparable pages"
      : sameCount === comparable.length
        ? "LEAN 512 — attrs substantially identical on all pages (still do not auto-change product default)"
        : `KEEP comparing — attrs differ on ${comparable.length - sameCount}/${comparable.length} pages (product default unchanged)`;
  lines.push(`**Budget decision note (not applied):** ${decision}`);
  lines.push("");
  lines.push("### attrs raw JSON (all cells)");
  lines.push("");
  for (const c of cells) {
    lines.push(`#### ${c.pageId} @ ${c.budget}`);
    lines.push("```json");
    lines.push(c.attrsRaw || JSON.stringify(c.attrs, null, 2));
    lines.push("```");
    lines.push("");
  }
  return lines.join("\n");
}

const pages = JSON.parse(await readFile(MANIFEST, "utf8"));
console.log(
  "pages",
  pages.map((p) => p.id),
);

const server = new MeasServer();
const baselines = {};
const cells = [];
let spawnExample = "";

try {
  // Fresh process per page so textOnlyBaseline is not polluted by prompt cache.
  console.log("\n=== textOnlyBaseline per page (fresh server each) ===");
  for (const page of pages) {
    await server.start(1024);
    if (!spawnExample) {
      spawnExample = `${resolveBin("llama-server")} ${server.lastArgs.join(" ")}`;
    }
    const r = await server.chat({ png: null, maxTokens: 8 });
    baselines[page.id] = r.prompt_n;
    console.log(page.id, "textOnlyBaseline", r.prompt_n);
    await server.stop();
  }

  for (const budget of BUDGETS) {
    console.log(`\n=== budget ${budget} ===`);
    await server.start(budget);
    if (budget === 512) {
      spawnExample = `${resolveBin("llama-server")} ${server.lastArgs.join(" ")}`;
    }
    for (const page of pages) {
      const baseline = baselines[page.id];
      try {
        const prepared = await prepareImageForModel(await readFile(page.path));
        const r = await server.chat({ png: prepared, maxTokens: 256 });
        const imageTokens = r.prompt_n - baseline;
        const cell = {
          pageId: page.id,
          budget,
          textOnlyBaseline: baseline,
          prompt_n: r.prompt_n,
          imageTokens,
          prompt_ms: r.prompt_ms,
          decode_ms: r.decode_ms,
          wallMs: r.wallMs,
          attrs: parseAttrs(r.text),
          attrsRaw: r.text,
        };
        cells.push(cell);
        console.log(
          JSON.stringify({
            page: page.id,
            budget,
            textOnlyBaseline: baseline,
            prompt_n: r.prompt_n,
            imageTokens,
            prompt_ms: r.prompt_ms,
            decode_ms: r.decode_ms,
          }),
        );
      } catch (err) {
        cells.push({
          pageId: page.id,
          budget,
          textOnlyBaseline: baseline,
          prompt_n: 0,
          imageTokens: 0,
          prompt_ms: null,
          decode_ms: null,
          wallMs: 0,
          attrs: null,
          attrsRaw: "",
          error: err instanceof Error ? err.message : String(err),
        });
        console.error("FAIL", page.id, budget, err);
      }
    }
  }
} finally {
  await server.stop();
}

await mkdir(OUT, { recursive: true });
await writeFile(
  RESULT_JSON,
  `${JSON.stringify({ pages, baselines, cells, spawnExample, at: new Date().toISOString() }, null, 2)}\n`,
  "utf8",
);
const md = renderMarkdown(pages, baselines, cells, spawnExample);
await appendFile(BENCH_MD, `\n${md}\n`, "utf8");
console.log("\n==== TABLES ====\n");
console.log(md);
