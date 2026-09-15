# ASR / Voice / General Chat

Decisions and measurements for local ASR, VAD, TTS, chat prefill, and voice mode.
**Legal copy for interview consent is placeholder — must not ship to production until counsel supplies final text.**

## 0. Repo recon (as of build)

| Check | Finding |
|---|---|
| `runChat` / `chat.ts` | Flattens full history every turn into one prompt; no KV session across turns. Streaming chunks exist (`desk:chatStream`) but local path called `generateText` in **main**, not utilityProcess. |
| Audio I/O | None (no mic / whisper / TTS / ffmpeg). |
| `resolveExecutionPlan` | `packages/kernel/src/inference/execution-plan.ts` — used by field-fill / host; chat used `TIERS[tier].text` directly (diverged). |
| `numberLines()` | `packages/compare/src/index.ts` — `{ numberedText, lines: Map<number,string> }`, 1-based `N\|line`. |
| `utilityProcess` | `inference-host.ts` + `inference-worker.ts` — fork, `{id,type,payload}`, field side-channel, in-process fallback on fork/exit. |
| `SlotFieldSpec` | `packages/kernel/src/slot-field-spec.ts`; boot assert in `assert-product-grammars.ts`. |
| Tier contradiction | Track notes historically said 8GB=1.7B / 16GB=4B Qwen3; **product text is now Qwen3.5** via `textModelIdFor` (T4→2B, T8/T16→4B on GPU). Chat must use `resolveExecutionPlan` / host. |

## 1. Process topology (forced)

```
Electron main
  ├─ inference utilityProcess  (Qwen3.5 GGUF only)
  ├─ asr utilityProcess        (whisper.cpp CLI / ggml — never share CUDA ctx with LLM)
  └─ (no TTS process in v1 — text out)
```

Idle stop: ASR worker exits after **8 minutes** without work; next job re-forks.
Each process logs its own plan / binary path on start.

## 2. Phase A — model decisions

### A-1 ASR

| Candidate | License | KO | Runtime fit | Notes |
|---|---|---|---|---|
| Whisper large-v3-turbo | MIT | Stronger than small | whisper.cpp ggml sidecar | ~1.6B-class decode; **T16 / GPU default** |
| Whisper small | MIT | Weaker KO | whisper.cpp | Fits **T8 / 8GB** sequential budget |
| SenseVoiceSmall | MIT code; **FunASR Model License** weights (commercial OK + attribution) | Strong KO claim | Python/FunASR — not GGML | Pass license; **deferred** (runtime mismatch) |
| Cohere Transcribe 2B | Apache-2.0 | KO in 14 langs | transformers/ONNX, ~2B | Pass license; **deferred** (not whisper.cpp; RSS fights 8GB+LLM) |

**Bake-off status:** No on-device Korean fixtures + whisper binary in CI at decision time. Applied rules using published KO quality ranking (turbo ≫ small) + **size rule**: turbo not default on 8GB tier.

**Choice**

| Tier | ASR model | Rationale |
|---|---|---|
| T8 / CPU / ≤8GB effective | `ggml-small.bin` (Whisper small) | Size rule; sequential with LLM |
| T16 / GPU | `ggml-large-v3-turbo.bin` | Accuracy when budget allows |

**Node binding:** **whisper.cpp CLI sidecar** (not in-process node binding) — matches forced process isolation and avoids `GGML_ASSERT` shared-context deaths.

Bake-off script: `scripts/asr-bakeoff.mjs` (run when binary + 2× KO wav present). Fill table below after first local run.

| Clip | Model | Visual errors | RTF CPU | RTF GPU | Size |
|---|---|---|---|---|---|
| _(pending)_ | small | — | — | — | ~466MB |
| _(pending)_ | large-v3-turbo | — | — | — | ~1.6GB |

### A-2 VAD

- **Required.** Whisper invents speech in silence; assess citation checks only that cited lines exist in the transcript — hallucinated lines pass.
- **v1:** adaptive frame RMS energy VAD (noise-floor × 3.5, absolute floor 0.008) → real `vadApplied` boolean, `vadModel: "energy-rms"`, plus `speechRatio` / `vadThreshold` in provenance.
- **Batch:** trim + pad speech regions for Whisper, then **remap** segment `startMs`/`endMs` onto the source timeline via kept regions.
- **PTT / voice:** analyze-only (`trimVad: false`) — keep source timeline; still gate on `speechRatio` / min speech ms (`ERR_ASR_NO_SPEECH`).
- **Upgrade path:** Silero VAD ONNX (MIT) when pack ships `silero_vad.onnx` — same gate API.
- Assess refuses `vadApplied !== true` at the API boundary (`assertTranscriptAssessable`).
- whisper.cpp JSON `offsets` are milliseconds (never ×1000). Clock-style `timestamps` parsed separately.

### A-3 TTS

- Piper / Kokoro need KO voice packs + extra process; quality unproven here.
- Chromium `speechSynthesis` often routes off-device — **banned** for TTS.
- **Decision: voice mode v1 = speech in, text out.** No TTS process.

### A-4 Speech recognition APIs

