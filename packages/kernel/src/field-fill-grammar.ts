/** Default absent sentinel — fixed to ASCII "N/A" (never "-"). */
export const ABSENT_TOKEN = "N/A";

/**
 * Absent sentinel used in GBNF / prompts / parse.
 * Default is "N/A". Override only for verify sweeps via REDROB_ABSENT_TOKEN.
 * Do not use "-" (hallucination spike in verify sweeps).
 */
export function getAbsentToken(): string {
  const fromEnv = process.env.REDROB_ABSENT_TOKEN;
  if (fromEnv !== undefined && fromEnv.length > 0) return fromEnv;
  return ABSENT_TOKEN;
}

/** Abort decode after this many consecutive whitespace-only tokens. */
export const WHITESPACE_RUN_LIMIT = 8;

/**
 * Advance whitespace-run counter. Throws grammar_fail when over limit.
 * Returns 0 when token is non-whitespace.
 */
export function advanceWhitespaceRun(
  run: number,
  text: string,
  limit: number = WHITESPACE_RUN_LIMIT,
): number {
  if (!/^\s+$/.test(text)) return 0;
  const next = run + 1;
  if (next > limit) {
    throw new Error(`grammar_fail: whitespace run > ${limit} tokens`);
  }
  return next;
}

export type FillableFieldType =
  | "string"
  | "integer"
  | "number"
  | "boolean"
  | "date"
  | "lineRefs";

/** Semantic fill grammar; values still parse as strings. */
export type FieldSemanticType = "email" | "phone" | "list";

export interface FillableField {
  path: string;
  type: FillableFieldType;
  required: boolean;
  /** Shown to the model; defaults to the leaf name. */
  description?: string;
  /** Label written before the value; defaults to path leaf. */
  label?: string;
  /** When set, value grammar is an enum of these integers (plus absent). */
  enumValues?: readonly number[];
  /** When set, value grammar is an enum of these strings (plus absent). */
  stringChoices?: readonly string[];
  /** Constrains GBNF beyond free-string char class (email / phone / list). */
  semanticType?: FieldSemanticType;
  /** Per-field decode budget (tokens). */
  maxTokens?: number;
  /**
   * Char / saturation bound for string-like values.
   * Hitting this length without an earlier voluntary stop → grammar_fail.
   * Invariant: budget >= maxChars * WORST_TOKENS_PER_CHAR + NL_TOKEN_SLACK.
   */
  maxChars?: number;
  /**
   * Integer GBNF digit bound (`[0-9]{1,M}`).
   * Invariant: budget >= maxDigits + NL_TOKEN_SLACK (ASCII digits).
   */
  maxDigits?: number;
}

/**
 * Choice A (IN22 script expansion, measured 2026-08-05):
 * `scripts/measure-tok-per-char.mjs` covers ASCII, Hangul, and IN22-oriented
 * Indic blocks (Devanagari, Bengali, Gurmukhi, Gujarati, Odia, Tamil, Telugu,
 * Kannada, Malayalam, Sinhala, Arabic/Urdu, Meitei Mayek, Ol Chiki).
 * Peak fertility = 3 (Hangul on Qwen3.5; Odia on 1.7B; Meitei/Ol Chiki).
 * Use measured ceil — not Choice B's flat 5 — because budget scales with
 * maxChars and 3 is the observed ceiling across that set.
 */
export const WORST_TOKENS_PER_CHAR = 3;

/** Slack tokens reserved so terminating newline can still be emitted. */
export const NL_TOKEN_SLACK = 2;

/** Default free-string char bound when unset. */
export const DEFAULT_STRING_MAX_CHARS = 48;

/** Default integer digit bound when unset. */
export const DEFAULT_INTEGER_MAX_DIGITS = 10;

export function minBudgetForCharBound(maxChars: number): number {
  return maxChars * WORST_TOKENS_PER_CHAR + NL_TOKEN_SLACK;
}

export function minBudgetForDigitBound(maxDigits: number): number {
  // ASCII digits tokenize 1:1 on verify models; + slack for nl.
  return maxDigits + NL_TOKEN_SLACK;
}

/** Largest maxChars that still fits in a token budget under the worst-case coeff. */
export function maxCharsForTokenBudget(budget: number): number {
  return Math.floor((budget - NL_TOKEN_SLACK) / WORST_TOKENS_PER_CHAR);
}

function fieldLabel(path: string): string {
  const segments = path.split("/").filter(Boolean);
  const leaf = segments[segments.length - 1] ?? path;
  return leaf.replaceAll("~1", "/").replaceAll("~0", "~");
}

