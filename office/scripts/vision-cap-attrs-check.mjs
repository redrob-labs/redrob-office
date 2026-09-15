/**
 * Cap semantics + attrs cause check (measurement only).
 * node office/scripts/vision-cap-attrs-check.mjs
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
const PAGES = join(OUT, "dense-pages");
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

function buildArgs(imageMaxTokens, port) {
  const minTok = Math.min(imageMaxTokens, 1024);
  return [
    "-m",
    resolveLm(),
    "--mmproj",
    resolveMmproj(),
    "--host",
    "127.0.0.1",
    "--port",
    String(port),
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
}

async function startServer(imageMaxTokens) {
  const port = await freePort();
  const args = buildArgs(imageMaxTokens, port);
  console.log("\n=== SPAWN CMDLINE ===");
  console.log(resolveBin("llama-server"));
  console.log(args.map((a) => (/\s/.test(a) ? JSON.stringify(a) : a)).join(" "));
  console.log(
    JSON.stringify(
      {
        imageMaxTokens,
        imageMinTokens: Math.min(Math.min(imageMaxTokens, 1024), imageMaxTokens),
        note: "dense harness sets min=max(=budget) except when budget>1024 min stays 1024",
      },
      null,
      2,
    ),
  );
  const child = spawn(resolveBin("llama-server"), args, { windowsHide: true });
  let stderr = "";
  child.stderr.on("data", (d) => {
    stderr += String(d);
  });
  child.stdout.on("data", () => undefined);
  const t0 = Date.now();
  while (Date.now() - t0 < 180_000) {
    try {
      const res = await fetch(`http://127.0.0.1:${port}/health`);
      if (res.ok) break;
    } catch {
      /* wait */
    }
    await new Promise((r) => setTimeout(r, 400));
  }
  // print hparams warnings about image tokens
  const hints = stderr
    .split(/\r?\n/)
    .filter((l) => /image|token|mmproj|min|max|clip/i.test(l))
    .slice(0, 40);
  console.log("=== stderr hints (image/token) ===");
  console.log(hints.join("\n") || "(none)");
  return { child, port, args, stderr };
}

async function chat(port, png, label) {
  const body = {
    model: "qwen35",
    messages: [
      {
        role: "user",
        content: [
          { type: "text", text: ATTR_PROMPT },
          { type: "image_url", image_url: { url: `data:image/png;base64,${png.toString("base64")}` } },
        ],
      },
    ],
    max_tokens: 256,
    temperature: 0.1,
    stream: false,
  };
  const res = await fetch(`http://127.0.0.1:${port}/v1/chat/completions`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} ${await res.text()}`);
  const json = await res.json();
  const raw = json.choices?.[0]?.message?.content ?? "";
  const usage = json.usage ?? null;
  const timings = json.timings ?? null;
  console.log(`\n=== RAW OUTPUT [${label}] ===`);
  console.log(raw);
  console.log("--- usage ---");
  console.log(JSON.stringify(usage, null, 2));
  console.log("--- timings ---");
  console.log(JSON.stringify(timings, null, 2));
  return { raw, usage, timings, json };
}

function findCareerChat() {
  // resolved via manifest source
  return null;
}

const prior = JSON.parse(await readFile(join(OUT, "dense-remeasure.json"), "utf8"));
const pages = prior.pages;
const chat1 = pages.find((p) => p.id === "p-chat-1");
const pdf1 = pages.find((p) => p.id === "p-pdf-1");

// --- Check 1 analysis from prior data ---
const analysis = {
  harnessCapLogic: "capApplied = (prompt_n >= budget) where prompt_n is TOTAL prompt tokens (image + text), NOT image-only",
  spawnRule: "image-min-tokens = min(budget, 1024); image-max-tokens = budget  → for 512/1024, min==max",
  contradictionResolved:
    "Not a physics contradiction: raising budget with min=max retargets dynamic resolution so the SAME file yields more image tokens. prompt_n~1060 at 1024 is ~1024 image + ~text, not 'natural tokens exceeding 512'.",
};

console.log("\n=== CHECK1 ANALYSIS ===");
console.log(JSON.stringify(analysis, null, 2));

console.log("\n=== PRIOR prompt_n by page/budget ===");
for (const pid of ["p-chat-1", "p-chat-2", "p-chat-3", "p-pdf-1", "p-pdf-2", "p-pdf-3", "p-daylog-1"]) {
  const row = { id: pid };
  for (const b of [512, 1024, 2048]) {
    const c = prior.cells.find((x) => x.pageId === pid && x.budget === b);
    row[`b${b}`] = c ? `${c.prompt_n}(${c.capApplied ? "적용" : "미적용"})` : "?";
  }
  console.log(row);
}

// Estimate text-only prompt tokens by running without image at 512 server
let server = await startServer(512);
try {
  const textOnly = await fetch(`http://127.0.0.1:${server.port}/v1/chat/completions`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "qwen35",
      messages: [{ role: "user", content: ATTR_PROMPT }],
      max_tokens: 8,
      temperature: 0.1,
      stream: false,
    }),
  });
  const tj = await textOnly.json();
  console.log("\n=== TEXT-ONLY usage (ATTR_PROMPT, no image) ===");
  console.log(JSON.stringify(tj.usage, null, 2));
  console.log(JSON.stringify(tj.timings, null, 2));
} finally {
  server.child.kill();
  await new Promise((r) => setTimeout(r, 800));
}

