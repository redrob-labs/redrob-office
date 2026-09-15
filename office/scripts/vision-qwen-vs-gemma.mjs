/**
 * Qwen3.5-4B vs Gemma 4 E4B vision bench (GPU).
 * Metrics: canary ZEBRA-7741, screenCount self-consistency, layoutTypes vs human GT,
 * prompt_ms/decode_ms, peak VRAM. Excludes caseStudyCount/toolEvidence/hasProcessDocumentation.
 *
 * node office/scripts/vision-qwen-vs-gemma.mjs
 */
import { spawn, execFile } from "node:child_process";
import { createServer } from "node:net";
import { readFile, writeFile, mkdir, appendFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "../..");
createRequire(join(ROOT, "packages/kernel/package.json"));
const { prepareImageForModel } = await import(
  `file:///${join(ROOT, "packages/kernel/dist/vision/prepare-image.js").replace(/\\/g, "/")}`
);

const OUT = join(ROOT, "tmp/qwen35-ab-phase0");
const PAGES_DIR = join(OUT, "dense-pages");
const MANIFEST = join(PAGES_DIR, "manifest.json");
const PROBE = join(OUT, "probe.png");
const RESULT_JSON = join(OUT, "qwen-vs-gemma-bench.json");
const BENCH_MD = join(OUT, "BENCH.md");

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

const CANARY_PROMPT =
  "What exact alphanumeric token is printed in the white box on the cyan background? Reply with only that token, nothing else.";

/** Human layoutTypes GT — only these pages are scored. Synonyms accepted. */
const LAYOUT_GT = {
  "p-chat-1": { requiredAny: [["hero"], ["landing"], ["landing_page"], ["landing page"]] },
  "p-chat-2": { requiredAny: [["pricing"], ["comparison"], ["pricing_plan"]] },
  "p-pdf-1": { requiredAny: [["table"]] },
  "p-daylog-1": { requiredAny: [["dashboard"], ["sidebar"]] },
};

const BUDGET = 1024;
const REPEATS = 3;
const CANARY_REPEATS = 3;
const TEMPERATURE = 0.1;

function localAppData() {
  return process.env.LOCALAPPDATA ?? join(process.env.USERPROFILE ?? "", "AppData", "Local");
}
function resolveBin(name) {
  const root = join(localAppData(), "redrob", "verify-tools");
  for (const p of [join(root, "bin-cuda", `${name}.exe`), join(root, "bin", `${name}.exe`)]) {
    if (existsSync(p)) return p;
  }
  throw new Error(`missing ${name}`);
}
function nglLayers() {
  return 99;
}

const modelsRoot = join(localAppData(), "redrob", "models", "verify");
const MODELS = {
  qwen: {
    id: "qwen35-4b",
    label: "Qwen3.5-4B Q4_K_M",
    kind: "paths",
    lm: join(modelsRoot, "Qwen3.5-4B-Q4_K_M.gguf"),
    mmproj: join(modelsRoot, "qwen35-4b-mmproj", "mmproj-F16.gguf"),
    // Qwen-VL grounding requires min≈1024 (server warning).
    imageTokenArgs: ["--image-min-tokens", String(BUDGET), "--image-max-tokens", String(BUDGET)],
    extraArgs: ["--reasoning", "off"],
    preferNoMmprojOffload: false,
  },
  gemma: {
    id: "gemma4-e4b",
    label: "Gemma 4 E4B Q4_0 (-hf)",
    kind: "hf",
    hfRepo: "ggml-org/gemma-4-E4B-it-GGUF:Q4_0",
    lm: join(modelsRoot, "gemma4-e4b", "gemma-4-E4B-it-Q4_0.gguf"),
    mmproj: join(modelsRoot, "gemma4-e4b", "mmproj-gemma-4-E4B-it-BF16.gguf"),
    // image-min-tokens=1024 OOMs on 4060 8GB with this mmproj; max-only keeps budget 1024.
    imageTokenArgs: ["--image-max-tokens", String(BUDGET)],
    extraArgs: [
      "--jinja",
      "--reasoning-budget",
      "0",
      "--reasoning",
      "off",
      // Gemma vision uses non-causal attn; default ubatch asserts on ~1k image tokens.
      "--ubatch-size",
      "2048",
      "--batch-size",
      "2048",
    ],
    preferNoMmprojOffload: true,
  },
};

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

