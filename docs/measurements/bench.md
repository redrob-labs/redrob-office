# Qwen3.5-4B vision sidecar bench (CPU)

> **NOTE — historical sections below through “Cap semantics + attrs cause check” were measured under a defective harness that set `--image-min-tokens = --image-max-tokens = budget` (target resolution, not a true ceiling) and labeled caps with `prompt_n >= budget` (includes ~text tokens). Do not mix those budget comparisons with the later “FIXED cap” section.**

Date: 2026-08-06  
Host: office laptop, `ngl=0`, `--reasoning off` on **llama-server**  
mmproj: `models/verify/qwen35-4b-mmproj/mmproj-F16.gguf` (projection_dim=2560)  
Trim: `prepareImageForModel` (sharp trim + 224 short-side expand); token cap only via `--image-max-tokens`

## Sidecar boot (process cold vs warm)

| kind | wall | note |
|---|---|---|
| cold | **5.0s** | stop + 3s + first `/health` (weights already in OS page cache from prior runs) |
| warm | **5.0s** | kill then immediate restart |

Also tried loading from freshly **copied** weight paths (copy itself ~2.5s): still ~5.1s cold / ~6.9s warm — copy warms the page cache, so this is still **OS-warm disk**. True post-reboot / non-cached NVMe-or-HDD cold was not measured (needs standby-list flush or reboot). **User-facing cold after a clean boot will be higher than 5s** by the raw LM+mmproj fault-in cost (~3.4GB).

## Token budget × attr extract (trim on, 1× canary)

| image-max-tokens | ZEBRA ok | prefill (`prompt_ms`) | decode (`predicted_ms`) | `prompt_n` | HTTP wall |
|---|---|---|---|---|---|
| **512** | **true** | **21.2s** | 774ms | 574 | 22.0s |
| 1024 | true | 43.6s | 972ms | 1064 | 44.7s |
| 2048 | true | 46.3s | 814ms | 1064 | 47.2s |

**Branch point:** **512 holds** for canary attribute extract (`ZEBRA-7741`). Prefill roughly tracks `prompt_n` (~27 tok/s). 2048 does not increase tokens on this small probe (same 1064 as 1024).

Canary A/B @ 512: A=`ZEBRA-7741`, B=no zebra, **diverge=true**.

## Trim on vs off (`image-max-tokens=1024`)

| trim | ZEBRA ok | prefill | decode | `prompt_n` | wall |
|---|---|---|---|---|---|
| true | true | 39.9s | 990ms | 1064 | 41.0s |
| false | true | 43.4s | 896ms | 1096 | 44.4s |

Trim saves ~3.5s / ~32 prompt tokens on this probe (640×400 → 480×224). Office 1920×1080 captures barely trim (≤0.6% area).

## Pages wall-clock (`image-max-tokens=1024`, trim on, day-log screenshots)

| pages | ok | prefill | decode | `prompt_n` | total wall |
|---|---|---|---|---|---|
| 1 | true | 32.1s | 863ms | 1005 | 38.8s |
| 5 | true | 95.9s | 1.1s | 3025 | 98.8s |
| 10 | true | 186.9s | 5.3s | 5003 | 195.8s |

10 pages reused 4 of 6 unique captures. Prefill dominates (~19s/page at 1024 budget). Decode stays small until longer answers.

## CLI baseline (`llama-mtmd-cli`, same prepared canary, `-n 256`)

mtmd has no `--reasoning off`; first bench pass with `-n 64` died inside `<think>` (false negatives). Recheck:

| image-max-tokens | ZEBRA ok | vision encode (stderr) | total wall (incl. model load + think) |
|---|---|---|---|
| 512 | **true** | **6.3s** | 33.2s |
| 1024 | **true** | **14.4s** | 52.3s |
| 2048 | **true** | **14.3s** | 51.2s |

## Sidecar vs CLI — where time goes (@ 1024, prepared image)

| path | vision encode | prefill total (`prompt_ms`) | decode | notes |
|---|---|---|---|---|
| `llama-mtmd-cli` | **14.4s** | (not split; fold into wall) | in wall | each run reloads weights |
| `llama-server` sidecar | *(inside prefill)* | **41.6s** | **0.75s** | weights resident |

So on this CPU, **~14s is vision encode itself**; sidecar prefill’s remaining **~27s is LM prompt eval of image tokens**, not HTTP/sidecar overhead. Walking off the sidecar later won’t remove that encode+eval cost unless the binding also changes batching/GPU.

## Takeaways

1. **512 is viable** for small-field / canary-style attr extract on this probe; llama.cpp still warns Qwen-VL grounding prefers ≥1024.
2. Prefill (not decode) is the product pain; pages scale ~linear with image tokens.
3. Sidecar boot ~5s when OS-cached; plan UX around slower true cold on HDD/first boot.
4. Trim helps dense whitespace probes; full-bleed 1080p captures barely shrink.

---

## Dense real-input remeasure — STOPPED (inputs missing)

Date: 2026-08-06

### Required
- 5 real portfolio/document pages
- high text density, original ≥2048px on a side
- ≥2 with whitespace (trim)
- no synthesis / no canary reuse / no PDF rasterize-to-invent pages

### Search
Downloads, Desktop, Documents, Pictures, day-logs, redrob-office, OneDrive/redrob trees.

### ≥2048px raster files found (10) — classification

| file | size | class | usable for this bench? |
|---|---|---|---|
| `CareerChat Interview Main.png` | 1440×7177 | dense marketing/landing (whitespace margins) | yes (1) |
| `66f6d498….png` | 2602×1706 | dense Redrob dashboard screenshot | borderline UI, not portfolio case-study page |
| `250826_JH_Retouched_F*.jpg` | 4000×5997 / 3365² | portrait photo | no |
| `jonny-upscaled-v2/v3.png` | ~2048² | portrait | no |
| `IMG_2314.png` | 1260×2736 | selfie | no |
| `Luma_Rabbit_*.jpeg` | 1792×2390 | illustration | no |
| Desktop `version.jpg` (×2) | 2354×321 | thin strip | no |

