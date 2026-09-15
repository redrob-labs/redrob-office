import { slugifyRubricSuffix } from "@redrob/generate";
import { join } from "node:path";
import {
  listUserWorkflows,
  loadUserWorkflow,
  saveUserWorkflow,
  setUserWorkflowsDir,
  type WorkflowDefinition,
  type WorkflowEngine,
  type WorkflowStep,
  type WorkflowTrigger,
} from "@redrob/registry";
import { nowIso } from "../app-time.js";
import { validateTrigger } from "./workflow-triggers.js";

export type DeskLocale = "en" | "ko";

type L = { ko: string; en: string };

type LocalizedStep = {
  engine: WorkflowEngine;
  action: string;
  title: L;
  registryId?: string;
  notes?: L;
};

type LocalizedPreset = {
  workspaceId: string;
  title: L;
  slug: string;
  /** When to reach for this skill. Chat matches on it when asked by name. */
  description?: L;
  /** How to do the work, for chat to follow when it runs the skill as a guide. */
  instructions?: L;
  steps: LocalizedStep[];
};

export function configureUserWorkflows(userDataPath: string): string {
  const dir = join(userDataPath, "registry", "workflows");
  setUserWorkflowsDir(dir);
  return dir;
}

export interface SaveWorkflowRequest {
  workspaceId: string;
  title: string;
  /** When to use this flow. Chat reads it to decide which flow was asked for. */
  description?: string;
  /** How to do the work, for chat to follow as a skill guide. */
  instructions?: string;
  slug?: string;
  steps: Array<{
    engine: WorkflowEngine;
    action: string;
    title: string;
    registryId?: string;
    notes?: string;
  }>;
  /** When it should run on its own, and where to report. */
  trigger?: WorkflowTrigger;
}

function normalizeLocale(locale?: string): DeskLocale {
  return locale === "en" ? "en" : "ko";
}

function pick(text: L, locale: DeskLocale): string {
  return text[locale];
}

function localizePreset(preset: LocalizedPreset, locale: DeskLocale): SaveWorkflowRequest {
  return {
    workspaceId: preset.workspaceId,
    title: pick(preset.title, locale),
    slug: preset.slug,
    ...(preset.description ? { description: pick(preset.description, locale) } : {}),
    ...(preset.instructions ? { instructions: pick(preset.instructions, locale) } : {}),
    steps: preset.steps.map((step) => ({
      engine: step.engine,
      action: step.action,
      title: pick(step.title, locale),
      ...(step.registryId ? { registryId: step.registryId } : {}),
      ...(step.notes ? { notes: pick(step.notes, locale) } : {}),
    })),
  };
}

/**
 * What someone sees before they have written a skill of their own. These are
 * deliberately not about any one department: the industry sets below are there
 * for people who go looking, but nobody should have to identify as a recruiter
 * to recognize their own work here.
 */
const GENERAL_WORKFLOW_PRESETS: LocalizedPreset[] = [
  {
    workspaceId: "general",
    title: { ko: "리서치 → 덱", en: "Research → deck" },
    slug: "research-deck",
    description: {
      ko: "주제를 조사해 슬라이드 아웃라인까지 만듭니다.",
      en: "Look a subject up, then turn what you found into a slide outline.",
    },
    instructions: {
      ko: "1) 웹에서 주제를 조사하고 출처를 남깁니다. 2) 조사 내용을 슬라이드별 아웃라인으로 정리합니다. 슬라이드 하나당 한 가지 주장만 담습니다.",
      en: "1) Search the web for the subject and keep the sources. 2) Turn what you found into a slide-by-slide outline, one claim per slide.",
    },
    steps: [
      {
        engine: "lookup",
        action: "research",
        title: { ko: "주제 조사", en: "Look the subject up" },
        notes: {
          ko: "채팅에서 웹을 찾아보고 요점을 정리합니다.",
          en: "Chat searches the web and pulls the points together.",
        },
      },
      {
        engine: "process",
        action: "deck",
        title: { ko: "슬라이드 아웃라인", en: "Slide outline" },
        registryId: "marketing/deck-outline",
      },
    ],
  },
  {
    workspaceId: "general",
    title: { ko: "리서치 → 웹페이지", en: "Research → web page" },
    slug: "research-page",
    description: {
      ko: "조사한 내용을 브라우저에서 바로 열리는 HTML 한 장으로 만듭니다.",
      en: "Turn what you found into a single HTML page that opens in a browser.",
    },
    instructions: {
      ko: "1) 주제를 조사합니다. 2) 조사 결과로 self-contained HTML 파일 한 개를 fs.write로 씁니다 — CSS는 인라인으로, 외부 의존성 없이. 3) 문서 탭에서 열어 확인합니다.",
      en: "1) Research the subject. 2) Write ONE self-contained .html file with fs.write — inline CSS, no external dependencies. 3) Open it from Documents to check how it renders.",
    },
    steps: [
      {
        engine: "lookup",
        action: "research",
        title: { ko: "주제 조사", en: "Look the subject up" },
      },
      {
        engine: "process",
        action: "custom",
        title: { ko: "HTML 페이지 작성", en: "Write the HTML page" },
        notes: {
          ko: "채팅에 맡기면 self-contained .html 파일을 씁니다.",
          en: "Ask chat for it: one self-contained .html file, inline styles.",
        },
      },
    ],
  },
  {
    workspaceId: "general",
    title: { ko: "메모 → 문서", en: "Notes → document" },
    slug: "notes-document",
    description: {
      ko: "흩어진 메모를 남에게 보낼 수 있는 문서로 정리합니다.",
      en: "Turn loose notes into a document someone else can read.",
    },
    instructions: {
      ko: "1) 메모를 제목이 있는 초안으로 정리합니다. 2) 문장을 다듬고 빠진 부분을 표시합니다.",
      en: "1) Shape the notes into a draft with headings. 2) Tighten the wording and flag anything still missing.",
    },
    steps: [
      {
        engine: "process",
        action: "memo",
        title: { ko: "초안 작성", en: "Draft it" },
        registryId: "legal/memo",
      },
      {
        engine: "process",
        action: "documentEdit",
        title: { ko: "문서 다듬기", en: "Edit the draft" },
      },
    ],
  },
];