- **Default:** live captions ON (browser `SpeechRecognition`) after a **one-time consent popup** on first voice use.
- **Decline / Settings off:** local Whisper via ASR utilityProcess (batch on release).
- Consent: `redrob.webSpeechConsent.v1`; preference: `redrob.webSpeechOptIn.v1` (missing = on).
- Toggle anytime: Settings → Data & privacy.
- `window.SpeechRecognition` stays blocked; live path uses constructors captured at boot (`ban-web-speech.ts`).
- May send audio off-device via OS/browser — disclosed once, then user-controlled.
- No other cloud STT clients. No TTS (`speechSynthesis` banned).

## 3. Phase B — chat

- Local chat goes through **inference utilityProcess** (`hostGenerateChatTurn`).
- Worker keeps `LlamaChatSession` per `sessionId`; only the **new user turn** is prompted after turn 1.
- Context overflow → truncate oldest turns, one re-prefill.
- System prefix fixed (short answers by default).
- Default `maxTokens` 256; UI shows CPU ETA honesty banner.
- No grammar / no SlotFieldSpec on chat.

## 4. Phase C — ASR batch

Pipeline: file → mono 16 kHz PCM → VAD trim → whisper.cpp chunks → `{ lines, provenance }`.
Jobs persist under `userData/asr-jobs/`; resume on restart.
Schema `recruiting/interview-comment` (SlotFieldSpec path) for interviewer self-notes:

| Field | maxChars | Why |
|---|---|---|
| `/candidateName` | 80 | Who the note is about |
| `/recommendation` | 24 | enum-ish free string: advance / hold / reject |
| `/strengths` | 400 | Positive signals |
| `/concerns` | 400 | Risks |
| `/evidenceLineNos` | 80 | Comma-separated line nos for assess |

Consent: `asr-consent.json` + per-job record. Persists the caller's `acknowledgedPlaceholders` bit (never force `true`). `others` and any missing ack reject. Placeholder legal strings — **RELEASE BLOCKER**.

## 5. Phase D — voice mode

Push-to-talk only. Sequential ASR → chat (no concurrent CUDA).  
**Latency budget (estimated until measured; fill after smoke):**

| Segment | CPU est. | GPU est. |
|---|---|---|
| VAD + preprocess (10s) | 50–150ms | 50–150ms |
| ASR small 10s | 3–12s | 0.5–2s |
| Worker cold start | 1–4s | 1–3s |
| Chat TTFT 1.7B/4B | 2–8s | 0.3–1.5s |
| Chat short answer | 15–45s | 2–8s |
| TTS | n/a | n/a |
| **Total** | **often >30s** | **~5–15s** |

**Tier:** Voice mode **GPU-preferred**; on CPU backend show blocking notice (`voice.cpuBlocked`) — do not silently offer a 40s+ loop. Optional override behind explicit “run anyway”.

**RSS:** Sequential only on T8 (LLM ~1.9GB + Electron ~1.5–2GB; ASR concurrent not budgeted).

## 6. Quiet failure → loud

| Event | Code | Surface |
|---|---|---|
| ASR fork → in-process deny | `ERR_ASR_ISOLATION` | Device + warn log (ASR must not share LLM process — **no in-process whisper**) |
| whisper binary missing | `ERR_ASR_BINARY` | Device + UI |
| GPU→CPU inference fallback | existing + `ERR_INFER_CPU_FALLBACK` | Device |
| Chat stream IPC drop | assert chunk reaches renderer in smoke | |

## 7. Closed in this track (prod-risk fixes)

- [x] VAD destructive trim timestamps remapped to source
- [x] whisper `offsets` treated as ms (no heuristic ×1000)
- [x] `vadApplied` / `speechRatio` gate real; `ERR_ASR_NO_SPEECH` on thin speech
- [x] Consent ack bit not forced to `true`
- [x] Dual VAD on voice path removed (worker owns VAD; PTT `trimVad: false`)
- [x] Adaptive RMS threshold; `supportsJson` cached per binary

## 8. Open items

- [ ] Run `scripts/asr-bakeoff.mjs` with 2 KO wavs once whisper.cpp is installed
- [ ] Silero ONNX pack artifact
- [ ] Counsel-final consent copy (**RELEASE BLOCKER**)
- [ ] Optional Piper KO TTS evaluation for v2
- [ ] Align product docs with code tier table (T8→Qwen3.5-4B) without inventing a second ladder
- [ ] Measure voice round-trip on GPU and fill latency table with wall times
- [ ] Confirm chat `textChunk` IPC reaches renderer in packaged build (not only vite)

## 9. Integration checklist (this track)

| Path | Status |
|---|---|
| draftJd / slot-fill / assess / extract (existing four) | Untouched contracts; desk build green |
| Chat incremental session + stream IPC | Implemented (`chatTurn` + `textChunk`) |
| ASR utilityProcess + VAD gate | Implemented; needs whisper-cli + ggml on disk to run live |
| Transcribe UI + consent | Implemented (placeholder legal) |
| Voice PTT | Implemented; CPU blocked by default; text out only |
| Device alerts | `getRuntimeFallbackNotices` → Device page top section + count badge on the Device nav item |
| Boot grammar assert | Includes new `recruiting/interview-comment` via `listSchemaIds` |
