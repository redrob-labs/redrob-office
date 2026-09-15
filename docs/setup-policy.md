# Setup policy (2026-08-05)

## Decision

- Default local pack: **T4**, progressive by role (`text` → `embed` → `rerank`). **No separate VLM pack** — Qwen3 / Qwen3-VL GGUFs are dropped; local text is **Qwen3.5**.
- Tier text ladder: `qwen35-4b-q4` on every tier. 4B is the floor (2026-08-08): a staff turn has to answer inside the typed output contract while carrying a tool schema and its scope, and 2B answers in prose instead, so every turn lands as "Unusable output". Smaller weights already on disk are not used as a substitute - a missing 4B download is reported, not worked around.
- Hosted inference accepts one credential: a Redrob API key issued at
  `https://console.redrob.ai`. Office fixes the OpenAI-compatible base URL to
  `https://console.redrob.ai/api/backend/v1`; vendor BYOK and configurable
  inference server URLs are not product options. The verified Console contract,
  including what it does not accept, is in `docs/console-api.md`.
- **Inference routing** (Settings → Models) applies to chat, drafts, and extract: **Auto (mix)**, **this device only**, or a fixed cloud provider. Cloud field-fill has no logprobs — fields always need review.

## Measured sizes (approx)

- Free disk checked via `systeminformation.fsSize`.
- T4 approximate sizes: text ~2.7 GB (Qwen3.5-4B Q4_K_M) + ~0.7 GB projector, embed ~0.6 GB, rerank ~0.6 GB.
- Brand models root: `%LOCALAPPDATA%/redrob/models` (not `redrob-office`). Paths: `unsloth/Qwen3.5-{0.8,2,4}B-GGUF/Qwen3.5-*-Q4_K_M.gguf`.

## Product notes

Remote mode requires explicit consent and must return token logprobs. Fields without confidence are never shown.
Image / PDF-page vision remains refused until a multimodal path is wired on the same Qwen3.5 GGUF (mmproj not downloaded in v1 packs).