/** Example recruiting flows users can load into the editor. */
/** Presets are multi-step only — single-action work belongs under Templates. */
const RECRUITING_WORKFLOW_PRESETS: LocalizedPreset[] = [
  {
    workspaceId: "recruiting",
    title: { ko: "공고 → 평가 기준", en: "JD → scoring criteria" },
    slug: "jd-to-rubric",
    steps: [
      {
        engine: "process",
        action: "jd",
        title: { ko: "채용 공고 초안", en: "Job posting draft" },
        registryId: "recruiting/jd",
        notes: {
          ko: "역할·업무·자격 요건을 넣으면 JD 마크다운을 만듭니다.",
          en: "Add role, responsibilities, and requirements to get JD markdown.",
        },
      },
      {
        engine: "process",
        action: "rubric",
        title: { ko: "공고에서 채점 기준 만들기", en: "Build scoring criteria from a posting" },
        notes: {
          ko: "방금 쓴 JD를 붙여 축별 루브릭을 이 기기에 저장합니다.",
          en: "Paste the JD to save a per-axis rubric on this device.",
        },
      },
    ],
  },
  {
    workspaceId: "recruiting",
    title: { ko: "접수 → 채점", en: "Intake → score" },
    slug: "assess-candidates",
    steps: [
      {
        engine: "lookup",
        action: "intake",
        title: { ko: "이력서 접수", en: "Resume intake" },
        registryId: "recruiting/resume",
        notes: {
          ko: "대량은 폴더 접수. 단건은 파일 하나만 넣어도 됩니다.",
          en: "Use a folder for batches, or drop a single file.",
        },
      },
      {
        engine: "process",
        action: "assess",
        title: { ko: "기준별 채점", en: "Score against rubric" },
        registryId: "recruiting/candidate-6axis",
        notes: {
          ko: "저장된 루브릭으로 지원자별 점수·피드백을 남깁니다.",
          en: "Score each candidate and leave feedback with a saved rubric.",
        },
      },
    ],
  },
  {
    workspaceId: "recruiting",
    title: { ko: "위조 확인 → 메일", en: "Verify → decision email" },
    slug: "verify-email",
    steps: [
      {
        engine: "review",
        action: "verify",
        title: { ko: "증명서·경력 위조 확인", en: "Check certificate / experience mismatch" },
        registryId: "recruiting/degree-certificate.in",
        notes: {
          ko: "증명서 원문과 이력서를 맞춰 어긋남을 검토로 남깁니다.",
          en: "Compare certificate text with the resume and flag mismatches for review.",
        },
      },
      {
        engine: "process",
        action: "email",
        title: { ko: "합격·탈락 메일 초안", en: "Decision email draft" },
        registryId: "recruiting/decision-email",
        notes: {
          ko: "채점·추천 결과에 맞춰 보낼 메일 문안을 만듭니다.",
          en: "Draft the email from scoring and recommendation results.",
        },
      },
    ],
  },
];

