/**
 * Track B: pageType labels + matrix + optional 2-stage schema reextract.
 * node office/scripts/track-b-schema.mjs
 *
 * Assumes Track A already decided; runs vision 2-stage only if matrix has (c) cells.
 */
import { spawn } from "node:child_process";
import { createServer } from "node:net";
import { mkdir, writeFile, readFile, appendFile } from "node:fs/promises";
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
const RESULT = join(OUT, "track-b-schema.json");
const BENCH_MD = join(OUT, "BENCH.md");

/** Opus labels — human not reviewed. */
const PAGE_TYPE_LABELS = {
  "p-chat-1": "landing",
  "p-chat-2": "landing",
  "p-chat-3": "landing",
  "p-pdf-1": "other",
  "p-pdf-2": "other",
  "p-pdf-3": "other",
  "p-daylog-1": "other",
};

/**
 * (a) answerable with defined ground truth
 * (b) always 0/null for this pageType
 * (c) should not ask — ambiguous / not well-defined
 */
const MATRIX = {
  landing: {
    caseStudyCount: "c",
    hasProcessDocumentation: "a",
    layoutTypes: "a",
    toolEvidence: "c",
    screenCount: "a",
  },
  caseStudy: {
    caseStudyCount: "a",
    hasProcessDocumentation: "a",
    layoutTypes: "a",
    toolEvidence: "a",
    screenCount: "a",
  },
  index: {
    caseStudyCount: "b",
    hasProcessDocumentation: "b",
    layoutTypes: "a",
    toolEvidence: "c",
    screenCount: "a",
  },
  contact: {
    caseStudyCount: "b",
    hasProcessDocumentation: "b",
    layoutTypes: "a",
    toolEvidence: "b",
    screenCount: "a",
  },
  other: {
    caseStudyCount: "b",
    hasProcessDocumentation: "c",
    layoutTypes: "a",
    toolEvidence: "c",
    screenCount: "a",
  },
};

const FIELDS_BY_TYPE = {};
for (const [pt, row] of Object.entries(MATRIX)) {
  FIELDS_BY_TYPE[pt] = Object.entries(row)
    .filter(([, v]) => v === "a")
    .map(([k]) => k);
}

const BUDGET = 1024;
const REPEATS = 3;

