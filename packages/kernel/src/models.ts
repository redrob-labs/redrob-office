export type ModelRole = "embed" | "rerank" | "text";

export interface ModelArtifact {
  id: string;
  role: ModelRole;
  hfRepo: string;
  hfFile: string;
  mmprojFile?: string;
  /**
   * Alternate weights for the OpenVINO backend. NPU runs stateless mode only and
   * its primary quantization is Q4_0, so that tier needs a different file from
   * the Q4_K_M every other backend uses — not a re-quantization of the same one.
   */
  openvinoFile?: string;
  license: "Apache-2.0";
  specQuantMismatch?: boolean;
}

/**
 * Text and vision are one Qwen3.5 LM per grade (flash → 4B, pro
 * → 9B) loaded by a single llama-server instance: `-m <text>` plus `--mmproj`
 * from the same repo. Embed/rerank remain Qwen3 — different roles, not the
 * chat/field-fill LM, and still sized by memory tier.
 *
 * The OpenVINO backend cannot run the projector, so it downloads `openvinoFile`
 * (Q4_0, the NPU stateless-mode quant) instead of `hfFile` and skips `mmprojFile`.
 */
export const MODEL_ARTIFACTS: Record<string, ModelArtifact> = {
  "qwen3-embedding-0.6b": {
    id: "qwen3-embedding-0.6b",
    role: "embed",
    hfRepo: "Qwen/Qwen3-Embedding-0.6B-GGUF",
    hfFile: "Qwen3-Embedding-0.6B-Q8_0.gguf",
    license: "Apache-2.0",
  },
  "qwen3-embedding-4b": {
    id: "qwen3-embedding-4b",
    role: "embed",
    hfRepo: "Qwen/Qwen3-Embedding-4B-GGUF",
    hfFile: "Qwen3-Embedding-4B-Q4_K_M.gguf",
    license: "Apache-2.0",
  },
  "qwen3-embedding-8b": {
    id: "qwen3-embedding-8b",
    role: "embed",
    hfRepo: "Qwen/Qwen3-Embedding-8B-GGUF",
    hfFile: "Qwen3-Embedding-8B-Q4_K_M.gguf",
    license: "Apache-2.0",
  },
  "qwen3-reranker-0.6b": {
    id: "qwen3-reranker-0.6b",
    role: "rerank",
    hfRepo: "ggml-org/Qwen3-Reranker-0.6B-Q8_0-GGUF",
    hfFile: "qwen3-reranker-0.6b-q8_0.gguf",
    license: "Apache-2.0",
  },
  "qwen3-reranker-4b": {
    id: "qwen3-reranker-4b",
    role: "rerank",
    hfRepo: "Voodisss/Qwen3-Reranker-4B-GGUF-llama_cpp",
    hfFile: "Qwen3-Reranker-4B-Q4_K_M.gguf",
    license: "Apache-2.0",
  },
  "qwen35-2b-q4": {
    id: "qwen35-2b-q4",
    role: "text",
    hfRepo: "unsloth/Qwen3.5-2B-GGUF",
    hfFile: "Qwen3.5-2B-Q4_K_M.gguf",
    mmprojFile: "mmproj-F16.gguf",
    openvinoFile: "Qwen3.5-2B-Q4_0.gguf",
    license: "Apache-2.0",
  },
  "qwen35-4b-q4": {
    id: "qwen35-4b-q4",
    role: "text",
    hfRepo: "unsloth/Qwen3.5-4B-GGUF",
    hfFile: "Qwen3.5-4B-Q4_K_M.gguf",
    mmprojFile: "mmproj-F16.gguf",
    openvinoFile: "Qwen3.5-4B-Q4_0.gguf",
    license: "Apache-2.0",
  },
  "qwen35-9b-q4": {
    id: "qwen35-9b-q4",
    role: "text",
    hfRepo: "unsloth/Qwen3.5-9B-GGUF",
    hfFile: "Qwen3.5-9B-Q4_K_M.gguf",
    mmprojFile: "mmproj-F16.gguf",
    openvinoFile: "Qwen3.5-9B-Q4_0.gguf",
    license: "Apache-2.0",
  },
};
