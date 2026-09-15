# Qwen3.5-4B vision A/B — outside Desk

Date: 2026-08-06
Workspace: redrob-office

## Step 1 — matching mmproj
- Repo: `unsloth/Qwen3.5-4B-GGUF` (has `mmproj-BF16.gguf`, `mmproj-F16.gguf`, `mmproj-F32.gguf`)
- Used: `%LOCALAPPDATA%/redrob/models/verify/qwen35-4b-mmproj/mmproj-F16.gguf`
- `clip.vision.projection_dim` = **2560**
- LM `n_embd` / `qwen35.embedding_length` = **2560** → **MATCH**
- `clip.projector_type` = `qwen3vl_merger` (name reused; dim is what matters)
- Old verify `mmproj-F16.gguf` had `projection_dim=2048` (wrong pair) — do not use

## Step 2 — llama-mtmd-cli (no node-llama-cpp, no Desk)
- Tools: `verify-tools/bin/llama-mtmd-cli.exe`, `llama-cli.exe`
- LM: `Qwen3.5-4B-Q4_K_M.gguf`
- Probe token in image: `ZEBRA-7741`

### A — with image + matching mmproj (`a6`)
- Exit 0; generate succeeds after CLIP encode
- Assistant output: **`ZEBRA-7741`**

### B — no image (`b6`, llama-cli text-only; mtmd without `--image` drops into interactive chat)
- Exit 0; does **not** contain `ZEBRA-7741`
- Hallucinates / thinks about a nonexistent image

### Verdict
**Vision is attached.** A/B outputs diverge; A reads the probe token from the image.
