# Verify notes — Qwen3.5 product cutover (historical measurements kept)

**Product decision (2026-08-05):** local text unified on **Qwen3.5** (`qwen35-0.8b/2b/4b-q4`). Qwen3 text and separate Qwen3-VL packs are removed from `MODEL_ARTIFACTS` / `TIERS`. Remaining sections below are **historical verify evidence** (accuracy/speed tradeoffs that informed the earlier exclusion) — not a veto on the cutover.

## 1-field smoke wall (template byte-matched, CPU, same prompt/output)

| Model | wall | output |
|-------|------|--------|
| Qwen3.5-2B-Q4_K_M | **29.4 s** | `김민수` |
| Qwen3-1.7B-Q4_K_M | **16.8 s** | `김민수` |

- Params: 2B vs 1.7B (~+18%)
- Wall ratio: ~1.75× slower on 3.5 for identical 1-field extract
- Treat as Qwen3.5 inherent CPU penalty (not the space-pad / template bugs)

Recorded 2026-08-05 from `scripts/field-fill-smoke.mjs`.

## CPU vs CUDA output wobble (not a blocker)

Spot: Qwen3.5-2B, fixture 02, temp=0.

| backend | /phone |
|---------|--------|
| cuda | `+1-555-0102` |
| cpu | `1-555-0102` |

1 character / sign difference on **1 of 45** fields across the GPU accuracy set scale.
Treated as FP accumulation tie-break across backends, not a correctness blocker.
Record only — do not gate [3] on this.

## utilityProcess quiet un-isolation (issue, do not fix now)

`%AppData%/Roaming/@redrob/desk/logs/desk.log`:

- `[inference] utilityProcess exited code=0; falling back in-process` — **1 hit**
- Not a crash: exit code 0 then silent in-process fallback.
- Something is cleanly ending the utilityProcess; isolation drops without a loud failure.
- Leave as an issue. Same class of risk as CUDA fork/`execArgv` mis-attribution (quiet fallback hides isolation loss).

## extract rebuilds (report only — do not fix here)

Cause in logs: `grammar_fail: value missing terminating newline` → `session.rebuild()` (full re-prefill).
Assess had 0 rebuilds; extract string fields can burn token budget without emitting `\n`.

**Qwen3-1.7B CUDA** (6 rebuilds):

| fixture | field | err |
|---------|-------|-----|
| 01 | /phone | missing terminating newline |
| 02 | /email | missing terminating newline |
| 04 | /totalExperienceMonths | missing terminating newline |
| 05 | /email | missing terminating newline |
| 08 | /totalExperienceMonths | missing terminating newline |
| 09 | /email | missing terminating newline |

**Qwen3.5-2B CUDA** (3 rebuilds):

| fixture | field | err |
|---------|-------|-----|
| 01 | /email | missing terminating newline |
| 02 | /email | missing terminating newline |
| 05 | /email | missing terminating newline |

Note: grammar_fail log line always prints `tokens=0` (catch path); does not mean zero tokens were generated.

## Absent sentinel sweep (fixtures 04,06,07,08,09 — gold /totalExperienceMonths all null)

CUDA, temp=0, sentinel-only change via `REDROB_ABSENT_TOKEN`.

### /totalExperienceMonths hallucination count (of 5)

| model | 없음 | N/A | - |
|-------|-----:|----:|--:|
| Qwen3-1.7B | 1 (09→0) | 1 (04→120) | 2 (04→120, 08→1234567890) |
| Qwen3.5-2B | **5** (all→0) | **5** (all→0) | **5** (all→0) |

3.5: (b)/(c) did not clear halls — still emits integer `0` every time.
1.7B: already mostly ok on 없음; N/A/- did not systematically improve.

Recorded from `/tmp/absent-sentinel-sweep.txt` 2026-08-05.

## Tokens-per-char (verify tokenizers, 2026-08-05)

Script: `packages/kernel/scripts/measure-tok-per-char.mjs` (Choice A: IN22-oriented scripts).

| script | 1.7B coeff | 3.5 coeff |
|--------|----------:|----------:|
| ASCII | 1 | 1 |
| Hangul | 2 | **3** |
| Devanagari | 2 | 2 |
| Bengali | 2 | 2 |
| Gurmukhi | 2 | 2 |
| Gujarati | 2 | 2 |
| Odia | **3** | 2 |
| Tamil | 2 | 2 |
| Telugu | 2 | 2 |
| Kannada | 2 | 2 |
| Malayalam | 2 | 2 |
| Sinhala | 2 | 2 |
| Arabic | 2 | 2 |
| Meitei Mayek | 3 | 3 |
| Ol Chiki | 2 | 3 |