### Also present but excluded
- day-log captures: 6×, **max side 1920** (<2048)
- portfolio/docs as **PDF only** (`Redrob_I_Jungwoo_Kim.pdf`, takehome, briefs, Signal decks, …) — rasterizing would violate “만들어내지 마라”
- `redrob-verify/.../forgery_gen` 2480×3507 ID scans — not portfolio pages; generated-dataset spirit

### Result
**Qualifying pages: 1 (maybe 2 if dashboard counts). Need 5. Measurement A/B not run.**

Provide 5 on-disk page images (≥2048px, dense text, ≥2 with margins) and re-run.

## Dense real-input remeasure (PDF@200DPI + CareerChat÷3 + day-log)

Date: 2026-08-06T05:22:29.990Z

### Input set

Composition: **3 PDF rasters @200 DPI** + **CareerChat vertical 3-split** + **1 day-log** → **7 pages** (CareerChat expanded by split rule so the tall page is not crushed by the cap).

| id | size | whitespace | source |
|---|---|---|---|
| p-chat-1 | 1440×2392 | yes (score 0.688) | CareerChat vertical third 1/3 y=0:2392 |
| p-chat-2 | 1440×2392 | yes (score 0.812) | CareerChat vertical third 2/3 y=2392:4784 |
| p-chat-3 | 1440×2393 | yes (score 0.916) | CareerChat vertical third 3/3 y=4784:7177 |
| p-pdf-1 | 1700×2200 | yes (score 1) | PDF@200DPI Redrob_LLM_Brief.pdf page 1 |
| p-pdf-2 | 1653×2339 | yes (score 1) | PDF@200DPI Redrob_Studio_KPI_Csuite_Brief.pdf page 6 |
| p-pdf-3 | 1653×2339 | yes (score 1) | PDF@200DPI Redrob_I_Jungwoo_Kim.pdf page 1 |
| p-daylog-1 | 1920×1080 | no (score 0.325) | day-log capture marginScore=0.325 |

### Judgment rules (fixed before run)

- `prompt_n < image-max-tokens` → **상한 미적용**; exclude from time comparison for that cell.
- If 512 attribute JSON is substantially identical to 1024 on cap-applied pages → adopt 512 as default.
- Wrong attribute extracts recorded as-is (no prompt retry).

### A — Token caps × pages (trim on)

