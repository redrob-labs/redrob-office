/**
 * Track B field cleanup: toolsNamed (OCR-only) reextract ×3 @1024.
 * caseStudyCount / pageType-other analysis written into result JSON (no product changes).
 *
 * node office/scripts/track-b-field-cleanup.mjs
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
const RESULT = join(OUT, "track-b-field-cleanup.json");
const PRIOR = join(OUT, "dense-remeasure-fixed.json");
const BENCH_MD = join(OUT, "BENCH.md");

const BUDGET = 1024;
const REPEATS = 3;

/** Baseline schema (toolEvidence) — for self-consistency compare only. */
const BASELINE_PROMPT = [
  "You are extracting structured attributes from ONE page image.",
  "Reply with ONLY a single JSON object (no markdown fences, no commentary) with exactly these keys:",
  '  "caseStudyCount": number,',
  '  "hasProcessDocumentation": boolean,',
  '  "layoutTypes": string[],',
  '  "toolEvidence": string[],',
  '  "screenCount": number',
  "If unsure, still guess from visible evidence. Do not invent keys.",
].join("\n");

/** Split: OCR-only tool names; no inferred capabilities. */
const SPLIT_PROMPT = [
  "You are extracting structured attributes from ONE page image.",
  "Reply with ONLY a single JSON object (no markdown fences, no commentary) with exactly these keys:",
  '  "caseStudyCount": number,',
  '  "hasProcessDocumentation": boolean,',
  '  "layoutTypes": string[],',
  '  "toolsNamed": string[],',
  '  "screenCount": number',
  "toolsNamed rules:",
  "- Include ONLY tool/library/model/product names whose characters are visibly printed on the page.",
  "- Do NOT infer capabilities, categories, or products that are not literally written.",
  "- Brand slogans and feature blurbs without a proper noun tool name → omit.",
  "If unsure, still guess from visible evidence. Do not invent keys.",
].join("\n");

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
  async chat(png, prompt, maxTokens = 256) {
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
    return { text: (j.choices?.[0]?.message?.content ?? "").trim() };
  }
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

function fieldStability(reps, key) {
  const vals = reps.map((x) => norm(x.attrs?.[key]));
  return vals.every((v) => v === vals[0]) && !reps.some((x) => x.attrs?._unparsed);
}

const pages = JSON.parse(await readFile(MANIFEST, "utf8"));
let priorSelf = null;
if (existsSync(PRIOR)) {
  try {
    const prior = JSON.parse(await readFile(PRIOR, "utf8"));
    priorSelf = { note: "prior dense-remeasure-fixed present; toolEvidence self-consist from this run's baseline arm" };
  } catch {
    /* */
  }
}

const analysis = {
  twoStageConfirmedFailed: true,
  singleSchemaKept: true,
  caseStudyCount: {
    oneSentenceDefinitionAttempt:
      "A case study is a titled, self-contained project narrative on the page that names a specific customer/context and outcome — not a feature bullet, testimonial quote, logo, or generic benefit claim.",
    definitionWritable: true,
    options: [
      {
        id: "remove",
        summary: "스키마에서 caseStudyCount 제거",
        pros: ["landing 8↔0 모호성 소멸", "정답 미정의 페이지에서 질문 자체 제거"],
        cons: ["caseStudy 페이지에서 유용할 수 있는 신호가 사라짐"],
      },
      {
        id: "landingFixedZero",
        summary: "landing에서만 0 고정(또는 질문 스킵), 타 타입만 질문",
        pros: ["landing 강제 시 정답 0과 일치", "caseStudy 등에서 유지 가능"],
        cons: ["pageType 의존 → 2단 실패와 충돌", "landing 오분류 시 0 강제 오류"],
      },
      {
        id: "redefine",
        summary: "위 한 문장 정의로 필드 재작성(전 타입 공통)",
        pros: ["단일 스키마 유지", "feature/testimonial 오인을 줄일 여지"],
        cons: ["정의가 길어지면 프롬프트 튜닝 유혹", "여전히 경계 사례 남음"],
      },
    ],
    recommendation:
      "정의는 한 문장으로 쓸 수 있으므로 제거가 유일한 답은 아님. 다만 2단(pageType)이 실패했으므로 landingFixedZero는 기각. 단일 스키마 하에 redefine을 시도하되, 재측정에서 자기일치가 안 나오면 remove.",
    preferredNext: "redefine_then_remeasure_else_remove",
  },
  toolEvidenceSplit: {
    toolsNamed: "페이지에 문자로 적힌 도구/라이브러리/모델/제품명만",
    inferredRemoved: "추론된 능력·카테고리·제품군은 필드에서 제거 (별도 필드 두지 않음)",
  },
  pageTypeOtherReview: {
    labelSource: "Opus 서술, 사람 미검수",
    pages: {
      "p-pdf-1": {
        was: "other",
        what: "Redrob LLM Architecture Brief — 내부 기술/전략 브리프(표+아키텍처 레이어). 랜딩/케이스스터디/인덱스/컨택 아님.",
        needsOwnType: false,
        note: "docBrief 또는 internalDoc로 쪼개도 Desk 분포 미지 상태에서 라벨 체계를 키우는 것은 시기상조.",
      },
      "p-pdf-2": {
        was: "other",
        what: "Studio KPI / benchmark priority 문서 페이지 — 평가 기준·벤치마크 설명. 제품 마케팅 랜딩 아님.",
        needsOwnType: false,
        note: "p-pdf-1과 같은 'internalDoc/brief' 묶음으로 충분.",
      },
      "p-pdf-3": {
        was: "other",
        what: "사주(Saju) 리딩 결과 UI — 만세력 그리드+서술. Redrob 점성/리포트 산출물.",
        needsOwnType: "maybe",
        note: "제품 산출물(report)이라 brief와 다름. 다만 7장 중 1장뿐이고 Desk 입력 분포 미지 → 지금은 other 유지 권고.",
      },
      "p-daylog-1": {
        was: "other",
        what: "Desk 앱 자체 스크린샷(채팅+whisper 오류). 포트폴리오/문서가 아니라 앱 UI.",
        needsOwnType: "maybe",
        note: "appUi/screenshot 후보. 분포 모르면 other 유지; Desk 입력이 스크린샷 위주면 그때 분리.",
      },
    },
    verdict:
      "other가 4/7인 건 샘플 구성 문제(랜딩 3 + 문서/앱 4). 분류 태스크 성립 전에 Desk 실입력 분포가 필요. 지금은 새 pageType 스키마 반영 금지; internalDoc vs appUi 분리는 분포 확인 후.",
  },
};