**WORST_TOKENS_PER_CHAR = 3** (Choice A measured ceil).
Invariant: `budget >= maxChars * 3 + 2` (nl slack); integers: `budget >= maxDigits + 2`.

String defaults: email/phone maxChars 24; name 48; skills 64 (budget raised, not chars cut).
Integer `/totalExperienceMonths`: maxDigits 4.
Absent sentinel fixed to `"N/A"`; grammar `absent nl | value nl`.

### Hangul fertility regression (record only — model-selection axis)

Qwen3.5 vocabulary is ~63% larger than Qwen3, yet Hangul worst-case fertility is **3 vs 2** on 1.7B.
Indic scripts are tied at ≤3; **Korean alone regresses**. Korean documents cost ~1.5× tokens on 3.5 vs 1.7B for the same characters — include in model-choice judgment (not a code change).

## GPU wall after bound/sentinel fixes (record)

After token-based char bound + integer digit bound + `N/A` sentinel (full extract 01–09 CUDA):

| model | wall before (pad era) | wall after | note |
|-------|----------------------:|-----------:|------|
| Qwen3-1.7B | ~273 s | ~121 s | ~½ — prior parity was 1.7B wasting tokens to budget |
| Qwen3.5-2B | ~277 s | ~255 s | little change |

## Qwen3.5 `/totalExperienceMonths` absent (systematic)

On absent-gold fixtures, Qwen3.5 still emits `0` (5/5 on 2B; **5/5 again on 4B** — `0` or `0000`). **Systemic failure across 2B→4B.**
If 3.5 is adopted, a **presence gate on that integer field is a required condition**.
Do **not** implement now — conditional checklist item only.

Qwen3-4B: `/totalExperienceMonths` ok=9, hall=0 (absent cleared via `N/A`).

## 4B tier check (CUDA, fixtures 01–09, temp=0, sentinel N/A)

Solo process per model (no concurrent load). Same columns as 2B post-bound table.
`first_pass_ok` = totals `ok` when rebuilds=0 (no retry path exercised).

| model | first_pass_ok | vw | miss | hall | rebuild | grammar_fail | wall_ms |
|-------|-------------:|---:|-----:|-----:|--------:|-------------:|--------:|
| Qwen3-1.7B-Q4_K_M | 28 | 12 | 0 | 5 | 0 | 0 | ~121k |
| Qwen3.5-2B-Q4_K_M | 29 | 9 | 1 | 6 | 0 | 0 | ~255k |
| Qwen3-4B-Q4_K_M | **34** | 9 | 0 | 2 | 0 | 0 | 242451 |
| Qwen3.5-4B-Q4_K_M | 28 | 9 | 1 | 7 | 0 | 0 | 258351 |

Paths: `…/Qwen/Qwen3-4B-GGUF/Qwen3-4B-Q4_K_M.gguf`; verify `…/verify/Qwen3.5-4B-Q4_K_M.gguf`.
Logs: `/tmp/check-extract-qwen3-4b-cuda.txt`, `/tmp/check-extract-qwen35-4b-cuda.txt`.

Evidence for judgment (not a product change): Qwen3 **4B lifts** first_pass vs 1.7B (28→34); Qwen3.5 **4B does not** lift vs 2B (29→28) and keeps months halls. Scale helps the Qwen3 line; 3.5 accuracy/months look design-lineage, not undersized params.

## Post-grammar-fix extract (CUDA, 01–09, 2026-08-05) — **INVALID** (phone GBNF)

Solo process each. Phone GBNF used illegal `\-` escape → `Failed to parse grammar` at fill-time.
Superseded after phone fix + boot compile assert.

| model | ok | vw | miss | hall | rebuild | grammar_fail | wall_ms |
|-------|---:|---:|-----:|-----:|--------:|-------------:|--------:|
| Qwen3-1.7B-Q4_K_M | 26 | 2 | 10 | 7 | 15 | 6 | 84021 |
| Qwen3-4B-Q4_K_M | 22 | 5 | 10 | 8 | 14 | 5 | 113192 |

### Counter relationship (why phone×9 ≠ gfail 6/5)