| page | budget | prompt_n | cap? | vision encode | prefill (prompt−encode) | prompt_ms | decode | attrs |
|---|---|---|---|---|---|---|---|---|
| p-chat-1 | 512 | **594** | 적용 | — | — | 21.0s | 9.8s | `{"caseStudyCount":8,"hasProcessDocumentation":true,"layoutTypes":["hero","grid","card"],"toolEvidence":["CareerChat","In` |
| p-chat-2 | 512 | **499** | **상한 미적용** | — | — | — | — | `{"caseStudyCount":1,"hasProcessDocumentation":true,"layoutTypes":["pricing","comparison","feature-highlight"],"toolEvide` |
| p-chat-3 | 512 | **509** | **상한 미적용** | — | — | — | — | `{"caseStudyCount":1,"hasProcessDocumentation":true,"layoutTypes":["step-by-step","testimonial-card","hero-banner","foote` |
| p-pdf-1 | 512 | **517** | 적용 | — | — | 18.6s | 11.7s | `{"caseStudyCount":0,"hasProcessDocumentation":true,"layoutTypes":["table","header","list","section"],"toolEvidence":["fa` |
| p-pdf-2 | 512 | **508** | **상한 미적용** | — | — | — | — | `{"caseStudyCount":2,"hasProcessDocumentation":true,"layoutTypes":["text","sectioned"],"toolEvidence":[],"screenCount":1}` |
| p-pdf-3 | 512 | **508** | **상한 미적용** | — | — | — | — | `{"_unparsed":"{\n  \"caseStudyCount\": 1,\n  \"hasProcessDocumentation\": false,\n  \"layoutTypes\": [\n    \"grid\",\n ` |
| p-daylog-1 | 512 | **502** | **상한 미적용** | — | — | — | — | `{"caseStudyCount":0,"hasProcessDocumentation":false,"layoutTypes":["landing_page"],"toolEvidence":["redrob","whisper"],"` |
| p-chat-1 | 1024 | **1085** | 적용 | — | — | 38.0s | 5.4s | `{"caseStudyCount":0,"hasProcessDocumentation":true,"layoutTypes":["landing page","dashboard"],"toolEvidence":[],"screenC` |
| p-chat-2 | 1024 | **1085** | 적용 | — | — | 49.1s | 7.9s | `{"caseStudyCount":0,"hasProcessDocumentation":false,"layoutTypes":["pricing","comparison","feature"],"toolEvidence":[],"` |
| p-chat-3 | 1024 | **1076** | 적용 | — | — | 40.7s | 11.2s | `{"caseStudyCount":1,"hasProcessDocumentation":true,"layoutTypes":["dashboard","form","card"],"toolEvidence":["CareerChat` |
| p-pdf-1 | 1024 | **1063** | 적용 | — | — | 34.8s | 7.2s | `{"caseStudyCount":0,"hasProcessDocumentation":true,"layoutTypes":["table","list","header"],"toolEvidence":["fasttext","S` |
| p-pdf-2 | 1024 | **1089** | 적용 | — | — | 33.2s | 3.9s | `{"caseStudyCount":0,"hasProcessDocumentation":true,"layoutTypes":["text_block","section_header","horizontal_rule"],"tool` |
| p-pdf-3 | 1024 | **1115** | 적용 | — | — | 34.1s | 20.3s | `{"_unparsed":"{\n  \"caseStudyCount\": 1,\n  \"hasProcessDocumentation\": true,\n  \"layoutTypes\": [\n    \"Manseryeok\` |
| p-daylog-1 | 1024 | **1067** | 적용 | — | — | 39.1s | 7.2s | `{"caseStudyCount":0,"hasProcessDocumentation":false,"layoutTypes":["dashboard","sidebar","error_overlay"],"toolEvidence"` |
| p-chat-1 | 2048 | **2131** | 적용 | — | — | 86.4s | 5.3s | `{"caseStudyCount":0,"hasProcessDocumentation":true,"layoutTypes":["hero","grid","list"],"toolEvidence":[],"screenCount":` |
| p-chat-2 | 2048 | **2096** | 적용 | — | — | 100.1s | 8.7s | `{"caseStudyCount":1,"hasProcessDocumentation":false,"layoutTypes":["pricing","comparison","feature"],"toolEvidence":["Ca` |
| p-chat-3 | 2048 | **2081** | 적용 | — | — | 107.0s | 12.6s | `{"caseStudyCount":1,"hasProcessDocumentation":true,"layoutTypes":["grid","card","testimonial"],"toolEvidence":["CareerCh` |
| p-pdf-1 | 2048 | **2115** | 적용 | — | — | 107.9s | 8.0s | `{"caseStudyCount":0,"hasProcessDocumentation":true,"layoutTypes":["table","list","header"],"toolEvidence":["fasttext","S` |
| p-pdf-2 | 2048 | **2099** | 적용 | — | — | 91.9s | 4.9s | `{"caseStudyCount":2,"hasProcessDocumentation":false,"layoutTypes":["text_block"],"toolEvidence":[],"screenCount":1}` |
| p-pdf-3 | 2048 | **2136** | 적용 | — | — | 96.8s | 21.8s | `{"_unparsed":"{\n  \"caseStudyCount\": 1,\n  \"hasProcessDocumentation\": true,\n  \"layoutTypes\": [\n    \"grid\",\n  ` |
| p-daylog-1 | 2048 | **2141** | 적용 | — | — | 80.4s | 6.4s | `{"caseStudyCount":0,"hasProcessDocumentation":false,"layoutTypes":["dashboard","sidebar","chat_interface"],"toolEvidence` |

#### Cap-applied only — timing means

- budget 512 (n=2): mean prompt_ms=19.8s, mean decode=10.8s, pages=p-chat-1,p-pdf-1
- budget 1024 (n=7): mean prompt_ms=38.4s, mean decode=9.0s, pages=p-chat-1,p-chat-2,p-chat-3,p-pdf-1,p-pdf-2,p-pdf-3,p-daylog-1
- budget 2048 (n=7): mean prompt_ms=95.8s, mean decode=9.7s, pages=p-chat-1,p-chat-2,p-chat-3,p-pdf-1,p-pdf-2,p-pdf-3,p-daylog-1

#### 512 vs 1024 attribute extract (cap-applied pages only)

| page | same@512vs1024? | attrs@512 | attrs@1024 |
|---|---|---|---|
| p-chat-1 | false | `{"caseStudyCount":8,"hasProcessDocumentation":true,"layoutTypes":["hero","grid","card"],"toolEvidenc` | `{"caseStudyCount":0,"hasProcessDocumentation":true,"layoutTypes":["landing page","dashboard"],"toolE` |
| p-pdf-1 | false | `{"caseStudyCount":0,"hasProcessDocumentation":true,"layoutTypes":["table","header","list","section"]` | `{"caseStudyCount":0,"hasProcessDocumentation":true,"layoutTypes":["table","list","header"],"toolEvid` |

**Default token cap decision:** NO — keep 1024 (or higher) as default (same 0/2 overlapping cap-applied pages).

### B — Trim on/off @ 512 (per page)

| page | whitespace? | trim | area reduction | prompt_n | Δprompt_n (on−off) | encode | prompt_ms | decode |
|---|---|---|---|---|---|---|---|---|
| p-chat-1 | yes | true | 0.0% | 594 | 78 | — | 16.0s | 4.8s |
| p-chat-1 | yes | false | 0.0% | 516 | -78 | — | 14.9s | 5.3s |
| p-chat-2 | yes | true | 1.1% | 499 | -17 | — | 14.6s | 6.3s |
| p-chat-2 | yes | false | 1.1% | 516 | 17 | — | 15.2s | 6.3s |
| p-chat-3 | yes | true | 8.1% | 509 | -7 | — | 14.7s | 8.0s |
| p-chat-3 | yes | false | 8.1% | 516 | 7 | — | 17.4s | 6.4s |
| p-pdf-1 | yes | true | 27.7% | 517 | 20 | — | 18.2s | 8.8s |
| p-pdf-1 | yes | false | 27.7% | 497 | -20 | — | 14.2s | 7.3s |
| p-pdf-2 | yes | true | 16.2% | 508 | -8 | — | 14.9s | 4.7s |
| p-pdf-2 | yes | false | 16.2% | 516 | 8 | — | 17.4s | 11.2s |
| p-pdf-3 | yes | true | 20.1% | 508 | -8 | — | 19.4s | 9.4s |
| p-pdf-3 | yes | false | 20.1% | 516 | 8 | — | 15.1s | 20.5s |
| p-daylog-1 | no | true | 0.6% | 502 | 0 | — | 14.6s | 5.8s |
| p-daylog-1 | no | false | 0.6% | 502 | 0 | — | 14.3s | 6.7s |

Whitespace pages (chat/PDF) vs full-bleed day-log: compare rows above individually — no averages.


---

## Cap semantics + attrs cause check

Date: 2026-08-06  
Script: `apps/office/scripts/vision-cap-attrs-check.mjs`  
Raw: `tmp/qwen35-ab-phase0/cap-attrs-check.json` / `.log`

### Check 1 — does the cap flag actually work?

#### Spawn cmdline (dense harness, verbatim)

Budget **512**:
```
llama-server.exe -m …/Qwen3.5-4B-Q4_K_M.gguf --mmproj …/qwen35-4b-mmproj/mmproj-F16.gguf --host 127.0.0.1 --port <dyn> -ngl 0 -c 8192 --image-min-tokens 512 --image-max-tokens 512 --reasoning off
```

Budget **1024**: `--image-min-tokens 1024 --image-max-tokens 1024`

Budget **2048**: `--image-min-tokens 1024 --image-max-tokens 2048`  
(min clamped at 1024; max = budget)

llama-server help: min/max = min/max tokens **each image** can take (dynamic resolution). Default if omitted: “read from model”. Server also warns Qwen-VL grounding prefers min ≥ 1024.

#### max = ceiling or target?

With **min = max = budget** (512 and 1024 runs), the pair behaves as a **resolution target band**, not “use natural tokens until ceiling”. Probe on same `p-pdf-1`:

| budget | prompt_n | ≈ image tokens (prompt_n − 99 text) |
|---|---|---|
| text-only ATTR_PROMPT | **99** | 0 |
| 512 (min=max=512) | **595** | ~496 |
| 1024 (min=max=1024) | **1063** | ~964 |

Same file → more tokens when budget rises. `prompt_n ≈ budget + ~40–90` (text) explains the “slightly over budget” pattern (1024→~1060, 2048→~2080): **total** prompt includes text; image portion tracks the max target.

#### Harness “상한 적용” logic

```js
capApplied: promptN >= budget   // TOTAL prompt_n, not image-only
```

So at 512, pages with prompt_n 499–509 were labeled **미적용** even though the server was already steering with min=max=512. Those same pages at 1024 get ~1080 tokens because min=max **retargets** upward — not because natural content “overflowed” 512.

#### Verdict on the 512 “5장 미적용”

| | |
|---|---|
| Run timings / prompt_n numbers | **Valid** (real requests) |
| Label “상한 미적용” + implication “자연 토큰 < 512라서 1024에 못 감” | **Invalid** |
| Apparent contradiction (미적용@512 → 적용@1024) | **Resolved**: budget retargets image tokens; harness compared total prompt_n to budget |

**결론: 512 구간의 “5장 상한 미적용” 판정은 무효.** 시간 비교에서 제외한 근거로 쓰면 안 된다.

---

### Check 2 — attrs 0/2 cause (pages p-chat-1, p-pdf-1 only)

#### 2048 re-extract (fresh)

| page | prompt_n | raw attrs @2048 |
|---|---|---|
| p-chat-1 | 2131 | `caseStudyCount:0, hasProcessDocumentation:true, layoutTypes:[hero,feature-grid,logos-strip], toolEvidence:[CareerChat,AI Interview,Interview Prep], screenCount:1` |
| p-pdf-1 | 2115 | `caseStudyCount:0, hasProcessDocumentation:true, layoutTypes:[table,list,header], toolEvidence:[fasttext,Sarvam,Llama 3.2 3B], screenCount:1` |

Vs prior:

| page | 512 vs 1024 | 1024 vs 2048 |
|---|---|---|
| p-chat-1 | different (0) | still different |
| p-pdf-1 | different (0) | **≈ same** |

**2048 does not fix the 0/2.** Chat-1 still thrashing across budgets; pdf-1 already stable by 1024. Budget axis is a weak explanation for quality — not closed solely by “needs more tokens,” and 2048 remains cost-rejected.

#### a) Raw dump — parse vs judgment

Both 2048 reruns returned **valid JSON** (parse OK). Prior failures on these two were **judgment/label instability**, not parse failures. (Other pages in the dense run had `_unparsed` truncated JSON — separate issue.)

#### b) CareerChat whole vs split @2048

| | prompt_n | attrs summary |
|---|---|---|
| p-chat-1 (top third) | 2131 | tools named; layouts hero/feature-grid/logos-strip |
| CareerChat **whole** 1440×7177 | 2121 (still capped ~2048) | `layoutTypes:[grid,flex,section], toolEvidence:[], caseStudyCount:0` |

Whole page is still crushed to ~2048 image tokens — not a fair “full context” control. Split vs whole both imperfect; split is not uniquely guilty, but top-third alone also lacks lower “How it works / pricing” context so `caseStudyCount`/`process` labels are underspecified.

#### c) Human ground truth (ambiguous called out)

**p-chat-1** (CareerChat landing top: hero + logos + start of features):
- `caseStudyCount`: **0** (marketing features, not case studies). Model@512 said **8** — wrong. Schema fit on a landing page is **ambiguous** if someone counts feature blocks as cases.
- `hasProcessDocumentation`: **false** on this crop alone (process steps are lower). Model often says true — soft false positive.
- `layoutTypes`: hero, logo-strip, feature-section — reasonable.
- `toolEvidence`: product names (CareerChat / Interview Prep), not eng tools — schema **ambiguous**.
- `screenCount`: **1** (or 1–2 small UI mockups) — model’s 1 is fine.

**p-pdf-1** (Redrob LLM Architecture Brief p1):
- `caseStudyCount`: **0**
- `hasProcessDocumentation`: **true** (HOW IT WORKS / layers)
- `layoutTypes`: header, sections, tables, lists
- `toolEvidence`: fasttext, Sarvam, Llama 3.2 3B (OpenAI = competitor mention — optional)
- `screenCount`: **1** (doc page)

Model@1024/2048 on pdf-1 is **roughly correct**. 512 also close. The 512/1024 “mismatch” here is minor field churn, not total miss.

#### Cause summary

1. Harness cap labels were wrong → budget comparison contaminated.  
2. Attrs 0/2 is mostly **schema ambiguity + non-deterministic labeling** (especially CareerChat landing), not “need 2048 tokens.”  
3. pdf-1 shows budget is not the limiter once ~1024.  
4. Do **not** change default budget from this check alone (still deferred).

## Dense remeasure FIXED cap (max-only, imageTokens)

Date: 2026-08-06T05:58:30.071Z

### Harness (corrected)

- `--image-max-tokens <budget>` only — **no** `--image-min-tokens` (server default)
- `textOnlyBaseline` measured per page (ATTR_PROMPT, no image) before image runs
- `imageTokens = prompt_n - textOnlyBaseline`
- **Budget is resolution target, not ceiling — `capApplied` abandoned.**
- Budgets: **512 / 1024** only (2048 excluded)

Example spawn:
```
C:\Users\USER\AppData\Local\redrob\verify-tools\bin\llama-server.exe -m C:\Users\USER\AppData\Local\redrob\models\verify\Qwen3.5-4B-Q4_K_M.gguf --mmproj C:\Users\USER\AppData\Local\redrob\models\verify\qwen35-4b-mmproj\mmproj-F16.gguf --host 127.0.0.1 --port 60177 -ngl 0 -c 8192 --image-max-tokens 512 --reasoning off
```

### textOnlyBaseline (per page)

| page | textOnlyBaseline |
|---|---|
| p-chat-1 | 99 |
| p-chat-2 | 99 |
| p-chat-3 | 99 |
| p-pdf-1 | 99 |
| p-pdf-2 | 99 |
| p-pdf-3 | 99 |
| p-daylog-1 | 99 |

### A — budgets × pages

| page | budget | textOnlyBaseline | prompt_n | imageTokens | capApplied | prompt_ms | decode_ms | attrs |
|---|---|---|---|---|---|---|---|---|
| p-chat-1 | 512 | 99 | 594 | **495** | false | — (미적용) | — | `{"caseStudyCount":8,"hasProcessDocumentation":true,"layoutTypes":["hero","grid","card"],"toolEvidence":["CareerChat","Interview Prep","AI In` |
| p-chat-2 | 512 | 99 | 577 | **478** | false | — (미적용) | — | `{"caseStudyCount":1,"hasProcessDocumentation":false,"layoutTypes":["pricing","comparison","feature-highlight"],"toolEvidence":["CareerChat",` |
| p-chat-3 | 512 | 99 | 587 | **488** | false | — (미적용) | — | `{"caseStudyCount":1,"hasProcessDocumentation":true,"layoutTypes":["process","testimonial","hero","footer"],"toolEvidence":["CareerChat AI In` |
| p-pdf-1 | 512 | 99 | 595 | **496** | false | — (미적용) | — | `{"caseStudyCount":0,"hasProcessDocumentation":true,"layoutTypes":["table","header","list","section"],"toolEvidence":["fasttext","Sarvam","Ll` |
| p-pdf-2 | 512 | 99 | 587 | **488** | false | — (미적용) | — | `{"caseStudyCount":3,"hasProcessDocumentation":true,"layoutTypes":["text","sectioned"],"toolEvidence":[],"screenCount":1}` |
| p-pdf-3 | 512 | 99 | 587 | **488** | false | — (미적용) | — | `{"_unparsed":"{\n  \"caseStudyCount\": 1,\n  \"hasProcessDocumentation\": false,\n  \"layoutTypes\": [\n    \"Manseryeok\",\n    \"Saju read` |
| p-daylog-1 | 512 | 99 | 581 | **482** | false | — (미적용) | — | `{"caseStudyCount":0,"hasProcessDocumentation":false,"layoutTypes":["landing_page"],"toolEvidence":["redrob","whisper"],"screenCount":1}` |
| p-chat-1 | 1024 | 99 | 1085 | **986** | false | — (미적용) | — | `{"caseStudyCount":0,"hasProcessDocumentation":true,"layoutTypes":["landing page","dashboard"],"toolEvidence":[],"screenCount":1}` |
| p-chat-2 | 1024 | 99 | 1085 | **986** | false | — (미적용) | — | `{"caseStudyCount":0,"hasProcessDocumentation":true,"layoutTypes":["pricing","comparison","feature-highlight"],"toolEvidence":[],"screenCount` |
| p-chat-3 | 1024 | 99 | 1076 | **977** | false | — (미적용) | — | `{"caseStudyCount":1,"hasProcessDocumentation":true,"layoutTypes":["dashboard","form","card"],"toolEvidence":["CareerChat","CareerChat AI Int` |
| p-pdf-1 | 1024 | 99 | 1063 | **964** | false | — (미적용) | — | `{"caseStudyCount":0,"hasProcessDocumentation":true,"layoutTypes":["table","list","header"],"toolEvidence":["fasttext","Sarvam","Llama 3.2 3B` |
| p-pdf-2 | 1024 | 99 | 1089 | **990** | false | — (미적용) | — | `{"caseStudyCount":0,"hasProcessDocumentation":true,"layoutTypes":["text","heading","list"],"toolEvidence":[],"screenCount":1}` |
| p-pdf-3 | 1024 | 99 | 1115 | **1016** | false | — (미적용) | — | `{"_unparsed":"{\n  \"caseStudyCount\": 1,\n  \"hasProcessDocumentation\": true,\n  \"layoutTypes\": [\n    \"table\",\n    \"card\",\n    \"` |
| p-daylog-1 | 1024 | 99 | 1067 | **968** | false | — (미적용) | — | `{"caseStudyCount":0,"hasProcessDocumentation":false,"layoutTypes":["dashboard","sidebar","form"],"toolEvidence":["whisper","ggml","cuda","re` |

#### Cap-applied timing means

- budget 512: **no pages hit cap**
- budget 1024: **no pages hit cap**

#### 512 vs 1024 attrs (all pages; cap gate removed)

| page | substantially same? | differing fields |
|---|---|---|
| — | no pages capped at both 512 and 1024 | — |

**Budget decision note (not applied):** DEFER — no overlapping cap-applied pages to compare attrs

### attrs raw JSON (all cells)

#### p-chat-1 @ 512
```json
{
  "caseStudyCount": 8,
  "hasProcessDocumentation": true,
  "layoutTypes": ["hero", "grid", "card"],
  "toolEvidence": ["CareerChat", "Interview Prep", "AI Interview"],
  "screenCount": 1
}
```

#### p-chat-2 @ 512
```json
{
  "caseStudyCount": 1,
  "hasProcessDocumentation": false,
  "layoutTypes": [
    "pricing",
    "comparison",
    "feature-highlight"
  ],
  "toolEvidence": [
    "CareerChat",
    "CareerChats"
  ],
  "screenCount": 1
}
```

#### p-chat-3 @ 512
```json
{
  "caseStudyCount": 1,
  "hasProcessDocumentation": true,
  "layoutTypes": [
    "process",
    "testimonial",
    "hero",
    "footer"
  ],
  "toolEvidence": [
    "CareerChat AI Interview Prep",
    "AI scoring",
    "Job interview prep",
    "Interview practice"
  ],
  "screenCount": 1
}
```

#### p-pdf-1 @ 512
```json
{
  "caseStudyCount": 0,
  "hasProcessDocumentation": true,
  "layoutTypes": [
    "table",
    "header",
    "list",
    "section"
  ],
  "toolEvidence": [
    "fasttext",
    "Sarvam",
    "Llama 3.2 3B",
    "Apache 2.0"
  ],
  "screenCount": 1
}
```

#### p-pdf-2 @ 512
```json
{
  "caseStudyCount": 3,
  "hasProcessDocumentation": true,
  "layoutTypes": ["text", "sectioned"],
  "toolEvidence": [],
  "screenCount": 1
}
```

#### p-pdf-3 @ 512
```json
{
  "caseStudyCount": 1,
  "hasProcessDocumentation": false,
  "layoutTypes": [
    "Manseryeok",
    "Saju reading"
  ],
  "toolEvidence": [
    "Manseryeok",
    "Saju reading",
    "1989-05-22",
    "Solar",
    "17:22",
    "Male",
    "Self",
    "Big earth",
    "Seven Killings",
    "Big water",
    "Poor",
    "Small earth",
    "Direct Officer",
    "Small earth",
    "Direct Officer",
    "Monkey",
    "Big Metal",
    "Indirect Resource",
    "Horse",
    "Shall Fire",
    "Direct Officer",
    "Snake",
    "Big Fire",
    "Indirect Resource",
    "Snake",
    "Big Fire",
    "Indirect Resource",
    "Peak",
    "Decline",
    "Weak",
    "Strong",
    "Golden Carriage",
```

#### p-daylog-1 @ 512
```json
{
  "caseStudyCount": 0,
  "hasProcessDocumentation": false,
  "layoutTypes": [
    "landing_page"
  ],
  "toolEvidence": [
    "redrob",
    "whisper"
  ],
  "screenCount": 1
}
```

#### p-chat-1 @ 1024
```json
{
  "caseStudyCount": 0,
  "hasProcessDocumentation": true,
  "layoutTypes": ["landing page", "dashboard"],
  "toolEvidence": [],
  "screenCount": 1
}
```

#### p-chat-2 @ 1024
```json
{
  "caseStudyCount": 0,
  "hasProcessDocumentation": true,
  "layoutTypes": ["pricing", "comparison", "feature-highlight"],
  "toolEvidence": [],
  "screenCount": 1
}
```

#### p-chat-3 @ 1024
```json
{
  "caseStudyCount": 1,
  "hasProcessDocumentation": true,
  "layoutTypes": [
    "dashboard",
    "form",
    "card"
  ],
  "toolEvidence": [
    "CareerChat",
    "CareerChat AI Interview Prep"
  ],
  "screenCount": 1
}
```

#### p-pdf-1 @ 1024
```json
{
  "caseStudyCount": 0,
  "hasProcessDocumentation": true,
  "layoutTypes": [
    "table",
    "list",
    "header"
  ],
  "toolEvidence": [
    "fasttext",
    "Sarvam",
    "Llama 3.2 3B"
  ],
  "screenCount": 1
}
```

#### p-pdf-2 @ 1024
```json
{
  "caseStudyCount": 0,
  "hasProcessDocumentation": true,
  "layoutTypes": [
    "text",
    "heading",
    "list"
  ],
  "toolEvidence": [],
  "screenCount": 1
}
```

#### p-pdf-3 @ 1024
```json
{
  "caseStudyCount": 1,
  "hasProcessDocumentation": true,
  "layoutTypes": [
    "table",
    "card",
    "header"
  ],
  "toolEvidence": [
    "Manseryeok",
    "Saju reading",
    "Big earth",
    "Big water",
    "Small earth",
    "Monkey",
    "Horse",
    "Snake",
    "Golden Carriage",
    "Heavenly Noble",
    "Moon Virtue",
    "Academic Star",
    "Heavenly Doctor",
    "Flying Blade",
    "Red Charm",
    "Eight Seats",
    "Void",
    "Yin-Yang Mistake",
    "Peak",
    "Decline",
    "Weak",
    "Strong",
    "Seven Killings",
    "Peer",
    "Direct Officer",
    "Indirect Resource",
    "Big Metal",
    "Small Fire",
    "Big Fire",
    "Long Life",
    "Fetus",
    "Death",
    "
```

#### p-daylog-1 @ 1024
```json
{
  "caseStudyCount": 0,
  "hasProcessDocumentation": false,
  "layoutTypes": [
    "dashboard",
    "sidebar",
    "form"
  ],
  "toolEvidence": [
    "whisper",
    "ggml",
    "cuda",
    "redrob"
  ],
  "screenCount": 1
}
```

## capApplied abandoned (2026-08-06)

**Budget (`--image-max-tokens`) is a resolution target, not a ceiling.** With max-only, imageTokens ≈ 95% of budget (512→~480, 1024→~980), so `capApplied = imageTokens >= budget` is almost never true. The gate is conceptually wrong and discarded. All 7 pages are valid comparison subjects. `imageTokens` column retained to verify budget→resolution. Product default unchanged pending attrs field compare.

## Dense remeasure FIXED — timings (capApplied abandoned)

Date: 2026-08-06T05:58:30.068Z

| page | budget | textOnlyBaseline | prompt_n | imageTokens | prompt_ms | decode_ms |
|---|---|---|---|---|---|---|
| p-chat-1 | 512 | 99 | 594 | **495** | 19.2s | 5.5s |
| p-chat-2 | 512 | 99 | 577 | **478** | 17.6s | 7.5s |
| p-chat-3 | 512 | 99 | 587 | **488** | 18.2s | 8.7s |
| p-pdf-1 | 512 | 99 | 595 | **496** | 17.0s | 8.5s |
| p-pdf-2 | 512 | 99 | 587 | **488** | 17.6s | 5.1s |
| p-pdf-3 | 512 | 99 | 587 | **488** | 17.8s | 19.3s |
| p-daylog-1 | 512 | 99 | 581 | **482** | 15.6s | 4.8s |
| p-chat-1 | 1024 | 99 | 1085 | **986** | 32.6s | 3.7s |
| p-chat-2 | 1024 | 99 | 1085 | **986** | 34.8s | 5.5s |
| p-chat-3 | 1024 | 99 | 1076 | **977** | 38.1s | 6.5s |
| p-pdf-1 | 1024 | 99 | 1063 | **964** | 33.0s | 6.5s |
| p-pdf-2 | 1024 | 99 | 1089 | **990** | 32.8s | 4.5s |
| p-pdf-3 | 1024 | 99 | 1115 | **1016** | 35.2s | 18.6s |
| p-daylog-1 | 1024 | 99 | 1067 | **968** | 31.9s | 6.6s |

**Timing (all 7 pages):** 512 mean prompt_ms ≈ **17.6s**; 1024 mean ≈ **34.1s** (~2×, linear with imageTokens ~480→~980).

**capApplied abandoned:** budget is resolution target (~95% fill), not ceiling.

## Attrs field compare 512→1024 (from dense-remeasure-fixed.json, no re-run)

Cells: `512 value → 1024 value`. **≠** = mismatch. `p-pdf-3` both unparsed → excluded from field tallies.

| page | caseStudyCount | hasProcessDocumentation | layoutTypes | toolEvidence | screenCount |
|---|---|---|---|---|---|
| p-chat-1 | **≠** 8 → 0 | true → true | **≠** ["hero","grid","card"] → ["landing page","dashboard"] | **≠** ["CareerChat","Interview Prep","AI Interview"] → [] | 1 → 1 |
| p-chat-2 | **≠** 1 → 0 | **≠** false → true | ["pricing","comparison","feature-highlight"] → same | **≠** ["CareerChat","CareerChats"] → [] | 1 → 1 |
| p-chat-3 | 1 → 1 | true → true | **≠** ["process","testimonial","hero","footer"] → ["dashboard","form","card"] | **≠** (4 labels) → ["CareerChat","CareerChat AI Interview Prep"] | 1 → 1 |
| p-pdf-1 | 0 → 0 | true → true | **≠** ["table","header","list","section"] → ["table","list","header"] | **≠** (+Apache 2.0) → without | 1 → 1 |
| p-pdf-2 | **≠** 3 → 0 | true → true | **≠** ["text","sectioned"] → ["text","heading","list"] | [] → [] | 1 → 1 |
| p-pdf-3 | _unparsed both_ | — | — | — | — |
| p-daylog-1 | 0 → 0 | false → false | **≠** ["landing_page"] → ["dashboard","sidebar","form"] | **≠** ["redrob","whisper"] → ["whisper","ggml","cuda","redrob"] | 1 → 1 |

### Mismatch counts (6 parsed pages)

| field | mismatches |
|---|---|
| caseStudyCount | 3 |
| hasProcessDocumentation | 1 |
| layoutTypes | 5 |
| toolEvidence | 5 |
| screenCount | 0 |
| **total cells** | **14** |

**Verdict:** mismatches are **scattered** across fields (not 0–1; not a single resolution-sensitive field). Points to **output instability** rather than resolution alone → next (not run this turn): same image × same budget × 3 repeats for self-consistency. Product default unchanged. Step 3 schema diagnosis deferred.

## Self-consistency @ 1024 × 3 (same session)

Date: 2026-08-06T06:48:10.567Z

### Sampling (unchanged except seed)

- temperature: **0.1**
- top_p: not sent (server default)
- top_k: not sent (server default)
- max_tokens: 256
- cache_prompt: false
- seed: **42** (seedFixed=true)
- server restart between repeats: **no** (one session)

| field | repeat mismatch (of 6 pages) | 512↔1024 mismatch | verdict |
|---|---|---|---|
| caseStudyCount | 0 | 3 | resolution-sensitive (repeat<<budget) |
| hasProcessDocumentation | 0 | 1 | resolution-sensitive (repeat<<budget) |
| layoutTypes | 0 | 5 | resolution-sensitive (repeat<<budget) |
| toolEvidence | 0 | 5 | resolution-sensitive (repeat<<budget) |
| screenCount | 0 | 0 | both-stable |

**Overall:** KEEP 1024 — repeat<<budget → resolution matters

Product default unchanged this turn.

## Qwen3.5-4B vs Gemma 4 E4B vision bench (GPU)

Date: 2026-08-06T07:47:39.801Z

### Command lines
```
Qwen      : C:\Users\USER\AppData\Local\redrob\verify-tools\bin-cuda\llama-server.exe -m C:\Users\USER\AppData\Local\redrob\models\verify\Qwen3.5-4B-Q4_K_M.gguf --mmproj C:\Users\USER\AppData\Local\redrob\models\verify\qwen35-4b-mmproj\mmproj-F16.gguf --host 127.0.0.1 --port <port> -ngl 99 -c 8192 --parallel 1 --image-min-tokens 1024 --image-max-tokens 1024 --reasoning off
Gemma -hf : C:\Users\USER\AppData\Local\redrob\verify-tools\bin-cuda\llama-server.exe -hf ggml-org/gemma-4-E4B-it-GGUF:Q4_0 --host 127.0.0.1 --port <port> -ngl 99 -c 8192 --parallel 1 --image-max-tokens 1024 --jinja --reasoning-budget 0 --reasoning off --ubatch-size 2048 --batch-size 2048 --no-mmproj-offload
Gemma run : C:\Users\USER\AppData\Local\redrob\verify-tools\bin-cuda\llama-server.exe -m C:\Users\USER\AppData\Local\redrob\models\verify\gemma4-e4b\gemma-4-E4B-it-Q4_0.gguf --mmproj C:\Users\USER\AppData\Local\redrob\models\verify\gemma4-e4b\mmproj-gemma-4-E4B-it-BF16.gguf --host 127.0.0.1 --port <port> -ngl 99 -c 8192 --parallel 1 --image-max-tokens 1024 --jinja --reasoning-budget 0 --reasoning off --ubatch-size 2048 --batch-size 2048 --no-mmproj-offload
```

Gemma run uses local files downloaded from `ggml-org/gemma-4-E4B-it-GGUF` (same as `-hf`); avoids a second 5GB pull.

| metric | Qwen3.5-4B | Gemma 4 E4B |
|---|---|---|
| disk LM+mmproj GiB | 2.55+0.63 | 4.28+0.92 |
| canary ZEBRA-7741 | 100% (ok,ok,ok) | 100% (ok,ok,ok) |
| screenCount self-consist | 6/6 | 5/6 |
| layoutTypes hit rate (GT pages×3) | 100% | 25% |
| layoutTypes self-consist | 2/4 | 3/4 |
| mean prompt_ms | 1713 | 24408 |
| mean decode_ms | 1636 | 1439 |
| VRAM after load mmproj-GPU (MiB) | 6899 | 7898 |
| peak VRAM 1-image mmproj-GPU (MiB) | 6963 | 7909 |
| headroom at peak mmproj-GPU | 1225 | 279 |
| peak VRAM --no-mmproj-offload | 3487 | 4051 |
| pages/canary offload mode | mmproj GPU | gemma with --no-mmproj-offload |

**Verdict:** Qwen — lower peak VRAM (canary tie)

Excluded from judging: caseStudyCount, hasProcessDocumentation, toolEvidence. Product defaults unchanged.

## Qwen3.5-4B vs Gemma 4 E4B vision bench (GPU)

Date: 2026-08-06T07:56:35.310Z

### Command lines
```
Qwen      : C:\Users\USER\AppData\Local\redrob\verify-tools\bin-cuda\llama-server.exe -m C:\Users\USER\AppData\Local\redrob\models\verify\Qwen3.5-4B-Q4_K_M.gguf --mmproj C:\Users\USER\AppData\Local\redrob\models\verify\qwen35-4b-mmproj\mmproj-F16.gguf --host 127.0.0.1 --port <port> -ngl 99 -c 8192 --parallel 1 --image-min-tokens 1024 --image-max-tokens 1024 --reasoning off
Gemma -hf : C:\Users\USER\AppData\Local\redrob\verify-tools\bin-cuda\llama-server.exe -hf ggml-org/gemma-4-E4B-it-GGUF:Q4_0 --host 127.0.0.1 --port <port> -ngl 99 -c 8192 --parallel 1 --image-max-tokens 1024 --jinja --reasoning-budget 0 --reasoning off --ubatch-size 2048 --batch-size 2048 --no-mmproj-offload
Gemma run : C:\Users\USER\AppData\Local\redrob\verify-tools\bin-cuda\llama-server.exe -m C:\Users\USER\AppData\Local\redrob\models\verify\gemma4-e4b\gemma-4-E4B-it-Q4_0.gguf --mmproj C:\Users\USER\AppData\Local\redrob\models\verify\gemma4-e4b\mmproj-gemma-4-E4B-it-BF16.gguf --host 127.0.0.1 --port <port> -ngl 99 -c 8192 --parallel 1 --image-max-tokens 1024 --jinja --reasoning-budget 0 --reasoning off --ubatch-size 2048 --batch-size 2048 --no-mmproj-offload
```

Gemma run uses local files downloaded from `ggml-org/gemma-4-E4B-it-GGUF` (same as `-hf`); avoids a second 5GB pull.

| metric | Qwen3.5-4B | Gemma 4 E4B |
|---|---|---|
| disk LM+mmproj GiB | 2.55+0.63 | 4.28+0.92 |
| canary ZEBRA-7741 | 100% (ok,ok,ok) | 100% (ok,ok,ok) |
| screenCount self-consist | 5/6 | 5/6 |
| layoutTypes hit rate (GT pages×3) | 92% | 25% |
| layoutTypes self-consist | 0/4 | 2/4 |
| mean prompt_ms | 2017 | 23735 |
| mean decode_ms | 2039 | 1150 |
| VRAM after load mmproj-GPU (MiB) | 7815 | 5850 |
| peak VRAM 1-image mmproj-GPU (MiB) | 7877 | 5868 |
| headroom at peak mmproj-GPU | 311 | 2320 |
| peak VRAM --no-mmproj-offload | 3349 | 3914 |
| pages/canary offload mode | mmproj GPU | gemma with --no-mmproj-offload |

**Verdict:** Gemma — lower peak VRAM (canary tie)

Excluded from judging: caseStudyCount, hasProcessDocumentation, toolEvidence. Product defaults unchanged.

## Track B — schema conditional redesign

Labels: **Opus 라벨, 사람 미검수**

| page | pageType |
|---|---|
| p-chat-1 | landing |
| p-chat-2 | landing |
| p-chat-3 | landing |
| p-pdf-1 | other |
| p-pdf-2 | other |
| p-pdf-3 | other |
| p-daylog-1 | other |

### pageType × field matrix (a/b/c)

| pageType | caseStudyCount | hasProcessDocumentation | layoutTypes | toolEvidence | screenCount |
|---|---|---|---|---|---|
| landing | c | a | a | c | a |
| caseStudy | a | a | a | a | a |
| index | b | b | a | c | a |
| contact | b | b | a | b | a |
| other | b | c | a | c | a |

- landing caseStudyCount: 묻지 말아야 함 (c). 전용 case-study 섹션이 없으면 강제 정의 시 정답은 0이지 null이 아님. 하지만 feature/testimonial/logo를 case study로 세는 정의가 모호해 512/1024에서 8↔0이 갈림.
- toolEvidence: 섞임. 페이지에 적힌 도구명(OCR)과 제품 능력 추론(AI Interview 등)이 한 필드에 혼재 → 필드 정의 모호 (c).
- path: B-3/B-4 진행 (c 존재)
- **final: 2단 실패, 단일 스키마 유지**
- stage1 accuracy vs Opus labels: 10%; unstable=true

Product code unchanged — recommendation only.

## Track B — problem field cleanup (post 2-stage fail)

- caseStudyCount preferredNext: **redefine_then_remeasure_else_remove**
- toolsNamed self-consist: **86%** vs toolEvidence **71%** (Δ 14pp)
- pageType other: other가 4/7인 건 샘플 구성 문제(랜딩 3 + 문서/앱 4). 분류 태스크 성립 전에 Desk 실입력 분포가 필요. 지금은 새 pageType 스키마 반영 금지; internalDoc vs appUi 분리는 분포 확인 후.
- Product code unchanged.