/** Human label written by us before the model decodes a value. */
export function fillLabel(field: FillableField): string {
  return field.label?.trim() || fieldLabel(field.path);
}

/**
 * Char bound for string-like fields (free string + semantic email/phone/list),
 * or null when the field has no open char / saturation bound (non-string, enums, choices).
 */
export function stringCharBound(field: FillableField): number | null {
  if (field.type !== "string") return null;
  if (field.stringChoices && field.stringChoices.length > 0) return null;
  if (field.maxChars !== undefined) return field.maxChars;
  return DEFAULT_STRING_MAX_CHARS;
}

/**
 * True when decoded value length reached maxChars — treat as truncate, not a value.
 * Applies to every string-like field that carries a char bound (type-agnostic safety).
 */
export function isMaxCharsSaturated(
  field: FillableField,
  valueText: string,
): boolean {
  const bound = stringCharBound(field);
  if (bound === null) return false;
  if (valueText === getAbsentToken() || valueText.length === 0) return false;
  return valueText.length >= bound;
}

/** Digit bound for free integer GBNF, or null when not applicable. */
export function integerDigitBound(field: FillableField): number | null {
  if (field.type !== "integer") return null;
  if (field.enumValues && field.enumValues.length > 0) return null;
  if (field.maxDigits !== undefined) return field.maxDigits;
  return DEFAULT_INTEGER_MAX_DIGITS;
}

/** Default token budget when field.maxTokens is unset (must match fill()). */
export function defaultMaxTokensForField(field: FillableField): number {
  if (field.stringChoices && field.stringChoices.length > 0) {
    const longest = field.stringChoices.reduce((n, s) => Math.max(n, s.length), 0);
    return Math.min(96, Math.max(8, longest + 2));
  }
  if (field.enumValues && field.enumValues.length > 0) return 4;
  if (field.type === "boolean") return 4;
  if (field.type === "lineRefs") return 12;
  if (field.type === "date") return 12;
  if (field.type === "number") return 16;
  if (field.type === "integer") {
    const digits = integerDigitBound(field) ?? DEFAULT_INTEGER_MAX_DIGITS;
    return minBudgetForDigitBound(digits);
  }
  const bound = stringCharBound(field);
  if (bound !== null) return minBudgetForCharBound(bound);
  return minBudgetForCharBound(DEFAULT_STRING_MAX_CHARS);
}

export function maxTokensForField(
  field: FillableField,
  override?: number,
): number {
  if (override !== undefined) return override;
  if (field.maxTokens !== undefined) return field.maxTokens;
  return defaultMaxTokensForField(field);
}

/**
 * Boot invariant:
 * - free string: budget >= maxChars * WORST_TOKENS_PER_CHAR + NL_TOKEN_SLACK
 * - free integer: budget >= maxDigits + NL_TOKEN_SLACK
 */
export function assertFieldBudgetInvariant(field: FillableField): void {
  const budget = maxTokensForField(field);

  const charBound = stringCharBound(field);
  if (charBound !== null) {
    if (charBound < 1) {
      throw new Error(
        `field budget invariant violated: ${field.path} maxChars=${charBound} (must be >= 1)`,
      );
    }
    const need = minBudgetForCharBound(charBound);
    if (budget < need) {
      throw new Error(
        `field budget invariant violated: ${field.path} budget=${budget} < maxChars*${WORST_TOKENS_PER_CHAR}+${NL_TOKEN_SLACK}=${need} (maxChars=${charBound})`,
      );
    }
  }

  const digitBound = integerDigitBound(field);
  if (digitBound !== null) {
    if (digitBound < 1) {
      throw new Error(
        `field budget invariant violated: ${field.path} maxDigits=${digitBound} (must be >= 1)`,
      );
    }
    const need = minBudgetForDigitBound(digitBound);
    if (budget < need) {
      throw new Error(
        `field budget invariant violated: ${field.path} budget=${budget} < maxDigits+${NL_TOKEN_SLACK}=${need} (maxDigits=${digitBound})`,
      );
    }
  }
}

export function assertFieldsBudgetInvariant(
  fields: readonly FillableField[],
): void {
  for (const field of fields) assertFieldBudgetInvariant(field);
}

/**
 * Path-based string bounds when the slot/schema does not set maxChars.
 * No semantic (email/phone/list) GBNF — termination is JS stop triggers + trim.
 */