Two fill failure paths in `FieldFillSession.fill` catch:

| log `kind` | trigger | rebuild++? | scored as |
|------------|---------|------------|-----------|
| `grammar_fail` | decode ran; validation failed (e.g. email missing `\n`) | yes | usually **miss** (absent pred vs gold value) |
| `error` | e.g. `Failed to parse grammar` (phone `\-`) | yes | **miss** (absent) — **not** counted in grammar_fail greps |

**One line:** `rebuild` = every failed fill (both kinds); `grammar_fail` = decode-time validation only; phone parse failures were `error` → miss/rebuild without gfail. gfail 6 ≈ email newline fails; phone 9 ≈ `error` path.

### Phone GBNF fix (2026-08-05)

llama.cpp `parse_char` allows `\\ \" \[ \] \n \r \t \x \u \U` only — **not** `\-`. Literal hyphen at end of class: `phonechar ::= [0-9+() -]`. Boot: `assertSchemaFieldsGrammarsCompile` on all registry schemas (check-extract + desk preload + session `precompileAll`).

## Tier assignment (product 2026-08-05)

- **Local text = Qwen3.5** via `textModelIdFor`: T4 GPU → 2B, T8/T16 GPU → 4B; CPU steps one size down (0.8B / 2B).
- Qwen3 text + separate Qwen3-VL packs removed from product artifacts.
- Historical rows below kept the earlier Qwen3.5 exclusion rationale (months halls / first_pass). That exclusion is **superseded** by the unify cutover.

## Grammar policy (post tier)

- GBNF keeps only: absent sentinel, `[0-9]{1,N}`, score enum, boolean/date/lineRefs, free `char{1,N}`.
- **No** email/phone/list structural grammars — termination via JS stop triggers + bleed_trimmed accept.
- Shared authoring shape: `SlotFieldSpec` `{ id, label, type, maxChars, required, streamTarget }` in `packages/kernel/src/slot-field-spec.ts`; extract / assess / draftJd / draftFromTemplate all compile through it.

Phone compiles (`PHONE_COMPILE_OK`, `SCHEMA_GRAMMAR_ASSERT_OK`). Both models still **rebuilds=6 / grammar_fail=6** → **do not use for tier assignment**.

| model | ok | vw | miss | hall | rebuild | gfail | wall_ms |
|-------|---:|---:|-----:|-----:|--------:|------:|--------:|
| Qwen3-1.7B | 31 | 4 | 5 | 5 | **6** | **6** | 76468 |
| Qwen3-4B | 34 | 2 | 5 | 4 | **6** | **6** | 114433 |

**Cause (blocks tier table):** almost all gfail = `/email` `grammar_fail: value missing terminating newline` with `last16` often `…comphone` (email body then next label `phone` without `\n`). Phone fields themselves mostly ok after escape fix. One 4B `/skills` Chinese runaway also gfail.

Logs: `/tmp/check-extract-qwen3-*-cuda-phonefix.txt`

## Qwen3-4B value_wrong ×9 (CUDA extract — **prior** run, report only)

Source: `/tmp/check-extract-qwen3-4b-cuda.txt` field-detail. Classification is judgment aid only.

| # | fixture | field | gold | pred | class |
|---|---------|-------|------|------|-------|
| 1 | 01 | /email | `seoyeon.park@example.com` | `seoyeon.park@example.c` | **real wrong** — truncated (missing `om`) |
| 2 | 01 | /phone | `010-5555-1212` | `010-5555-1212totalExper` | **bleed** — gold as prefix + field-name garbage |
| 3 | 02 | /phone | `+1-555-0102` | `36totalExperienceMonths` | **real wrong** — wrong value (looks like months bleed into phone) |
| 4 | 02 | /skills | `Go, Kubernetes, gRPC` | `Go, Kubernetes, gRPCskills:  Go, Kubernetes, gRPC` | **bleed** — correct skills + label/repeat |
| 5 | 04 | /email | `mina.cho@example.com` | `mina.cho@example.com电话:` | **bleed** — correct email + CJK label garbage |
| 6 | 04 | /phone | `010-2222-3333` | `010-2222-3333totalExper` | **bleed** — gold prefix + garbage |
| 7 | 05 | /phone | `010-7777-8888` | `010-7777-8888totalExper` | **bleed** — gold prefix + garbage |
| 8 | 08 | /phone | `+1-555-0199` | `+1-555-0199totalExpense` | **bleed** — gold prefix + garbage |
| 9 | 09 | /skills | `TypeScript, NestJS, PostgreSQL` | `NestJS,PostgreSQL` | **real wrong** — missing `TypeScript`; remaining also separator/space differ |