function localAppData() {
  return process.env.LOCALAPPDATA ?? "";
}
function resolveBin(name) {
  const root = join(localAppData(), "redrob", "verify-tools");
  for (const p of [join(root, "bin-cuda", `${name}.exe`), join(root, "bin", `${name}.exe`)]) {
    if (existsSync(p)) return p;
  }
  throw new Error(`missing ${name}`);
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

class VisionServer {
  constructor() {
    this.child = null;
    this.port = 0;
  }
  async start() {
    await this.stop();
    this.port = await freePort();
    const lm = join(localAppData(), "redrob/models/verify/Qwen3.5-4B-Q4_K_M.gguf");
    const mm = join(localAppData(), "redrob/models/verify/qwen35-4b-mmproj/mmproj-F16.gguf");
    const args = [
      "-m",
      lm,
      "--mmproj",
      mm,
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
      "--image-min-tokens",
      String(BUDGET),
      "--image-max-tokens",
      String(BUDGET),
      "--reasoning",
      "off",
    ];
    console.log("SPAWN", resolveBin("llama-server"), args.join(" "));
    this.child = spawn(resolveBin("llama-server"), args, {
      windowsHide: true,
      cwd: dirname(resolveBin("llama-server")),
    });
    const t0 = Date.now();
    while (Date.now() - t0 < 180_000) {
      try {
        if ((await fetch(`http://127.0.0.1:${this.port}/health`)).ok) return;
      } catch {
        /* */
      }
      await new Promise((r) => setTimeout(r, 400));
    }
    throw new Error("vision health timeout");
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
    await new Promise((r) => setTimeout(r, 1500));
  }
  async chat(png, prompt, maxTokens = 128) {
    const body = {
      model: "qwen",
      messages: [
        {
          role: "user",
          content: [
            { type: "text", text: prompt },
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
      cache_prompt: false,
    };
    const res = await fetch(`http://127.0.0.1:${this.port}/v1/chat/completions`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status} ${await res.text()}`);
    const j = await res.json();
    const t = j.timings ?? {};
    return {
      text: (j.choices?.[0]?.message?.content ?? "").trim(),
      prompt_ms: t.prompt_ms ?? null,
      decode_ms: t.predicted_ms ?? null,
    };
  }
}

const STAGE1_PROMPT = [
  "Classify this page image into exactly ONE label.",
  "Reply with ONLY one of these tokens (no punctuation, no explanation):",
  "landing",
  "caseStudy",
  "index",
  "contact",
  "other",
].join("\n");

function stage2Prompt(pageType, fields) {
  const keys = fields
    .map((f) => {
      if (f === "caseStudyCount") return '  "caseStudyCount": number,';
      if (f === "hasProcessDocumentation") return '  "hasProcessDocumentation": boolean,';
      if (f === "layoutTypes") return '  "layoutTypes": string[],';
      if (f === "toolEvidence") return '  "toolEvidence": string[],';
      if (f === "screenCount") return '  "screenCount": number,';
      return null;
    })
    .filter(Boolean);
  // drop trailing comma on last
  if (keys.length) keys[keys.length - 1] = keys[keys.length - 1].replace(/,$/, "");
  return [
    `pageType is already known: ${pageType}.`,
    "Extract ONLY these fields from the page image.",
    "Reply with ONLY a single JSON object (no markdown) with exactly these keys:",
    ...keys,
    "If unsure, still guess from visible evidence.",
  ].join("\n");
}

function parsePageType(text) {
  const t = text.toLowerCase().replace(/[^a-z]/g, "");
  for (const lab of ["landing", "casestudy", "index", "contact", "other"]) {
    if (t.includes(lab)) {
      if (lab === "casestudy") return "caseStudy";
      return lab;
    }
  }
  return null;
}

function parseJsonObj(raw) {
  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  if (start < 0 || end < start) return { _unparsed: raw.slice(0, 400) };
  try {
    return JSON.parse(raw.slice(start, end + 1));
  } catch {
    return { _unparsed: raw.slice(0, 400) };
  }
}

function norm(v) {
  if (Array.isArray(v)) return JSON.stringify([...v].map(String).sort());
  return JSON.stringify(v);
}

const hasC = Object.values(MATRIX).some((row) => Object.values(row).includes("c"));
const pages = JSON.parse(await readFile(MANIFEST, "utf8"));

const result = {
  at: new Date().toISOString(),
  labelSource: "Opus 라벨, 사람 미검수",
  pageTypeLabels: PAGE_TYPE_LABELS,
  matrix: MATRIX,
  fieldsByType: FIELDS_BY_TYPE,
  answers: {
    landingCaseStudyCount:
      "묻지 말아야 함 (c). 전용 case-study 섹션이 없으면 강제 정의 시 정답은 0이지 null이 아님. 하지만 feature/testimonial/logo를 case study로 세는 정의가 모호해 512/1024에서 8↔0이 갈림.",
    toolEvidenceAmbiguity:
      "섞임. 페이지에 적힌 도구명(OCR)과 제품 능력 추론(AI Interview 등)이 한 필드에 혼재 → 필드 정의 모호 (c).",
  },
  hasC,
  decisionPath: null,
  stage1: null,
  stage2: null,
};

if (!hasC) {
  result.decisionPath = "단일 스키마 유지 (c 없음 → B-3 스킵)";
  await writeFile(RESULT, `${JSON.stringify(result, null, 2)}\n`);
  console.log(result.decisionPath);
  process.exit(0);
}

result.decisionPath = "B-3/B-4 진행 (c 존재)";
const server = new VisionServer();
const stage1Rows = [];
const stage2Rows = [];

try {
  await server.start();
  for (const page of pages) {
    const prepared = await prepareImageForModel(await readFile(page.path));
    const gt = PAGE_TYPE_LABELS[page.id];
    const reps = [];
    for (let rep = 1; rep <= REPEATS; rep++) {
      const r = await server.chat(prepared, STAGE1_PROMPT, 16);
      const pred = parsePageType(r.text);
      reps.push({ rep, pred, raw: r.text.slice(0, 40), prompt_ms: r.prompt_ms, ok: pred === gt });
      console.log("B4-s1", page.id, rep, pred, "gt=", gt, reps[reps.length - 1].ok);
    }
    const stable = reps.every((x) => x.pred === reps[0].pred);
    stage1Rows.push({ pageId: page.id, gt, reps, stable, accuracy: reps.filter((x) => x.ok).length / reps.length });
  }

  const pageTypeUnstable = stage1Rows.some((r) => !r.stable);
  const stage1Acc =
    stage1Rows.reduce((s, r) => s + r.accuracy, 0) / Math.max(1, stage1Rows.length);

  if (pageTypeUnstable) {
    result.stage1 = { rows: stage1Rows, accuracy: stage1Acc, unstable: true };
    result.final = "2단 실패, 단일 스키마 유지";
    console.log(result.final);
  } else {
    // stage 2 with predicted type from rep1 (stable)
    for (const page of pages) {
      const prepared = await prepareImageForModel(await readFile(page.path));
      const s1 = stage1Rows.find((r) => r.pageId === page.id);
      const pageType = s1.reps[0].pred || s1.gt;
      const fields = FIELDS_BY_TYPE[pageType] || ["screenCount", "layoutTypes"];
      const prompt = stage2Prompt(pageType, fields);
      const reps = [];
      for (let rep = 1; rep <= REPEATS; rep++) {
        const r = await server.chat(prepared, prompt, 256);
        const attrs = parseJsonObj(r.text);
        reps.push({ rep, attrs, prompt_ms: r.prompt_ms });
        console.log("B4-s2", page.id, pageType, rep, JSON.stringify(attrs).slice(0, 120));
      }
      const fieldStability = {};
      for (const f of fields) {
        const vals = reps.map((x) => norm(x.attrs?.[f]));
        fieldStability[f] = vals.every((v) => v === vals[0]) && !reps.some((x) => x.attrs?._unparsed);
      }
      stage2Rows.push({ pageId: page.id, pageType, fields, reps, fieldStability });
    }
    result.stage1 = { rows: stage1Rows, accuracy: stage1Acc, unstable: false };
    result.stage2 = { rows: stage2Rows };
    const stableFields = stage2Rows.flatMap((r) => Object.values(r.fieldStability));
    const selfRate = stableFields.filter(Boolean).length / Math.max(1, stableFields.length);
    // prior single-schema had 14 mismatches across budgets; here we report self-consistency share
    result.final =
      stage1Acc >= 0.8 && selfRate >= 0.7
        ? "2단 채택 권고"
        : "2단 실패, 단일 스키마 유지";
    result.stage2.selfConsistencyRate = selfRate;
    console.log(result.final, { stage1Acc, selfRate });
  }
} finally {
  await server.stop();
}

await writeFile(RESULT, `${JSON.stringify(result, null, 2)}\n`);
const md = [];
md.push("");
md.push("## Track B — schema conditional redesign");
md.push("");
md.push(`Labels: **${result.labelSource}**`);
md.push("");
md.push("| page | pageType |");
md.push("|---|---|");
for (const [id, pt] of Object.entries(PAGE_TYPE_LABELS)) md.push(`| ${id} | ${pt} |`);
md.push("");
md.push("### pageType × field matrix (a/b/c)");
md.push("");
md.push("| pageType | caseStudyCount | hasProcessDocumentation | layoutTypes | toolEvidence | screenCount |");
md.push("|---|---|---|---|---|---|");
for (const [pt, row] of Object.entries(MATRIX)) {
  md.push(
    `| ${pt} | ${row.caseStudyCount} | ${row.hasProcessDocumentation} | ${row.layoutTypes} | ${row.toolEvidence} | ${row.screenCount} |`,
  );
}
md.push("");
md.push(`- landing caseStudyCount: ${result.answers.landingCaseStudyCount}`);
md.push(`- toolEvidence: ${result.answers.toolEvidenceAmbiguity}`);
md.push(`- path: ${result.decisionPath}`);
md.push(`- **final: ${result.final}**`);
if (result.stage1) {
  md.push(
    `- stage1 accuracy vs Opus labels: ${(result.stage1.accuracy * 100).toFixed(0)}%; unstable=${result.stage1.unstable}`,
  );
}
if (result.stage2?.selfConsistencyRate != null) {
  md.push(`- stage2 field self-consistency: ${(result.stage2.selfConsistencyRate * 100).toFixed(0)}%`);
}
md.push("");
md.push("Product code unchanged — recommendation only.");
md.push("");
await appendFile(BENCH_MD, md.join("\n"));
console.log("wrote", RESULT);
