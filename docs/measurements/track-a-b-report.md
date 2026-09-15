# Track A + Track B results

Date: 2026-08-06  
Artifacts: `track-a-cache-prompt.json`, `track-b-schema.json`

## Track A — cache_prompt field-fill (text, Qwen3-4B Q4_K_M)

**Spawn:** `llama-server -m Qwen3-4B-Q4_K_M.gguf -ngl 99 -c 8192 --parallel 1 --slot-save-path … --reasoning off`

### A-1 HTTP `/completion` (cache_prompt:true, grammar, stream, n_probs)

| step | field | prompt_n | tokens_cached | prompt_ms |
|---|---|---|---|---|
| 1 | name | 173 | 0 | 211.5 |
| 2 | email | 7 | 172 | 83.8 |
| 3 | skills | 10 | 178 | 149.4 |
| 4 | experience | 10 | 187 | 45.8 |
| 5 | phone | 4 | 203 | 123.1 |

- First `prompt_ms` = **211.5**
- Max later `prompt_ms` = **149.4**
- Ratio = **0.706** (> 0.20)

**Decision: NLC 유지 확정**  
(토큰 캐시 히트는 있음 — `tokens_cached` 172→203 — 하지만 규칙 기준인 prompt_ms 20% 이하는 미충족)

### A-2 bleed abort

- SSE mid-abort on skills → truncated `TypeScript`
- Continue with partial in prompt: `tokens_cached=187`, `prompt_ms=25` (캐시 히트 유지)
- `/health` ok after abort; slot stuck **not observed** (기록만)

### A-3 NLC wall-clock

- NLC `generateFieldFill` wall = **29401 ms** (5 fields, CUDA)
- HTTP sum of prompt_ms only ≈ 614 ms (decode 제외; 공정 비교 아님 — 참고)

마이그레이션 코드 없음. NLC 경로 미수정.

---

## Track B — schema conditional redesign (vision Qwen3.5-4B @ 1024)

### B-1 pageType labels (**Opus 라벨, 사람 미검수**)

| page | pageType |
|---|---|
| p-chat-1 | landing |
| p-chat-2 | landing |
| p-chat-3 | landing |
| p-pdf-1 | other |
| p-pdf-2 | other |
| p-pdf-3 | other |
| p-daylog-1 | other |

### B-2 matrix (a=defined / b=always 0\|null / c=do not ask)

| pageType | caseStudyCount | hasProcessDocumentation | layoutTypes | toolEvidence | screenCount |
|---|---|---|---|---|---|
| landing | **c** | a | a | **c** | a |
| caseStudy | a | a | a | a | a |
| index | b | b | a | c | a |
| contact | b | b | a | b | a |
| other | b | c | a | c | a |

**Required answers:**

1. **landing × caseStudyCount:** **묻지 말아야 함 (c).**  
   전용 case-study 섹션이 없으면 강제 정의 시 수치 정답은 **0** (null 아님). 다만 feature/testimonial/logo를 case study로 세면 정의가 모호해 512/1024에서 8↔0이 갈림 → 스키마에 두지 말 것.

2. **toolEvidence 불일치:** **OCR(페이지에 적힌 이름)과 추론(제품 능력)이 섞임** → 필드 정의 모호 (c).

**(c) 존재 → B-3/B-4 진행.**

### B-3/B-4 two-stage reextract (@1024, ngl 99, ×3)

Stage1 (pageType only) vs Opus labels:

| page | gt | preds×3 | stable? |
|---|---|---|---|
| p-chat-1 | landing | caseStudy×3 | yes (wrong) |
| p-chat-2 | landing | landing / caseStudy / landing | **no** |
| p-chat-3 | landing | caseStudy×3 | yes (wrong) |
| p-pdf-* | other | caseStudy×3 | yes (wrong) |
| p-daylog-1 | other | landing×3 | yes (wrong) |

- Stage1 accuracy ≈ **9.5%**
- **p-chat-2 반복 간 흔들림** → 규칙 적용:

**최종: 2단 실패, 단일 스키마 유지**

제품 코드 미반영. 권고만.

---

## Combined verdicts

| Track | Result |
|---|---|
| A | **NLC 유지 확정** (cache 토큰은 되나 prompt_ms 미달) |
| B | **단일 스키마 유지** (2단 pageType 분류 실패/불안정) |