async function nvidiaMem() {
  try {
    const { stdout } = await execFileAsync(
      "nvidia-smi",
      ["--query-gpu=memory.used,memory.total", "--format=csv,noheader,nounits"],
      { windowsHide: true, encoding: "utf8", timeout: 5000 },
    );
    const [used, total] = String(stdout)
      .trim()
      .split(",")
      .map((x) => Number(x.trim()));
    return { usedMiB: used, totalMiB: total };
  } catch {
    return { usedMiB: null, totalMiB: null };
  }
}

function startVramSampler(intervalMs = 200) {
  const samples = [];
  let stopped = false;
  const tick = async () => {
    while (!stopped) {
      samples.push(await nvidiaMem());
      await new Promise((r) => setTimeout(r, intervalMs));
    }
  };
  const loop = tick();
  return {
    stop: async () => {
      stopped = true;
      await loop;
      const used = samples.map((s) => s.usedMiB).filter((n) => Number.isFinite(n));
      return {
        samples: samples.length,
        peakUsedMiB: used.length ? Math.max(...used) : null,
        minUsedMiB: used.length ? Math.min(...used) : null,
        totalMiB: samples[0]?.totalMiB ?? null,
      };
    },
  };
}

class MeasServer {
  constructor() {
    this.child = null;
    this.port = 0;
    this.lastArgs = [];
    this.spawnCmd = "";
  }

  buildArgs(model, { noMmprojOffload = false, preferHf = false } = {}) {
    const common = [
      "--host",
      "127.0.0.1",
      "--port",
      "PORT",
      "-ngl",
      String(nglLayers()),
      "-c",
      String(Math.max(8192, BUDGET + 4096)),
      "--parallel",
      "1",
      ...model.imageTokenArgs,
      ...model.extraArgs,
    ];
    if (noMmprojOffload || model.preferNoMmprojOffload) common.push("--no-mmproj-offload");

    // Gemma plan: -hf. Spawn from local ggml-org download when present
    // (identical files) so the bench does not re-pull 5GB; commandLines record -hf form.
    if (preferHf && model.kind === "hf") {
      return ["-hf", model.hfRepo, ...common];
    }
    return ["-m", model.lm, "--mmproj", model.mmproj, ...common];
  }

  async start(model, opts = {}) {
    await this.stop();
    this.port = await freePort();
    const bin = resolveBin("llama-server");
    const args = this.buildArgs(model, opts).map((a) => (a === "PORT" ? String(this.port) : a));
    this.lastArgs = args;
    this.spawnCmd = `${bin} ${args.join(" ")}`;
    console.log("\nSPAWN", this.spawnCmd);
    const child = spawn(bin, args, { windowsHide: true, cwd: dirname(bin) });
    this.child = child;
    let stderrBuf = "";
    child.stderr.on("data", (d) => {
      stderrBuf += d.toString();
      if (stderrBuf.length > 12000) stderrBuf = stderrBuf.slice(-6000);
    });
    child.stdout.on("data", () => undefined);
    this._stderr = () => stderrBuf;
    const started = Date.now();
    while (Date.now() - started < 300_000) {
      if (child.exitCode != null) {
        throw new Error(`server exited ${child.exitCode}\n${stderrBuf.slice(-2000)}`);
      }
      try {
        const res = await fetch(`http://127.0.0.1:${this.port}/health`);
        if (res.ok) return;
      } catch {
        /* wait */
      }
      await new Promise((r) => setTimeout(r, 400));
    }
    throw new Error(`health timeout\n${stderrBuf.slice(-2000)}`);
  }

  async stop() {
    if (!this.child) return;
    const proc = this.child;
    this.child = null;
    this.port = 0;
    try {
      proc.kill();
    } catch {
      /* ignore */
    }
    // Wait until VRAM settles (previous model must fully unload).
    for (let i = 0; i < 30; i++) {
      await new Promise((r) => setTimeout(r, 500));
      const mem = await nvidiaMem();
      if (mem.usedMiB != null && mem.usedMiB < 1200) break;
    }
  }