function stringDefaultsForPath(path: string): {
  maxChars: number;
  maxTokens: number;
} {
  const leaf = fieldLabel(path).toLowerCase();
  if (leaf === "name" || leaf.endsWith("name")) {
    const maxChars = 48;
    return { maxChars, maxTokens: minBudgetForCharBound(maxChars) };
  }
  if (leaf === "email" || leaf.endsWith("email")) {
    const maxChars = 64;
    return { maxChars, maxTokens: minBudgetForCharBound(maxChars) };
  }
  if (leaf === "phone" || leaf.endsWith("phone")) {
    const maxChars = 32;
    return { maxChars, maxTokens: minBudgetForCharBound(maxChars) };
  }
  if (leaf === "skills" || leaf === "skill") {
    const maxChars = 64;
    return { maxChars, maxTokens: minBudgetForCharBound(maxChars) };
  }
  const maxChars = DEFAULT_STRING_MAX_CHARS;
  return { maxChars, maxTokens: minBudgetForCharBound(maxChars) };
}

function integerDefaultsForPath(path: string): {
  maxDigits: number;
  maxTokens: number;
} {
  const leaf = fieldLabel(path).toLowerCase();
  if (leaf.includes("month") || leaf === "totalexperiencemonths") {
    const maxDigits = 4;
    return { maxDigits, maxTokens: minBudgetForDigitBound(maxDigits) };
  }
  const maxDigits = DEFAULT_INTEGER_MAX_DIGITS;
  return { maxDigits, maxTokens: minBudgetForDigitBound(maxDigits) };
}

function commonRules(): string[] {
  return ["nl ::= [\\n]"];
}

/**
 * Per-field GBNF. Grammar only restricts token type space:
 * absent sentinel, digit/enum/boolean/date/lineRefs, or free char{1,N}.
 * Termination, label bleed trim, and alignment are JS stop triggers — not GBNF.
 */
export function fieldValueToGbnf(field: FillableField): string {
  const absent = JSON.stringify(getAbsentToken());
  const common = commonRules();

  if (field.stringChoices && field.stringChoices.length > 0) {
    const alts = field.stringChoices.map((value) => JSON.stringify(value)).join(" | ");
    return [
      `root ::= absent nl | choice nl`,
      `absent ::= ${absent}`,
      `choice ::= ${alts}`,
      ...common,
    ].join("\n");
  }

  if (field.enumValues && field.enumValues.length > 0) {
    const alts = field.enumValues.map((value) => `"${value}"`).join(" | ");
    return [
      `root ::= absent nl | enum nl`,
      `absent ::= ${absent}`,
      `enum ::= ${alts}`,
      ...common,
    ].join("\n");
  }

  if (field.type === "lineRefs") {
    return [
      `root ::= absent nl | refs nl`,
      `absent ::= ${absent}`,
      'refs ::= int ("," int){0,2}',
      'int ::= [1-9] [0-9]{0,3}',
      ...common,
    ].join("\n");
  }

  if (field.type === "boolean") {
    return [
      `root ::= absent nl | boolean nl`,
      `absent ::= ${absent}`,
      'boolean ::= "true" | "false"',
      ...common,
    ].join("\n");
  }

  if (field.type === "integer") {
    const m = integerDigitBound(field) ?? DEFAULT_INTEGER_MAX_DIGITS;
    return [
      `root ::= absent nl | integer nl`,
      `absent ::= ${absent}`,
      `integer ::= "-"? [0-9]{1,${m}}`,
      ...common,
    ].join("\n");
  }

  if (field.type === "number") {
    return [
      `root ::= absent nl | number nl`,
      `absent ::= ${absent}`,
      'integer ::= "-"? [0-9]{1,16}',
      'number ::= integer ("." [0-9]{1,8})? ([eE] [+-]? [0-9]{1,4})?',
      ...common,
    ].join("\n");
  }

  if (field.type === "date") {
    return [
      `root ::= absent nl | date nl`,
      `absent ::= ${absent}`,
      "date ::= iso | dotted | compact",
      'iso ::= digit digit digit digit "-" digit digit "-" digit digit',
      'dotted ::= digit digit digit digit "." digit digit "." digit digit',
      "compact ::= digit digit digit digit digit digit digit digit",
      "digit ::= [0-9]",
      ...common,
    ].join("\n");
  }

  // Free string (including former email/phone/list): char class only.
  const n = stringCharBound(field) ?? DEFAULT_STRING_MAX_CHARS;
  return [
    `root ::= absent nl | text nl`,
    `absent ::= ${absent}`,
    `text ::= char{1,${n}}`,
    "char ::= [^\\n\\r]",
    ...common,
  ].join("\n");
}

