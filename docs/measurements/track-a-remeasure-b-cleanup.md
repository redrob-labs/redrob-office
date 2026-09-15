# Track A remasure + Track B field cleanup

Date: 2026-08-06  
Artifacts: `track-a-cache-remeasure.json`, `track-b-field-cleanup.json`, `resumes-track-a/`

## A — cache_prompt remasure (판정 규칙 수정)

이전 20% prompt_ms 규칙 **무효**. 문서 3건(공개 게시 이력서, Qwen3-4B tokenize):

| id | source | tokens |
|---|---|---|
| doc-01 | Chris Snedaker resume (prefix → ~3.2k) | **3347** |
| doc-02 | Jake Gutierrez resume.tex | **2284** |
| doc-03 | Maximilian Nebl resume.ms | **1780** (2k 하한 약간 미달; 노이즈 구간은 아님) |

로컬 2–4K 이력서 부재 → 저자 공개 GitHub 이력서 사용 (합성/fixtures 아님).

### A-1 tokens_cached 추이 (HTTP, cache_prompt:true)

**doc-01**

| step | field | prompt_n | tokens_cached | prompt_ms | wall_ms |
|---|---|---|---|---|---|
| 1 | name | 3459 | 0 | 2246 | 2371 |
| 2 | email | 8 | 3458 | 55 | 163 |
| 3 | skills | 8 | 3465 | 63 | 1235 |
| 4 | experience | 42 | 3472 | 72 | 217 |
| 5 | phone | 4 | 3518 | 53 | 368 |

**doc-02**

| step | field | prompt_n | tokens_cached | prompt_ms | wall_ms |
|---|---|---|---|---|---|
| 1 | name | 2259 | 95 | 1585 | 1859 |
| 2 | email | 6 | 2353 | 46 | 535 |
| 3 | skills | 5 | 2379 | 50 | 1986 |
| 4 | experience | 4 | 2447 | 49 | 1930 |
| 5 | phone | 4 | 2514 | 47 | 783 |

**doc-03**

| step | field | prompt_n | tokens_cached | prompt_ms | wall_ms |
|---|---|---|---|---|---|
| 1 | name | 1797 | 95 | 1259 | 1527 |
| 2 | email | 9 | 1891 | 36 | 147 |
| 3 | skills | 4 | 1904 | 41 | 154 |
| 4 | experience | 4 | 1912 | 45 | 141 |
| 5 | phone | 4 | 1919 | 46 | 219 |

프리픽스 재사용 확인: 2번째 이후 `tokens_cached` ≈ 문서 토큰, `prompt_n` 급감.

### A-2 wall-clock (HTTP 전구간 vs NLC)

| doc | HTTP wall (ms) | NLC wall (ms) | HTTP/NLC | ≤1.3? |
|---|---|---|---|---|
| doc-01 | 4356 | 12286 | **0.35** | yes |
| doc-02 | 7094 | 11858 | **0.60** | yes |
| doc-03 | 2189 | 9778 | **0.22** | yes |

**Decision: 마이그레이션 성능상 가능**  
(마이그레이션 코드 없음. NLC 경로 미수정. 품질/bleed는 별 이슈 — 성능 판정만.)

---

## B — 문제 필드 정리 (2단 실패 확정, 단일 스키마 유지)

### B-1 caseStudyCount

한 문장 정의 (가능):

> A case study is a titled, self-contained project narrative on the page that names a specific customer/context and outcome — not a feature bullet, testimonial quote, logo, or generic benefit claim.

| 안 | 요지 | 판정 |
|---|---|---|
| 제거 | 모호성 소멸, 신호 상실 | 정의가 쓰이므로 **유일한 답은 아님** |
| landing만 0 고정 | 정답 0과 맞음 | **기각** — pageType 의존, 2단 실패와 충돌 |
| 정의 재작성 | 단일 스키마 유지 | **다음 후보** — 재측정 자기일치 실패 시 제거 |

권고: `redefine_then_remeasure_else_remove` (제품 반영 금지)

### B-2 toolEvidence → toolsNamed

분리안: `toolsNamed` = 페이지에 문자로 적힌 이름만. 추론 필드는 **제거**(별도 필드 없음).

7장 ×3 @1024, -ngl 99:

| 필드 | 자기일치율 (페이지 단위 3회 동일) |
|---|---|
| baseline `toolEvidence` | **71%** (5/7) |
| split `toolsNamed` | **86%** (6/7) |
| Δ | **+14pp** |

관찰: p-pdf-1에서 baseline은 `[]`, split은 `fasttext/Sarvam/Llama 3.2 3B` (OCR 실명) — 정의 분리가 동작. p-pdf-3 saju 용어를 tool로 넣던 baseline 혼선이 split에서 `[]`로 정리. 제품 코드 미반영.

### B-3 pageType `other` 재검토 (**Opus 서술, 사람 미검수**)

| page | 실제 | 별도 pageType? |
|---|---|---|
| p-pdf-1 | LLM Architecture Brief (내부 기술 브리프) | 아니오 — internalDoc 묶음 후보 |
| p-pdf-2 | Studio KPI/benchmark 우선순위 문서 | 아니오 — 같은 brief 묶음 |
| p-pdf-3 | 사주 리딩 결과 UI | maybe report — 지금은 other |
| p-daylog-1 | Desk 앱 UI 스크린샷(+whisper 오류) | maybe appUi — 지금은 other |

**권고:** other 4/7은 샘플 구성 문제(랜딩3+문서/앱4). Desk 실입력 분포 없이 라벨 체계 확장 금지. 스키마 반영 없음.

---

## Combined

| Track | Result |
|---|---|
| A | **마이그레이션 성능상 가능** (HTTP ≤0.60× NLC, cache hit 확인) |
| B | 단일 스키마 유지. caseStudyCount→정의 재작성 후보. toolEvidence→toolsNamed 자기일치↑. other 라벨 확장 보류. |
