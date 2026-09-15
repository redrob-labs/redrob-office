/**
 * Local weight size: which GGUF pack this machine loads.
 *
 * `flash` is the small default (Qwen3.5 4B). `pro` is the larger pack (9B).
 * Cloud chat no longer uses these grades — OpenRouter always routes through
 * the single Luna default.
 */
export type ModelGrade = "flash" | "pro";

export const MODEL_GRADES: readonly ModelGrade[] = ["flash", "pro"];

/** The on-device weights behind each grade. */
export const LOCAL_GRADE_MODELS: Readonly<Record<ModelGrade, string>> = {
  flash: "qwen35-4b-q4",
  pro: "qwen35-9b-q4",
};

/**
 * VRAM each grade's weights, its projector and KV headroom want.
 *
 * Under this the model still loads and still runs; it just spills, so this
 * sizes a warning rather than a gate.
 */
export const GRADE_VRAM_MIB: Readonly<Record<ModelGrade, number>> = {
  flash: 8_192,
  pro: 16_384,
};

/** System RAM each grade wants when the weights cannot sit entirely in VRAM. */
export const GRADE_RAM_MB: Readonly<Record<ModelGrade, number>> = {
  flash: 8_000,
  pro: 16_000,
};

export function isModelGrade(value: unknown): value is ModelGrade {
  return value === "flash" || value === "pro";
}

export function parseModelGrade(value: unknown, fallback: ModelGrade = "flash"): ModelGrade {
  return isModelGrade(value) ? value : fallback;
}

export function localModelIdForGrade(grade: ModelGrade): string {
  return LOCAL_GRADE_MODELS[grade];
}

/** Which grade an on-disk artifact id belongs to, for labelling what is running. */
export function gradeOfLocalModel(modelId: string): ModelGrade | null {
  for (const grade of MODEL_GRADES) {
    if (LOCAL_GRADE_MODELS[grade] === modelId) return grade;
  }
  return null;
}

/** True when this machine has the VRAM the grade wants. Unknown counts as yes. */
export function vramMeetsGrade(vramMib: number | null, grade: ModelGrade): boolean {
  return vramMib === null || vramMib >= GRADE_VRAM_MIB[grade];
}

export function readModelGradeFromEnv(): ModelGrade {
  return parseModelGrade(process.env.REDROB_MODEL_GRADE?.trim());
}