// Probe: same page at max=512 min=0-ish vs max=1024 — actually server may not allow min 0
// Run budget 512 and 1024 on pdf-1 and print prompt_n delta
const probeResults = [];
for (const budget of [512, 1024]) {
  server = await startServer(budget);
  try {
    const raw = await readFile(pdf1.path);
    const prepared = await prepareImageForModel(raw);
    const r = await chat(server.port, prepared, `probe-pdf1-budget${budget}`);
    probeResults.push({
      budget,
      prompt_n: r.timings?.prompt_n ?? r.usage?.prompt_tokens,
      usage: r.usage,
      timings: r.timings,
    });
  } finally {
    server.child.kill();
    await new Promise((r) => setTimeout(r, 800));
  }
}
console.log("\n=== PROBE pdf-1 512 vs 1024 prompt_n ===");
console.log(JSON.stringify(probeResults, null, 2));

// --- Check 2: re-pull attrs at 2048 for the two cap-applied pages + whole CareerChat ---
server = await startServer(2048);
const check2 = {};
try {
  for (const page of [chat1, pdf1]) {
    const prepared = await prepareImageForModel(await readFile(page.path));
    const r = await chat(server.port, prepared, `2048-rerun-${page.id}`);
    check2[page.id] = {
      raw: r.raw,
      prompt_n: r.timings?.prompt_n,
      usage: r.usage,
      prior512: prior.cells.find((c) => c.pageId === page.id && c.budget === 512)?.attrsRaw,
      prior1024: prior.cells.find((c) => c.pageId === page.id && c.budget === 1024)?.attrsRaw,
      prior2048: prior.cells.find((c) => c.pageId === page.id && c.budget === 2048)?.attrsRaw,
    };
  }

  // whole CareerChat (no downscale)
  let chatWholePath = chat1.source;
  if (!existsSync(chatWholePath)) {
    const { readdirSync } = await import("node:fs");
    const downloads = join(process.env.USERPROFILE ?? "", "Downloads");
    const stack = [downloads];
    while (stack.length && !existsSync(chatWholePath)) {
      const dir = stack.pop();
      let entries = [];
      try {
        entries = readdirSync(dir, { withFileTypes: true });
      } catch {
        continue;
      }
      for (const ent of entries) {
        const p = join(dir, ent.name);
        if (ent.isDirectory()) stack.push(p);
        else if (/CareerChat.*Main\.png$/i.test(ent.name)) {
          chatWholePath = p;
          break;
        }
      }
    }
  }
  if (existsSync(chatWholePath)) {
    const whole = await prepareImageForModel(await readFile(chatWholePath));
    const r = await chat(server.port, whole, "2048-CareerChat-WHOLE");
    check2.careerChatWhole = {
      raw: r.raw,
      prompt_n: r.timings?.prompt_n,
      usage: r.usage,
      source: chatWholePath,
    };
  } else {
    check2.careerChatWhole = { error: `source missing: ${chat1.source}` };
  }
} finally {
  server.child.kill();
}

await mkdir(OUT, { recursive: true });
const outPath = join(OUT, "cap-attrs-check.json");
await writeFile(
  outPath,
  `${JSON.stringify({ analysis, probeResults, check2, at: new Date().toISOString() }, null, 2)}\n`,
  "utf8",
);
console.log("\nWrote", outPath);