  async chat({ png, prompt, maxTokens = 256 }) {
    const content = [{ type: "text", text: prompt }];
    if (png) {
      content.push({
        type: "image_url",
        image_url: { url: `data:image/png;base64,${png.toString("base64")}` },
      });
    }
    const body = {
      model: "vision-bench",
      messages: [{ role: "user", content }],
      max_tokens: maxTokens,
      temperature: TEMPERATURE,
      stream: false,
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
      finish_reason: json.choices?.[0]?.finish_reason ?? null,
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

function normLabel(s) {
  return String(s).toLowerCase().replace(/[\s_-]+/g, "");
}

function layoutTypesHit(predicted, gt) {
  if (!Array.isArray(predicted)) return false;
  const norms = predicted.map(normLabel);
  return gt.requiredAny.some((group) => group.some((lab) => norms.includes(normLabel(lab))));
}

function canaryOk(text) {
  return /ZEBRA-7741/i.test(String(text).replace(/\s+/g, ""));
}

function avg(xs) {
  const v = xs.filter((n) => Number.isFinite(n));
  return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null;
}

function fileSizeGiB(path) {
  if (!existsSync(path)) return null;
  const { size } = require("node:fs").statSync(path);
  return size / (1024 ** 3);
}

const require = createRequire(import.meta.url);

// Validate assets
for (const m of Object.values(MODELS)) {
  if (m.kind === "paths" || existsSync(m.lm)) {
    if (!existsSync(m.lm)) throw new Error(`missing LM ${m.lm}`);
    if (!existsSync(m.mmproj)) throw new Error(`missing mmproj ${m.mmproj}`);
  }
}
if (!existsSync(PROBE)) throw new Error(`missing probe ${PROBE}`);
if (!existsSync(MANIFEST)) throw new Error(`missing manifest`);

const allPages = JSON.parse(await readFile(MANIFEST, "utf8"));
const pages = allPages.filter((p) => p.id !== "p-pdf-3");

console.log("=== Command lines (side by side) ===");
const qwenArgsPreview = new MeasServer().buildArgs(MODELS.qwen).map((a) => (a === "PORT" ? "<port>" : a));
const gemmaHfPreview = new MeasServer()
  .buildArgs(MODELS.gemma, { preferHf: true })
  .map((a) => (a === "PORT" ? "<port>" : a));
const gemmaLocalPreview = new MeasServer().buildArgs(MODELS.gemma).map((a) => (a === "PORT" ? "<port>" : a));
console.log("Qwen      :", resolveBin("llama-server"), qwenArgsPreview.join(" "));
console.log("Gemma -hf :", resolveBin("llama-server"), gemmaHfPreview.join(" "));
console.log("Gemma run :", resolveBin("llama-server"), gemmaLocalPreview.join(" "));
console.log("(Gemma run uses local files from ggml-org/gemma-4-E4B-it-GGUF download; same weights as -hf)");

const disk = {
  qwen: {
    lmGiB: fileSizeGiB(MODELS.qwen.lm),
    mmprojGiB: fileSizeGiB(MODELS.qwen.mmproj),
  },
  gemma: {
    lmGiB: fileSizeGiB(MODELS.gemma.lm),
    mmprojGiB: fileSizeGiB(MODELS.gemma.mmproj),
  },
};
console.log("disk GiB", disk);

const server = new MeasServer();
const result = {
  at: new Date().toISOString(),
  budget: BUDGET,
  temperature: TEMPERATURE,
  seed: null,
  ngl: nglLayers(),
  bin: resolveBin("llama-server"),
  layoutGt: LAYOUT_GT,
  excludedFields: ["caseStudyCount", "hasProcessDocumentation", "toolEvidence"],
  disk,
  commandLines: {
    qwen: `${resolveBin("llama-server")} ${qwenArgsPreview.join(" ")}`,
    gemma_hf: `${resolveBin("llama-server")} ${gemmaHfPreview.join(" ")}`,
    gemma_run_local_from_hf_repo: `${resolveBin("llama-server")} ${gemmaLocalPreview.join(" ")}`,
  },
  models: {},
};

const idle = await nvidiaMem();
console.log("idle VRAM", idle);

async function measureModel(key) {
  const model = MODELS[key];
  const out = {
    id: model.id,
    label: model.label,
    spawnCmd: null,
    vram: {},
    canary: [],
    pages: [],
  };

  // --- VRAM: load + 1-image peak ---
  // Gemma prefers --no-mmproj-offload on 8GB; still attempt mmproj-GPU once when not preferred.
  const startWithNoMm = Boolean(model.preferNoMmprojOffload);
  try {
    await server.start(model, { noMmprojOffload: startWithNoMm });
    out.spawnCmd = server.spawnCmd;
    await new Promise((r) => setTimeout(r, 800));
    const afterLoad = await nvidiaMem();
    const preparedProbe = await prepareImageForModel(await readFile(PROBE));
    const sampler = startVramSampler(150);
    const canaryWarm = await server.chat({
      png: preparedProbe,
      prompt: CANARY_PROMPT,
      maxTokens: 32,
    });
    const peak1 = await sampler.stop();
    const vramBlock = {
      afterLoadUsedMiB: afterLoad.usedMiB,
      totalMiB: afterLoad.totalMiB,
      peakDuring1ImageMiB: peak1.peakUsedMiB,
      headroomAfterLoadMiB:
        afterLoad.totalMiB != null && afterLoad.usedMiB != null
          ? afterLoad.totalMiB - afterLoad.usedMiB
          : null,
      headroomAtPeakMiB:
        peak1.totalMiB != null && peak1.peakUsedMiB != null
          ? peak1.totalMiB - peak1.peakUsedMiB
          : null,
      canaryWarmOk: canaryOk(canaryWarm.text),
      oom: false,
      noMmprojOffload: startWithNoMm,
    };
    if (startWithNoMm) out.vram.noMmprojOffloadPrimary = vramBlock;
    else out.vram.mmprojGpu = vramBlock;
    console.log(key, "vram primary", vramBlock);
  } catch (err) {
    out.vram.mmprojGpu = {
      oom: true,
      error: err instanceof Error ? err.message : String(err),
      note: "primary vision load/chat failed",
    };
    console.log(key, "vram primary FAILED", out.vram.mmprojGpu);
    await server.stop();
    await server.start(model, { noMmprojOffload: true });
    out.spawnCmd = server.spawnCmd;
  }

  if (!server.child) {
    await server.start(model, { noMmprojOffload: startWithNoMm || true });
    out.spawnCmd = server.spawnCmd;
  }
  out.pagesSpawnNote = startWithNoMm ? `${key} with --no-mmproj-offload` : null;
  if (out.pagesSpawnNote) console.log(out.pagesSpawnNote);

  const preparedProbe = await prepareImageForModel(await readFile(PROBE));

  // Canary × 3 (same session)
  for (let i = 1; i <= CANARY_REPEATS; i++) {
    const r = await server.chat({ png: preparedProbe, prompt: CANARY_PROMPT, maxTokens: 32 });
    out.canary.push({
      rep: i,
      ok: canaryOk(r.text),
      text: r.text.slice(0, 80),
      prompt_ms: r.prompt_ms,
      decode_ms: r.decode_ms,
    });
    console.log(key, "canary", i, out.canary[i - 1]);
  }

  for (const page of pages) {
    const prepared = await prepareImageForModel(await readFile(page.path));
    const reps = [];
    for (let rep = 1; rep <= REPEATS; rep++) {
      let r;
      try {
        r = await server.chat({ png: prepared, prompt: ATTR_PROMPT, maxTokens: 256 });
      } catch (err) {
        console.error("chat fail", key, page.id, rep, err);
        await server.stop();
        await server.start(model, { noMmprojOffload: true });
        r = await server.chat({ png: prepared, prompt: ATTR_PROMPT, maxTokens: 256 });
      }
      const attrs = parseAttrs(r.text);
      reps.push({
        rep,
        prompt_ms: r.prompt_ms,
        decode_ms: r.decode_ms,
        prompt_n: r.prompt_n,
        attrs,
        screenCount: attrs.screenCount,
        layoutTypes: attrs.layoutTypes,
        layoutHit:
          LAYOUT_GT[page.id] != null
            ? layoutTypesHit(attrs.layoutTypes, LAYOUT_GT[page.id])
            : null,
      });
      console.log(
        JSON.stringify({
          model: key,
          page: page.id,
          rep,
          prompt_ms: r.prompt_ms,
          screenCount: attrs.screenCount,
          layoutHit: reps[reps.length - 1].layoutHit,
        }),
      );
    }
    out.pages.push({ pageId: page.id, reps });
  }

  // --- VRAM alt mode ---
  await server.stop();
  const altNoMm = !startWithNoMm; // if primary was GPU mmproj, also measure no-offload; else try GPU mmproj
  try {
    await server.start(model, { noMmprojOffload: altNoMm });
    await new Promise((r) => setTimeout(r, 800));
    const afterLoadAlt = await nvidiaMem();
    const sampler2 = startVramSampler(150);
    await server.chat({ png: preparedProbe, prompt: CANARY_PROMPT, maxTokens: 32 });
    const peakAlt = await sampler2.stop();
    const alt = {
      afterLoadUsedMiB: afterLoadAlt.usedMiB,
      peakDuring1ImageMiB: peakAlt.peakUsedMiB,
      headroomAtPeakMiB:
        peakAlt.totalMiB != null && peakAlt.peakUsedMiB != null
          ? peakAlt.totalMiB - peakAlt.peakUsedMiB
          : null,
      spawnCmd: server.spawnCmd,
      noMmprojOffload: altNoMm,
      oom: false,
    };
    if (altNoMm) out.vram.noMmprojOffload = alt;
    else out.vram.mmprojGpu = alt;
    console.log(key, "vram alt", alt);
  } catch (err) {
    const fail = {
      oom: true,
      error: err instanceof Error ? err.message : String(err),
      noMmprojOffload: altNoMm,
    };
    if (altNoMm) out.vram.noMmprojOffload = fail;
    else out.vram.mmprojGpu = fail;
    console.log(key, "vram alt FAILED", fail);
  }
  await server.stop();

  // Aggregate
  const canaryRate = out.canary.filter((c) => c.ok).length / out.canary.length;
  const screenVals = out.pages.flatMap((p) => p.reps.map((r) => r.screenCount));
  const screenStablePages = out.pages.filter((p) => {
    const vals = p.reps.map((r) => JSON.stringify(r.screenCount));
    return vals.every((v) => v === vals[0]) && !p.reps.some((r) => r.attrs?._unparsed);
  }).length;
  const layoutScored = out.pages.filter((p) => LAYOUT_GT[p.pageId]);
  const layoutHits = layoutScored.flatMap((p) => p.reps.map((r) => r.layoutHit === true));
  const layoutHitRate = layoutHits.length ? layoutHits.filter(Boolean).length / layoutHits.length : null;
  const layoutStablePages = layoutScored.filter((p) => {
    const vals = p.reps.map((r) => JSON.stringify(r.layoutTypes));
    return vals.every((v) => v === vals[0]);
  }).length;

  const promptMs = out.pages.flatMap((p) => p.reps.map((r) => r.prompt_ms));
  const decodeMs = out.pages.flatMap((p) => p.reps.map((r) => r.decode_ms));

  out.summary = {
    canaryRate,
    screenCountSelfConsistentPages: `${screenStablePages}/${out.pages.length}`,
    layoutTypesHitRate: layoutHitRate,
    layoutTypesSelfConsistentPages: `${layoutStablePages}/${layoutScored.length}`,
    meanPromptMs: avg(promptMs),
    meanDecodeMs: avg(decodeMs),
    peakVramMiB:
      out.vram.mmprojGpu?.peakDuring1ImageMiB ??
      out.vram.noMmprojOffloadPrimary?.peakDuring1ImageMiB ??
      out.vram.noMmprojOffload?.peakDuring1ImageMiB,
    peakVramNoMmprojOffloadMiB:
      out.vram.noMmprojOffload?.peakDuring1ImageMiB ??
      out.vram.noMmprojOffloadPrimary?.peakDuring1ImageMiB,
    mmprojGpuOom: Boolean(out.vram.mmprojGpu?.oom),
  };
  return out;
}

try {
  result.models.qwen = await measureModel("qwen");
  result.models.gemma = await measureModel("gemma");
} finally {
  await server.stop();
}

// Verdict
const q = result.models.qwen.summary;
const g = result.models.gemma.summary;
let verdict;
if (q.canaryRate !== g.canaryRate) {
  verdict =
    q.canaryRate > g.canaryRate
      ? "Qwen — higher canary rate"
      : "Gemma — higher canary rate";
} else if (q.peakVramMiB !== g.peakVramMiB) {
  verdict =
    q.peakVramMiB < g.peakVramMiB
      ? "Qwen — lower peak VRAM (canary tie)"
      : "Gemma — lower peak VRAM (canary tie)";
} else {
  verdict =
    q.meanPromptMs <= g.meanPromptMs
      ? "Qwen — faster/equal prompt_ms (canary+VRAM tie)"
      : "Gemma — faster prompt_ms (canary+VRAM tie)";
}
result.verdict = verdict;

await mkdir(OUT, { recursive: true });
await writeFile(RESULT_JSON, `${JSON.stringify(result, null, 2)}\n`, "utf8");

const md = [];
md.push("");
md.push("## Qwen3.5-4B vs Gemma 4 E4B vision bench (GPU)");
md.push("");
md.push(`Date: ${result.at}`);
md.push("");
md.push("### Command lines");
md.push("```");
md.push(`Qwen      : ${result.commandLines.qwen}`);
md.push(`Gemma -hf : ${result.commandLines.gemma_hf}`);
md.push(`Gemma run : ${result.commandLines.gemma_run_local_from_hf_repo}`);
md.push("```");
md.push("");
md.push("Gemma run uses local files downloaded from `ggml-org/gemma-4-E4B-it-GGUF` (same as `-hf`); avoids a second 5GB pull.");
md.push("");
md.push("| metric | Qwen3.5-4B | Gemma 4 E4B |");
md.push("|---|---|---|");
md.push(`| disk LM+mmproj GiB | ${disk.qwen.lmGiB?.toFixed(2)}+${disk.qwen.mmprojGiB?.toFixed(2)} | ${disk.gemma.lmGiB?.toFixed(2)}+${disk.gemma.mmprojGiB?.toFixed(2)} |`);
md.push(`| canary ZEBRA-7741 | ${(q.canaryRate * 100).toFixed(0)}% (${result.models.qwen.canary.map((c) => (c.ok ? "ok" : "fail")).join(",")}) | ${(g.canaryRate * 100).toFixed(0)}% (${result.models.gemma.canary.map((c) => (c.ok ? "ok" : "fail")).join(",")}) |`);
md.push(`| screenCount self-consist | ${q.screenCountSelfConsistentPages} | ${g.screenCountSelfConsistentPages} |`);
md.push(`| layoutTypes hit rate (GT pages×3) | ${q.layoutTypesHitRate == null ? "—" : (q.layoutTypesHitRate * 100).toFixed(0) + "%"} | ${g.layoutTypesHitRate == null ? "—" : (g.layoutTypesHitRate * 100).toFixed(0) + "%"} |`);
md.push(`| layoutTypes self-consist | ${q.layoutTypesSelfConsistentPages} | ${g.layoutTypesSelfConsistentPages} |`);
md.push(`| mean prompt_ms | ${q.meanPromptMs?.toFixed(0)} | ${g.meanPromptMs?.toFixed(0)} |`);
md.push(`| mean decode_ms | ${q.meanDecodeMs?.toFixed(0)} | ${g.meanDecodeMs?.toFixed(0)} |`);
md.push(`| VRAM after load mmproj-GPU (MiB) | ${result.models.qwen.vram.mmprojGpu?.afterLoadUsedMiB ?? "—"} | ${result.models.gemma.vram.mmprojGpu?.oom ? "OOM/fail" : result.models.gemma.vram.mmprojGpu?.afterLoadUsedMiB ?? "—"} |`);
md.push(`| peak VRAM 1-image mmproj-GPU (MiB) | ${result.models.qwen.vram.mmprojGpu?.peakDuring1ImageMiB ?? "—"} | ${result.models.gemma.vram.mmprojGpu?.oom ? "OOM/fail" : result.models.gemma.vram.mmprojGpu?.peakDuring1ImageMiB ?? "—"} |`);
md.push(`| headroom at peak mmproj-GPU | ${result.models.qwen.vram.mmprojGpu?.headroomAtPeakMiB ?? "—"} | ${result.models.gemma.vram.mmprojGpu?.oom ? "—" : result.models.gemma.vram.mmprojGpu?.headroomAtPeakMiB ?? "—"} |`);
md.push(`| peak VRAM --no-mmproj-offload | ${q.peakVramNoMmprojOffloadMiB} | ${g.peakVramNoMmprojOffloadMiB} |`);
md.push(`| pages/canary offload mode | mmproj GPU | ${result.models.gemma.pagesSpawnNote ?? "mmproj GPU"} |`);
md.push("");
md.push(`**Verdict:** ${verdict}`);
md.push("");
md.push("Excluded from judging: caseStudyCount, hasProcessDocumentation, toolEvidence. Product defaults unchanged.");
md.push("");
await appendFile(BENCH_MD, md.join("\n"), "utf8");
console.log(md.join("\n"));
console.log("wrote", RESULT_JSON);