const PRODUCT_WORKFLOW_PRESETS: LocalizedPreset[] = [
  {
    workspaceId: "product",
    title: { ko: "핸드오프 → 완성도 점검", en: "Handoff → completeness check" },
    slug: "handoff-conform",
    steps: [
      {
        engine: "process",
        action: "handoff",
        title: { ko: "핸드오프 노트", en: "Handoff notes" },
        registryId: "product/handoff",
      },
      {
        engine: "review",
        action: "conform",
        title: { ko: "PRD 완성도 점검", en: "PRD completeness check" },
        registryId: "product/prd-completeness",
      },
    ],
  },
];

const FINANCE_WORKFLOW_PRESETS: LocalizedPreset[] = [
  {
    workspaceId: "finance",
    title: { ko: "영수증 접수 → 계정 분류", en: "Receipt intake → account classify" },
    slug: "capture-classify",
    steps: [
      {
        engine: "lookup",
        action: "capture",
        title: { ko: "영수증 폴더 접수", en: "Receipt folder intake" },
        registryId: "finance/receipt",
      },
      {
        engine: "process",
        action: "classify",
        title: { ko: "계정과목 분류", en: "Chart-of-accounts classify" },
        registryId: "finance/chart-of-accounts",
      },
    ],
  },
];

const ENGINEERING_WORKFLOW_PRESETS: LocalizedPreset[] = [
  {
    workspaceId: "engineering",
    title: { ko: "이슈 트리아지 → 리뷰", en: "Issue triage → review" },
    slug: "triage-review",
    steps: [
      {
        engine: "process",
        action: "triage",
        title: { ko: "트리아지 노트", en: "Triage notes" },
        registryId: "engineering/triage-note",
      },
      {
        engine: "review",
        action: "review",
        title: { ko: "Nest 컨벤션 점검", en: "Nest conventions review" },
        registryId: "engineering/nestjs-conventions",
      },
    ],
  },
];

const DESIGN_WORKFLOW_PRESETS: LocalizedPreset[] = [
  {
    workspaceId: "design",
    title: { ko: "토큰 → 접근성", en: "Tokens → accessibility" },
    slug: "tokens-access",
    steps: [
      {
        engine: "review",
        action: "tokens",
        title: { ko: "디자인 토큰 점검", en: "Design tokens check" },
        registryId: "design/tokens",
      },
      {
        engine: "review",
        action: "access",
        title: { ko: "접근성 체크", en: "Accessibility check" },
        registryId: "design/access-check",
      },
    ],
  },
];

const LEGAL_WORKFLOW_PRESETS: LocalizedPreset[] = [
  {
    workspaceId: "legal",
    title: { ko: "조항 → 계약 검토", en: "Clause → contract review" },
    slug: "clause-contract",
    steps: [
      {
        engine: "process",
        action: "clause",
        title: { ko: "조항 초안", en: "Clause draft" },
        registryId: "legal/clause",
      },
      {
        engine: "review",
        action: "contract",
        title: { ko: "계약 검토", en: "Contract review" },
        registryId: "legal/contract-review",
        notes: {
          ko: "초안이나 상대 초안을 붙여 위험을 점검합니다.",
          en: "Paste your draft or theirs to check risks.",
        },
      },
    ],
  },
];

const SALES_WORKFLOW_PRESETS: LocalizedPreset[] = [
  {
    workspaceId: "sales",
    title: { ko: "디스커버리 → 자격 확인", en: "Discovery → qualify" },
    slug: "discovery-qualify",
    steps: [
      {
        engine: "process",
        action: "discovery",
        title: { ko: "디스커버리 노트", en: "Discovery notes" },
        registryId: "sales/discovery",
      },
      {
        engine: "review",
        action: "qualify",
        title: { ko: "리드 자격 확인", en: "Lead qualify" },
        registryId: "sales/lead-qualify",
      },
    ],
  },
];

const MARKETING_WORKFLOW_PRESETS: LocalizedPreset[] = [
  {
    workspaceId: "marketing",
    title: { ko: "카피 → 덱 아웃라인", en: "Copy → deck outline" },
    slug: "copy-deck",
    steps: [
      {
        engine: "process",
        action: "copy",
        title: { ko: "채널 카피", en: "Channel copy" },
        registryId: "marketing/channel-copy",
      },
      {
        engine: "process",
        action: "deck",
        title: { ko: "슬라이드 아웃라인", en: "Slide outline" },
        registryId: "marketing/deck-outline",
        notes: {
          ko: "지금은 마크다운 아웃라인입니다. 이후 PPT 생성으로 확장할 자리입니다.",
          en: "Markdown outline for now; room to expand into PPT generation later.",
        },
      },
    ],
  },
];