const server = new VisionServer();
const baselineRows = [];
const splitRows = [];

try {
  await server.start();
  for (const page of pages) {
    const prepared = await prepareImageForModel(await readFile(page.path));

    const baseReps = [];
    for (let rep = 1; rep <= REPEATS; rep++) {
      const r = await server.chat(prepared, BASELINE_PROMPT, 256);
      const attrs = parseJsonObj(r.text);
      baseReps.push({ rep, attrs, raw: r.text.slice(0, 240) });
      console.log("BASE", page.id, rep, JSON.stringify(attrs).slice(0, 140));
    }
    baselineRows.push({
      pageId: page.id,
      reps: baseReps,
      stable: {
        toolEvidence: fieldStability(baseReps, "toolEvidence"),
        caseStudyCount: fieldStability(baseReps, "caseStudyCount"),
        layoutTypes: fieldStability(baseReps, "layoutTypes"),
        screenCount: fieldStability(baseReps, "screenCount"),
        hasProcessDocumentation: fieldStability(baseReps, "hasProcessDocumentation"),
      },
    });

    const splitReps = [];
    for (let rep = 1; rep <= REPEATS; rep++) {
      const r = await server.chat(prepared, SPLIT_PROMPT, 256);
      const attrs = parseJsonObj(r.text);
      splitReps.push({ rep, attrs, raw: r.text.slice(0, 240) });
      console.log("SPLIT", page.id, rep, JSON.stringify(attrs).slice(0, 140));
    }
    splitRows.push({
      pageId: page.id,
      reps: splitReps,
      stable: {
        toolsNamed: fieldStability(splitReps, "toolsNamed"),
        caseStudyCount: fieldStability(splitReps, "caseStudyCount"),
        layoutTypes: fieldStability(splitReps, "layoutTypes"),
        screenCount: fieldStability(splitReps, "screenCount"),
        hasProcessDocumentation: fieldStability(splitReps, "hasProcessDocumentation"),
      },
    });
  }
} finally {
  await server.stop();
}

function rate(rows, key) {
  const xs = rows.map((r) => r.stable[key]);
  return xs.filter(Boolean).length / Math.max(1, xs.length);
}

const summary = {
  baselineToolEvidenceSelfConsist: rate(baselineRows, "toolEvidence"),
  splitToolsNamedSelfConsist: rate(splitRows, "toolsNamed"),
  baselineCaseStudySelfConsist: rate(baselineRows, "caseStudyCount"),
  splitCaseStudySelfConsist: rate(splitRows, "caseStudyCount"),
  deltaToolsField:
    rate(splitRows, "toolsNamed") - rate(baselineRows, "toolEvidence"),
};

const result = {
  at: new Date().toISOString(),
  budget: BUDGET,
  repeats: REPEATS,
  analysis,
  priorSelf,
  baseline: { prompt: "toolEvidence", rows: baselineRows },
  split: { prompt: "toolsNamed OCR-only; inferred removed", rows: splitRows },
  summary,
  productCodeUnchanged: true,
};

await mkdir(OUT, { recursive: true });
await writeFile(RESULT, `${JSON.stringify(result, null, 2)}\n`);

const md = [];
md.push("");
md.push("## Track B — problem field cleanup (post 2-stage fail)");
md.push("");
md.push(`- caseStudyCount preferredNext: **${analysis.caseStudyCount.preferredNext}**`);
md.push(`- toolsNamed self-consist: **${(summary.splitToolsNamedSelfConsist * 100).toFixed(0)}%** vs toolEvidence **${(summary.baselineToolEvidenceSelfConsist * 100).toFixed(0)}%** (Δ ${(summary.deltaToolsField * 100).toFixed(0)}pp)`);
md.push(`- pageType other: ${analysis.pageTypeOtherReview.verdict}`);
md.push("- Product code unchanged.");
md.push("");
await appendFile(BENCH_MD, md.join("\n"));
console.log("SUMMARY", summary);
console.log("wrote", RESULT);