Tally: **bleed 6 / real wrong 3 / pure notation (order·case·ws only) 0**.
If gold compare were prefix-stripped or “cut at next label”, most phone/email vw would flip to ok — **user decides whether to normalize; do not code it here.**

## Local Qwen3.5 cutover implications (supersedes prior exclusion)

Earlier verify excluded Qwen3.5 on accuracy (months→0; 2B→4B no lift). Product cutover still ships Qwen3.5 as the only local text family:

1. Single-family text stack: `qwen35-0.8b/2b/4b-q4` (unsloth GGUF).
2. Separate Qwen3-VL pack removed; image jobs stay refused until mmproj path is wired on the same 3.5 GGUF.
3. Embed/rerank remain Qwen3 artifacts until a 3.5 embedding stack exists.
3. **(c) Re-open alt text candidates** — Gemma 4 / Granite 4.1 / Phi-4-mini back on the shortlist for CPU/tier experiments.

Do **not** download or wire any of these now.

## [3] CPU — Qwen3-1.7B vs Qwen3-4B (tier assignment; Qwen3.5 out)

Purpose: is **8GB→1.7B / 16GB→4B** realistic on CPU? Separate from GPU accuracy tables.

### llama-bench baseline (CPU, -ngl 0, -t 8 = phys 10−2) — 2026-08-05

Isolated re-runs (prefer for stack-loss vs ~0.7 tok/s field-fill):

| model | pp512 t/s | tg128 t/s | vs ~0.7 tok/s |
|-------|----------:|----------:|--------------:|
| Qwen3-1.7B-Q4_K_M | 35.52 | **8.71** | **~12.4×** |
| Qwen3-4B-Q4_K_M | 19.33 | **6.74** | **~9.6×** |

Suite-embedded bench (same flags; may be contended — 4B tg noisy):

| model | pp512 t/s | tg128 t/s |
|-------|----------:|----------:|
| Qwen3-1.7B | 46.20 ± 7.30 | 12.39 ± 0.31 |
| Qwen3-4B | 22.08 ± 2.02 | 4.52 ± 2.14 |

Both isolated tg ≥ 5 → loss is **in our stack**, not raw llama.cpp CPU decode.

### [3] suite walls (CPU only — **INVALID**; pre-noprob)

| model | smoke wallMs | assess wallMs | scores | rebuilds |
|-------|-------------:|--------------:|-------:|---------:|
| Qwen3-1.7B-Q4_K_M | 25810 | 245412 | 6 | 0 |
| Qwen3-4B-Q4_K_M | 50538 | 626512 | 6 | 0 |

**Do not use for tier assignment.** Superseded by post-normalize table below.

### [3b] CPU tier remeasure — noprob + grammar cache (2026-08-05)

| model | smoke wallMs | assess wallMs | score ms | quote ms/tok | tok/s | vs tg | cache hit/miss |
|-------|-------------:|--------------:|---------:|-------------:|------:|------:|----------------|
| Qwen3-1.7B-Q4_K_M | 6405 | **81834** | 727 | 390 | 2.57 | **0.29×** (8.71) | 14/4 |
| Qwen3-4B-Q4_K_M | 11676 | **209307** | 1526 | 653 | 1.53 | **0.23×** (6.74) | 12/6 |

Assess wall **4B / 1.7B = 2.56×**. Rebuilds 0 both. Still below goal (≥0.5× llama-bench tg).

### Step 6 (axis 3→1) judgment

| model | 1-tok score fixed cost | vs 1s threshold |
|-------|-----------------------:|-----------------|
| 1.7B | **~0.73s** | under → Step 6 **optional** |
| 4B | **~1.53s** | over → Step 6 still cuts axis overhead on CPU-4B |

Not implementing Step 6 until you decide. Remaining decode gap vs bench is larger than call-count overhead on 1.7B.

## field-fill CPU speed investigation

0. `field-fill-field` / session logs include `model=` (filename) + `backend=` (+ threads/batch).
1. Bench done — see table above. **Stack loss ~10–12× vs llama-bench tg.**

### 2. Threads — applied (not single-thread)

