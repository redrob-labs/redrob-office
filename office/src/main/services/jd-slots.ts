/**
 * Model-filled JD slots as SlotFieldSpec (shared with extract/assess/template).
 * Boilerplate (benefits / conditions / apply / about) is assembled in code.
 *
 * maxChars only — token budget is always derived as maxChars*3+2.
 * Bounds are sized for English JD copy (Korean/Indic scripts need fewer glyphs
 * for the same meaning, so English is the tighter baseline).
 */
import {
  draftSlotCompileHints,
  draftSlotToSpec,
  type SlotFieldCompileHints,
  type SlotFieldSpec,
} from "@redrob/kernel";

export interface JdSlotDef {
  id: string;
  description: string;
  /** Character bound (GBNF char{1,N}); not a token budget. */
  maxChars: number;
  required: boolean;
}

/**
 * Rationale (English baselines, medium length):
 * - roleTitle 80: title + level/org suffix
 * - oneLiner 240: 1–2 product sentences
 * - responsibilities / qualifications 700: ~10–14 bullets
 * - niceToHave 360: optional bullet list
 * - location 100: city + hybrid detail
 * - teamContext 240: team/product paragraph
 *
 * UI length (maxTokens 256/512/1024) scales these by 1 / 1.25 / 1.5.
 */
export const JD_MODEL_SLOTS: readonly JdSlotDef[] = [
  {
    id: "roleTitle",
    description: "Job title only (one short line)",
    maxChars: 80,
    required: true,
  },
  {
    id: "oneLiner",
    description: "One or two sentences summarizing the role and product impact",
    maxChars: 240,
    required: true,
  },
  {
    id: "responsibilities",
    description: "Bullet list of primary responsibilities (use - lines; expand brief notes into several concrete bullets)",
    maxChars: 700,
    required: true,
  },
  {
    id: "qualifications",
    description: "Bullet list of required qualifications (use - lines; expand brief notes into several concrete bullets)",
    maxChars: 700,
    required: true,
  },
  {
    id: "niceToHave",
    description: "Optional nice-to-have skills (use - lines), or 없음",
    maxChars: 360,
    required: false,
  },
  {
    id: "location",
    description: "Work location one line, or 없음",
    maxChars: 100,
    required: false,
  },
  {
    id: "teamContext",
    description: "A short paragraph about the team or product context, or 없음",
    maxChars: 240,
    required: false,
  },
];

/** Map JdPanel length control (token hint) onto slot char bounds. */
export function jdLengthScale(maxTokens?: number): number {
  if (maxTokens != null && maxTokens >= 1024) return 1.5;
  if (maxTokens != null && maxTokens >= 512) return 1.25;
  return 1;
}

export function scaledJdSlots(maxTokens?: number): JdSlotDef[] {
  const scale = jdLengthScale(maxTokens);
  if (scale === 1) return [...JD_MODEL_SLOTS];
  return JD_MODEL_SLOTS.map((slot) => ({
    ...slot,
    maxChars: Math.max(1, Math.round(slot.maxChars * scale)),
  }));
}

export function jdSlotsAsSpecs(
  slots: readonly JdSlotDef[] = JD_MODEL_SLOTS,
): { specs: SlotFieldSpec[]; hints: Record<string, SlotFieldCompileHints> } {
  const specs = slots.map((slot) => draftSlotToSpec(slot));
  const hints: Record<string, SlotFieldCompileHints> = {};
  for (const slot of slots) {
    hints[slot.id] = draftSlotCompileHints(slot);
  }
  return { specs, hints };
}