const DEFAULT_RECRUITING_STEPS: LocalizedStep[] = [
  {
    engine: "process",
    action: "jd",
    title: { ko: "JD 생성", en: "Draft JD" },
    registryId: "recruiting/jd",
  },
  {
    engine: "process",
    action: "rubric",
    title: { ko: "평가 루브릭", en: "Scoring rubric" },
  },
  {
    engine: "lookup",
    action: "intake",
    title: { ko: "대량 접수", en: "Batch intake" },
    registryId: "recruiting/resume",
  },
  {
    engine: "process",
    action: "assess",
    title: { ko: "기준별 채점", en: "Score against rubric" },
    registryId: "recruiting/candidate-6axis",
  },
  {
    engine: "review",
    action: "verify",
    title: { ko: "위조 여부 조회", en: "Forgery check" },
    registryId: "recruiting/degree-certificate.in",
  },
  {
    engine: "process",
    action: "email",
    title: { ko: "합격·탈락 메일", en: "Pass / reject email" },
    registryId: "recruiting/decision-email",
  },
  {
    engine: "process",
    action: "publish",
    title: { ko: "리포트 발행", en: "Publish report" },
    registryId: "recruiting/candidate-report",
  },
];

export function defaultRecruitingWorkflowDraft(
  workspaceId = "recruiting",
  locale?: string,
): SaveWorkflowRequest {
  const lang = normalizeLocale(locale);
  return localizePreset(
    {
      workspaceId,
      title: { ko: "채용 기본 워크플로우", en: "Default hiring workflow" },
      slug: "default-hiring",
      steps: DEFAULT_RECRUITING_STEPS,
    },
    lang,
  );
}

const PRESETS_BY_WORKSPACE: Record<string, LocalizedPreset[]> = {
  general: GENERAL_WORKFLOW_PRESETS,
  recruiting: RECRUITING_WORKFLOW_PRESETS,
  product: PRODUCT_WORKFLOW_PRESETS,
  finance: FINANCE_WORKFLOW_PRESETS,
  engineering: ENGINEERING_WORKFLOW_PRESETS,
  design: DESIGN_WORKFLOW_PRESETS,
  legal: LEGAL_WORKFLOW_PRESETS,
  sales: SALES_WORKFLOW_PRESETS,
  marketing: MARKETING_WORKFLOW_PRESETS,
};

export function listWorkflowPresets(
  workspaceId = "general",
  locale?: string,
): SaveWorkflowRequest[] {
  const lang = normalizeLocale(locale);
  const source = PRESETS_BY_WORKSPACE[workspaceId] ?? [];
  return source.map((preset) => localizePreset(preset, lang));
}

export function saveWorkflow(input: SaveWorkflowRequest): { workflow: WorkflowDefinition; path: string } {
  if (!/^[a-z]+$/.test(input.workspaceId)) {
    throw new Error(`invalid workspace id: ${input.workspaceId}`);
  }
  if (!input.title.trim()) throw new Error("workflow title is required");
  if (!input.steps.length) throw new Error("workflow needs at least one step");

  const suffix = slugifyRubricSuffix(input.slug?.trim() || input.title);
  const id = `${input.workspaceId}/${suffix}`;
  const steps: WorkflowStep[] = input.steps.map((step, index) => ({
    id: `step-${index + 1}`,
    engine: step.engine,
    action: step.action.trim(),
    title: step.title.trim(),
    ...(step.registryId?.trim() ? { registryId: step.registryId.trim() } : {}),
    ...(step.notes?.trim() ? { notes: step.notes.trim() } : {}),
  }));

  // A schedule this machine cannot keep is refused at the point of saving. The
  // alternative is a flow that says "every weekday at nine" and never runs,
  // which the person only finds out by waiting a day.
  const schedule = validateTrigger(input.trigger);
  if (!schedule.ok) throw new Error(schedule.reason);

  const workflow: WorkflowDefinition = {
    id,
    version: 1,
    title: input.title.trim(),
    ...(input.description?.trim() ? { description: input.description.trim() } : {}),
    ...(input.instructions?.trim() ? { instructions: input.instructions.trim() } : {}),
    workspaceId: input.workspaceId,
    steps,
    ...(input.trigger && input.trigger.type !== "manual"
      ? { trigger: input.trigger }
      : {}),
    updatedAt: nowIso(),
  };
  const path = saveUserWorkflow(workflow);
  return { workflow, path };
}

export function listWorkflows(workspaceId?: string): WorkflowDefinition[] {
  const all = listUserWorkflows();
  return workspaceId ? all.filter((workflow) => workflow.workspaceId === workspaceId) : all;
}

export function getWorkflow(id: string): WorkflowDefinition | null {
  return loadUserWorkflow(id);
}