Code: `resolveExecutionPlan` CPU → `threads = physCores−2` (10→8), `batchSize=128`, `useMmap=true` → `getLlama({ maxThreads })` → `createContext({ threads, batchSize })`.

Runtime: `createContext … threads=8 batch=128 … mmap=1 backend=cpu`.

Live CPU (Windows `PercentProcessorTime`, **100% = one logical CPU**): decode samples **~760–795%** ≈ **8 cores** (not ~100%/1-thread). Earlier ΔcpuSec samples also peaked ~6.7 cores.

### 3. Memory — not the bottleneck

During decode: WS **~1.8–2.1 GB**; Available **~48 GB**; **mmap=1**; **Electron not running**. No swap thrashing. Variance is not explained by RAM pressure.

### 4. Grammar size — quote larger; fixed cost dominates score

Sample (3 cited lines → `quoteSubstringChoices`): **96 choices**, quote GBNF **3398** chars vs score enum GBNF **94** chars (~36×).

| run | quote ms/tok (10 tok) | score ms (1 tok) |
|-----|----------------------:|-----------------:|
| older `/tmp/cpu-1.7b-assess.txt` | ~1169 | ~2164 |
| fresh probe assess | ~443 | ~864 |

Score stays **~1–2s for 1 token** even with a 94-char grammar → fixed overhead ≫ grammar size. Quote still slower per token; large choice grammars add cost but are **not** the ~10–12× stack-loss alone.

### 5. Prefill / batchSize — batch=128; label via generate path

- Logged **batchSize=128** (not 1).
- `writeDeterministic` / `injectRaw` → `evaluateWithoutGeneratingNewTokens` (batch prefill).
- `fill()` label + decode → `evaluateWithMetadata(promptTokens, …)`.
- First axis `/A/lines` cold preamble still dominates the first call.

### 6. `probabilities: true` consumers (2026-08-05)

Who **reads** `item.probabilities` from `evaluateWithMetadata`:

| Site | Reads Map? | Purpose |
|------|------------|---------|
| `packages/kernel/src/inference/field-fill.ts` | fallback only | If `item.confidence` missing/`≤0`, take `probabilities.get(selectedToken)` → logprob → `confidenceFromLogprobs` (review gating) |
| `packages/kernel/src/bench/timed-generate.ts` | same fallback | Bench/GBNF timing helper only — not product path |
| `packages/kernel/scripts/cuda-smoke.mjs` / `scripts/cuda-smoke.mjs` | **no** | Iterates tokens; metadata `{ confidence: true }` only |
| Remote/cloud field-fill | **no** | Uses remote-provided token logprobs |

**Judgment:** full vocab distribution is **not** required. Confidence gating needs the **selected token’s** probability; `confidence: true` already supplies that. Fallback never justified O(vocab) work.

Qwen3 vocab ≈ **151,936** → matches 1-token fields at 5–9s wall scale.

**(a) change + measure** (CPU 1.7B, threads=8, batch=128; llama-bench tg=8.71):

| metric | before (old assess) | after (a) noprob | vs bench |
|--------|--------------------:|-----------------:|---------:|
| score 1-tok avg ms | ~2164 | **752** | 1.33 tok/s = **0.15×** |
| quote-10 ms/tok | ~1169 | **390** | 2.57 tok/s = **0.29×** |
| assess wallMs | ~245412 | **82082** | |
| smoke /name wallMs | ~25810 | **5738** | |

~**3×** wall win from dropping `probabilities: true`. Still **below** goal (≥0.5× llama-bench tg).

**(b) grammar cache** (on top of a; cache hits=14 misses=4 on assess):

| metric | (a) | (b) | Δ |
|--------|----:|----:|--:|
| score avg ms | 752 | **727** | −25 |
| quote-10 ms/tok | 390 | **390** | ~0 |
| assess wallMs | 82082 | **81834** | −248 |
| smoke wallMs | 5738 | 6405 | noise |

Grammar cache works (14 hits) but is **noise vs (a)**. Remaining gap is not createGrammar.

### 7. Record — vocab / Qwen3.5 wall gap (not accuracy)

`probabilities` cost scales with vocab. GPU extract walls 1.7B **121s** vs Qwen3.5 **255s** (~**2.1×**) may be inflated by this bug: Qwen3.5 vocab **248,320** ≈ **+63%** vs Qwen3. Historical note: the earlier accuracy-based exclusion is **superseded** by the 2026-08-05 product cutover to Qwen3.5.