/**
 * Contiguous substrings of cited line text for quote extraction grammar.
 * Longer slices first; capped so GBNF stays tractable.
 */
export function quoteSubstringChoices(
  lineTexts: readonly string[],
  options?: { minLen?: number; maxLen?: number; maxCount?: number },
): string[] {
  const minLen = options?.minLen ?? 2;
  const maxLen = options?.maxLen ?? 48;
  const maxCount = options?.maxCount ?? 96;
  const seen = new Set<string>();
  const out: string[] = [];

  const push = (s: string) => {
    const t = s.trim();
    if (t.length < minLen || seen.has(t)) return;
    if (!/\S/.test(t)) return;
    seen.add(t);
    out.push(t);
  };

  for (const raw of lineTexts) {
    const line = raw.trim();
    if (!line) continue;
    push(line.length > maxLen ? line.slice(0, maxLen) : line);
  }

  for (const raw of lineTexts) {
    const line = raw.trim();
    if (!line) continue;
    const n = Math.min(line.length, maxLen);
    for (let len = n; len >= minLen && out.length < maxCount; len -= 1) {
      for (let i = 0; i + len <= line.length && out.length < maxCount; i += 1) {
        push(line.slice(i, i + len));
      }
    }
  }

  return out.slice(0, maxCount);
}

function parseLineRefs(trimmed: string): number[] {
  const parts = trimmed.split(",").map((part) => part.trim()).filter(Boolean);
  if (parts.length < 1 || parts.length > 3) {
    throw new Error(`invalid lineRefs (need 1–3): ${trimmed}`);
  }
  return parts.map((part) => {
    if (!/^[1-9]\d{0,3}$/.test(part)) throw new Error(`invalid line number: ${part}`);
    return Number.parseInt(part, 10);
  });
}

/** Deterministic parse of one field line (no model). */
export function parseFieldValue(
  field: FillableField,
  raw: string,
): { value: unknown; absent: boolean } {
  const trimmed = raw.replace(/\r?\n$/g, "").trim();
  if (trimmed === getAbsentToken() || trimmed === "") {
    return { value: null, absent: true };
  }

  if (field.stringChoices && field.stringChoices.length > 0) {
    if (!field.stringChoices.includes(trimmed)) {
      throw new Error(`invalid string choice: ${trimmed}`);
    }
    return { value: trimmed, absent: false };
  }

  if (field.enumValues && field.enumValues.length > 0) {
    const n = Number.parseInt(trimmed, 10);
    if (!field.enumValues.includes(n)) {
      throw new Error(`invalid enum value: ${trimmed}`);
    }
    return { value: n, absent: false };
  }

  if (field.type === "lineRefs") {
    return { value: parseLineRefs(trimmed), absent: false };
  }

  if (field.type === "boolean") {
    if (trimmed === "true") return { value: true, absent: false };
    if (trimmed === "false") return { value: false, absent: false };
    throw new Error(`invalid boolean field value: ${trimmed}`);
  }
  if (field.type === "integer") {
    if (!/^-?\d+$/.test(trimmed)) throw new Error(`invalid integer field value: ${trimmed}`);
    const digits = integerDigitBound(field);
    const abs = trimmed.startsWith("-") ? trimmed.slice(1) : trimmed;
    if (digits !== null && abs.length > digits) {
      throw new Error(`invalid integer field value (max ${digits} digits): ${trimmed}`);
    }
    return { value: Number.parseInt(trimmed, 10), absent: false };
  }
  if (field.type === "number") {
    const n = Number(trimmed);
    if (!Number.isFinite(n)) throw new Error(`invalid number field value: ${trimmed}`);
    return { value: n, absent: false };
  }
  if (field.type === "date") {
    if (
      !/^\d{4}-\d{2}-\d{2}$/.test(trimmed) &&
      !/^\d{4}\.\d{2}\.\d{2}$/.test(trimmed) &&
      !/^\d{8}$/.test(trimmed)
    ) {
      throw new Error(`invalid date field value: ${trimmed}`);
    }
    return { value: trimmed, absent: false };
  }

  // string (and former email/phone/list semantics): accept trimmed text as-is.
  return { value: trimmed, absent: false };
}

export function describeFillField(field: FillableField): string {
  return field.description?.trim() || fillLabel(field);
}

/**
 * Decode stop triggers: newline, tab, and other field-label prefixes
 * (`label`, `label:`, `label: `, and ≥8-char prefixes for bleeds like `totalExper`).
 */
