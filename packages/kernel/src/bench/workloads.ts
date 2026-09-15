import type { BenchPromptVariant, BenchWorkloadId } from "./types.js";

/** Short resume-like document for workload (a) and (d). */
export const SHORT_RESUME = `이름: 김민수
이메일: minsu.kim@example.com
전화: 010-1234-5678
경력: 48개월
기술: TypeScript, Node.js, PostgreSQL
`;

/** Longer synthetic document for workload (b). */
export const LONG_RESUME = `${SHORT_RESUME}

요약
시니어 백엔드 엔지니어. B2B SaaS에서 API와 데이터 파이프라인을 설계·운영.
채용 공고·이력서 처리 자동화, 관측 가능성, 온디바이스 추론 연동 경험.

경력
2022-01 ~ 현재 | Redrob | Backend Engineer
- Electron 데스크톱과 로컬 GGUF 추론 연동
- 추출/비교 파이프라인과 신뢰도 기반 리뷰 큐
- SQLite 로컬 스토어와 감사 로그

2019-03 ~ 2021-12 | Example Corp | Software Engineer
- REST API, 배치 작업, 모니터링 대시보드
- PostgreSQL 스키마 설계와 마이그레이션

학력
OO대학교 컴퓨터공학 학사

기타
영어 업무 가능. 원격/서울 하이브리드 선호.
${"세부 프로젝트 설명. ".repeat(80)}
`;

export const PROSE_JD_PROMPT = [
  'Respond with a single JSON object only: {"markdown":"<job posting>"}.',
  "The markdown value must use: # role / ## 주요 업무 / ## 자격 요건.",
  "Use only the facts below. Do not invent requirements.",
  "",
  "직무명: Backend Engineer",
  "주요 업무:\n- API 설계\n- 온디바이스 추론 연동",
  "자격 요건:\n- TypeScript\n- Node.js",
].join("\n");

export const JD_GRAMMAR = [
  'root ::= ws "{" ws "\\"markdown\\"" ws ":" ws string ws "}" ws',
  "ws ::= [ \\t\\n\\r]*",
  'string ::= "\\"" char* "\\""',
  'char ::= [^"\\\\] | "\\\\" (["\\\\/bfnrt] | "u" hex hex hex hex)',
  "hex ::= [0-9a-fA-F]",
].join("\n");

/** Gold labels for workload (d) — keys are JSON pointer paths without leading slash duplicated. */
export const EXTRACT_GOLD: Record<string, unknown> = {
  "/name": "김민수",
  "/email": "minsu.kim@example.com",
  "/phone": "010-1234-5678",
  "/totalExperienceMonths": 48,
  "/skills": "TypeScript, Node.js, PostgreSQL",
};

export const EXTRACT_SCHEMA_FIELDS = [
  { path: "/name", type: "string" as const, required: true, description: "Candidate full name" },
  { path: "/email", type: "string" as const, required: false, description: "Email address" },
  { path: "/phone", type: "string" as const, required: false, description: "Phone number" },
  {
    path: "/totalExperienceMonths",
    type: "integer" as const,
    required: false,
    description: "Total years/months of experience as integer months",
  },
  { path: "/skills", type: "string" as const, required: false, description: "Comma-separated skills" },
];

export function extractPrompt(
  document: string,
  variant: BenchPromptVariant,
): string {
  if (variant === "gbnf_only") {
    return `Extract the requested JSON fields from this source. Do not invent values.\n\n${document}`;
  }
  const fieldLines = EXTRACT_SCHEMA_FIELDS.map(
    (field) =>
      `- ${field.path} (${field.type}${field.required ? ", required" : ""}): ${field.description}`,
  ).join("\n");
  return [
    "Extract JSON fields from the source. Do not invent values. Use 없음 if unknown.",
    "Fields:",
    fieldLines,
    "",
    "Source:",
    document,
  ].join("\n");
}

export function workloadDocument(id: BenchWorkloadId): string {
  if (id === "b_long_extract") return LONG_RESUME;
  return SHORT_RESUME;
}