### Still deferred / next

- Axis 3→1 merge: **SKIPPED** (user 2026-08-05) — CPU assess 1.7B 82s / 4B 209s meets product targets (2–3 min / 5–6 min). llama-bench ratio is **not** a gate.
- Decode optimization: **CLOSED**. No further stack tweaks.

### Unresolved (record only — do not implement now)

1. **Remaining 0.23–0.29× vs llama-bench tg** — likely per-token JS↔native boundary in `evaluateWithMetadata` async iteration (not grammar create; cache was noop). Candidate fix later: **llama-server / llama-cli sidecar** so decode stays in-process C++. Do not start now.
2. **llama-cli `--grammar` midpoint unmeasured** — no isolated baseline of constrained decode without the Node field-fill loop. Leave as open measurement item before blaming sidecar vs JS.

## GGML_ASSERT `bufs.size() == 1` (repro notes — do not fix)

`llama-model.cpp:1708: GGML_ASSERT(bufs.size() == 1) failed`

### Observed conditions (2026-08-05)

| # | Sequence | Sleep between | Result |
|---|----------|---------------|--------|
| A | Tokenizer measure loaded models sequentially in one Node process → then new `check-extract` for Qwen3-1.7B CUDA | short | **assert** |
| B | After A crash: **solo** cold `check-extract` Qwen3-1.7B CUDA (no prior extract in that shell) | n/a | **ok** |
| C | Full extract Qwen3-4B CUDA completed (exit clean) → new process `check-extract` Qwen3.5-4B CUDA | ~5 s | **assert** |
| D | Same as C: solo `check-extract` Qwen3.5-4B CUDA after idle | ≥60 s | **ok** (full run) |
| E | Same-model CUDA reload in one process (dispose → reload same GGUF) | 0 | _pending_ |
| F | LM + mmproj simultaneous CUDA load (both resident) | n/a | _pending_ |
| G | After assert: kill process, new process cold load | n/a | _pending_ (B suggests yes) |

**Not required for crash:** two GGUFs resident in the same process at once (A/C).
**Sufficient so far:** second CUDA LM load in a later OS process shortly after a prior node-llama-cpp CUDA load exited (~5 s → assert; ≥60 s idle → ok).

### Repro procedure (document only — do not fix)

1. Terminal 1: `node packages/extract/dist/check-extract.js --model <M1.gguf> --exec-tier cuda` — let it finish or kill after model load.
2. Within seconds, Terminal 2 (or same shell): same command with a **different** GGUF `<M2.gguf>` CUDA.
3. Expect assert at load (often before first field-fill line). Parent may still report `exit_code: 0`.
4. Control: reboot OS session / long idle / no prior CUDA llama load → single-model extract should succeed (as in B).
5. Narrow checks E–G: same-file reload; LM+mmproj concurrent; kill+fresh process — results appended when run.

**Why it matters:** cascade promotion, tier fallback, and vision (LM+mmproj) all assume model swap / multi-model residency. This assert blocks that design class.

## first_pass_ok vs retry_ok (re-agg from GPU extract logs)

Definition used (matches code): `rebuild()` does **not** re-decode the failed field
(it forces `null`/absent, clears KV, sets full preamble for later fields).
`retry_ok` = classification `ok` on a field decoded **after** ≥1 rebuild earlier in the same fixture.
`first_pass_ok` = `ok` with zero prior rebuilds in that fixture.

### Full extract CUDA (01–09)

| model | first_pass_ok | retry_ok | ok_sum | vw | miss | hall |
|-------|-------------:|---------:|-------:|---:|-----:|-----:|
| 1.7B | 27 | 8 | 35 | 5 | 3 | 2 |
| 3.5 | 24 | 7 | 31 | 2 | 5 | 7 |

1.7B first_pass_ok − 3.5 first_pass_ok = **+3** (was +4 on undifferentiated ok).

### Email diag (3.5, fixture 01, after log fix)

- (a) `char ::= [^\n\r]` — `@ . _ - +` digits allowed
- (b) `kim.minsu@example.com` → **6 tokens**, chars 21; budget **28**; grammar max 64 chars — clean email fits
- (c) grammar_fail: `tokens=28` (budget hit), raw=`010-5555-1212phone: 010-5555-121` — phone text into email slot, no `\n`

Successful email rows in full runs often show 20–27 tokens already concatenating `phone:` / next labels before sanitize cuts.