export function fieldFillStopTriggers(
  currentLabel: string,
  labels: readonly string[],
): string[] {
  const triggers = new Set<string>(["\n", "\r", "\t"]);
  for (const label of labels) {
    if (!label || label === currentLabel) continue;
    triggers.add(`${label}: `);
    triggers.add(`${label}:`);
    triggers.add(label);
    for (let n = Math.min(label.length - 1, 16); n >= 8; n -= 1) {
      triggers.add(label.slice(0, n));
    }
  }
  // Longest first so "phone: " wins over "phone" when both match as suffixes.
  return [...triggers].sort((a, b) => b.length - a.length);
}

export type LabelStopHit = {
  /** Index in the accumulated raw buffer where the trigger begins. */
  index: number;
  trigger: string;
  /** True for tab / other non-label cuts that are not a following field name. */
  isTab: boolean;
};

/**
 * Incremental label-stop scanner: only tests suffixes after each append
 * (does not re-scan the full buffer for every trigger from index 0).
 */
export class IncrementalLabelStopScanner {
  private readonly triggers: readonly string[];
  private readonly maxTriggerLen: number;
  private buf = "";

  constructor(currentLabel: string, labels: readonly string[]) {
    this.triggers = fieldFillStopTriggers(currentLabel, labels).filter(
      (t) => t !== "\n" && t !== "\r",
    );
    this.maxTriggerLen = this.triggers.reduce((m, t) => Math.max(m, t.length), 0);
  }

  get buffer(): string {
    return this.buf;
  }

  /** Append one newly detokenized piece; return hit if a trigger is now a suffix. */
  push(text: string): LabelStopHit | null {
    if (!text) return null;
    this.buf += text;
    if (this.buf.endsWith("\t") || text.includes("\t")) {
      const index = this.buf.indexOf("\t");
      return { index, trigger: "\t", isTab: true };
    }
    // A trigger that completes on this append must be a suffix of buf.
    // Only suffixes up to maxTriggerLen can be new matches.
    const start = Math.max(0, this.buf.length - this.maxTriggerLen);
    const suffixWindow = this.buf.slice(start);
    for (const trigger of this.triggers) {
      if (trigger === "\t") continue;
      if (this.buf.endsWith(trigger)) {
        return {
          index: this.buf.length - trigger.length,
          trigger,
          isTab: false,
        };
      }
      // Trigger wholly inside the new window but not only as full-buf suffix —
      // e.g. value+"phone"+"extra" shouldn't happen mid-token often; endsWith covers token boundary.
      const rel = suffixWindow.lastIndexOf(trigger);
      if (rel !== -1 && start + rel + trigger.length === this.buf.length) {
        return { index: start + rel, trigger, isTab: false };
      }
    }
    return null;
  }

  truncateTo(index: number): void {
    this.buf = this.buf.slice(0, index);
  }
}

/** Earliest index in `raw` where a non-newline stop trigger begins, or -1. */
export function indexOfStopTrigger(
  raw: string,
  currentLabel: string,
  labels: readonly string[],
): number {
  const scanner = new IncrementalLabelStopScanner(currentLabel, labels);
  const hit = scanner.push(raw);
  return hit ? hit.index : -1;
}

function isDatePath(path: string): boolean {
  const leaf = fieldLabel(path);
  return /date$/i.test(leaf) || /^date/i.test(leaf);
}

function toFillableType(type: string, path: string): FillableFieldType | null {
  if (type === "date") return "date";
  if (type === "string" && isDatePath(path)) return "date";
  if (type === "string" || type === "integer" || type === "number" || type === "boolean") {
    return type;
  }
  if (type === "array") return "string";
  return null;
}

/** Map schema fields into fillable fields (arrays coerced to string). */
export function schemaFieldsToFillable(
  fields: ReadonlyArray<{
    path: string;
    type: string;
    required: boolean;
    description?: string;
    semanticType?: FieldSemanticType | string;
  }>,
): FillableField[] {
  const out = fields.flatMap((field) => {
    const type = toFillableType(field.type, field.path);
    if (!type) return [];
    const base: FillableField = {
      path: field.path,
      type,
      required: field.required,
      ...(field.description ? { description: field.description } : {}),
    };
    if (type === "string") {
      const defaults = stringDefaultsForPath(field.path);
      base.maxChars = defaults.maxChars;
      base.maxTokens = defaults.maxTokens;
    }
    if (type === "integer") {
      const defaults = integerDefaultsForPath(field.path);
      base.maxDigits = defaults.maxDigits;
      base.maxTokens = defaults.maxTokens;
    }
    return [base];
  });
  assertFieldsBudgetInvariant(out);
  return out;
}
