import { createHash } from "node:crypto";

import {
  fieldValueToGbnf,
  type FillableField,
} from "../field-fill-grammar.js";

/** Universal grammar-level stops; label bleed is handled in the decode loop. */
export const CACHED_GRAMMAR_STOP_TRIGGERS = Object.freeze(["\n", "\r", "\t"]);

export function hashDocument(document: string): string {
  return createHash("sha256").update(document, "utf8").digest("hex").slice(0, 16);
}

/**
 * Cache key for LlamaGrammar objects.
 * Static: type + bounds + enum/semantic (+ absent).
 * Dynamic (stringChoices): document hash + choices fingerprint.
 */
export function grammarCacheKey(
  field: FillableField,
  documentHash: string,
): string {
  const absent = process.env.REDROB_ABSENT_TOKEN ?? "N/A";
  if (field.stringChoices && field.stringChoices.length > 0) {
    const choicesHash = createHash("sha256")
      .update(field.stringChoices.join("\0"), "utf8")
      .digest("hex")
      .slice(0, 16);
    return `dyn|doc=${documentHash}|choices=${choicesHash}|absent=${absent}`;
  }

  const enumPart =
    field.enumValues && field.enumValues.length > 0
      ? `enum=${field.enumValues.join(",")}`
      : "enum=";
  const bounds = [
    `type=${field.type}`,
    `sem=${field.semanticType ?? ""}`,
    `maxChars=${field.maxChars ?? ""}`,
    `maxDigits=${field.maxDigits ?? ""}`,
    enumPart,
    `absent=${absent}`,
  ].join("|");
  return `static|${bounds}`;
}

export type GrammarFactory = (options: {
  grammar: string;
  stopGenerationTriggers: readonly string[];
}) => Promise<unknown> | unknown;

/**
 * Session-scoped LlamaGrammar cache. Evaluation state stays per-fill
 * (stateful); only the compiled grammar object is reused.
 */
export class FieldFillGrammarCache {
  private readonly cache = new Map<string, unknown>();
  private readonly documentHash: string;
  private hits = 0;
  private misses = 0;

  constructor(document: string) {
    this.documentHash = hashDocument(document);
  }

  get stats(): { hits: number; misses: number; size: number } {
    return { hits: this.hits, misses: this.misses, size: this.cache.size };
  }

  async getOrCreate(
    field: FillableField,
    createGrammar: GrammarFactory,
  ): Promise<unknown> {
    const key = grammarCacheKey(field, this.documentHash);
    const hit = this.cache.get(key);
    if (hit !== undefined) {
      this.hits += 1;
      return hit;
    }
    const gbnf = fieldValueToGbnf(field);
    let grammar: unknown;
    try {
      grammar = await createGrammar({
        grammar: gbnf,
        stopGenerationTriggers: CACHED_GRAMMAR_STOP_TRIGGERS,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(
        `grammar compile failed for ${field.path} (key=${key}): ${message}\nGBNF:\n${gbnf}`,
      );
    }
    this.cache.set(key, grammar);
    this.misses += 1;
    return grammar;
  }

  /**
   * Compile every field grammar now (boot / session open). Throws on first failure.
   * Same layer as budget invariant — never wait until fill() to discover bad GBNF.
   */
  async precompileAll(
    fields: readonly FillableField[],
    createGrammar: GrammarFactory,
  ): Promise<void> {
    for (const field of fields) {
      await this.getOrCreate(field, createGrammar);
    }
  }
}
