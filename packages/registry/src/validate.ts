/** Constrains field-fill GBNF beyond free `string` char class. */
export type SchemaSemanticType = "email" | "phone" | "list";

export interface SchemaField {
  path: string;
  type: string;
  required: boolean;
  threshold?: number;
  /** Shown in field-fill prompts; optional. */
  description?: string;
  /** Optional semantic fill grammar (email / phone / list). */
  semanticType?: SchemaSemanticType;
}
export interface SchemaDefinition {
  id: string; version: number; locales: string[]; confidenceThreshold: number; fields: SchemaField[];
}
export interface RubricAxis {
  id: string; label: string; range: [number, number]; guidance: string;
}
export interface RubricRule {
  id: string; kind: "deterministic" | "model"; severity: string; implementation?: string; prompt?: string;
}
export interface RubricDefinition {
  id: string; version: number; axes: RubricAxis[]; rules: RubricRule[];
}
export interface TemplateSlot {
  id: string;
  required: boolean;
  description?: string;
  /** Character bound for model fill; token budget is always maxChars*3+2. */
  maxChars?: number;
}
export interface TemplateDefinition {
  id: string; version: number; outputKind: string; slots: TemplateSlot[];
}

function object(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(`${label} must be an object`);
  return value as Record<string, unknown>;
}
function string(value: unknown, label: string): string {
  if (typeof value !== "string" || !value) throw new Error(`${label} must be a non-empty string`);
  return value;
}
function number(value: unknown, label: string): number {
  if (typeof value !== "number" || !Number.isFinite(value)) throw new Error(`${label} must be a finite number`);
  return value;
}
function version(value: unknown): number {
  const result = number(value, "version");
  if (!Number.isInteger(result) || result < 1) throw new Error("version must be a positive integer");
  return result;
}
function id(value: unknown): string {
  const result = string(value, "id");
  if (!/^[a-z]+\/[a-z0-9.-]+$/.test(result)) throw new Error("id must be namespaced");
  return result;
}

export function validateSchema(value: unknown): SchemaDefinition {
  const entry = object(value, "schema");
  const threshold = number(entry.confidenceThreshold, "confidenceThreshold");
  if (threshold < 0 || threshold > 1) throw new Error("confidenceThreshold must be between 0 and 1");
  if (!Array.isArray(entry.locales) || !entry.locales.every((locale) => typeof locale === "string")) throw new Error("locales must be strings");
  if (!Array.isArray(entry.fields) || entry.fields.length === 0) throw new Error("fields must be a non-empty array");
  return {
    id: id(entry.id), version: version(entry.version), locales: entry.locales as string[], confidenceThreshold: threshold,
    fields: entry.fields.map((value) => {
      const field = object(value, "field");
      const fieldThreshold = field.threshold === undefined ? undefined : number(field.threshold, "field threshold");
      if (fieldThreshold !== undefined && (fieldThreshold < 0 || fieldThreshold > 1)) throw new Error("field threshold must be between 0 and 1");
      const description =
        field.description === undefined ? undefined : string(field.description, "field description");
      let semanticType: SchemaSemanticType | undefined;
      if (field.semanticType !== undefined) {
        const st = string(field.semanticType, "field semanticType");
        if (st !== "email" && st !== "phone" && st !== "list") {
          throw new Error(`field semanticType must be email|phone|list, got ${st}`);
        }
        semanticType = st;
      }
      return {
        path: string(field.path, "field path"),
        type: string(field.type, "field type"),
        required: field.required === true,
        ...(fieldThreshold === undefined ? {} : { threshold: fieldThreshold }),
        ...(description === undefined ? {} : { description }),
        ...(semanticType === undefined ? {} : { semanticType }),
      };
    }),
  };
}

export function validateRubric(value: unknown): RubricDefinition {
  const entry = object(value, "rubric");
  if (!Array.isArray(entry.axes) || !Array.isArray(entry.rules)) throw new Error("rubric axes and rules must be arrays");
  return {
    id: id(entry.id), version: version(entry.version),
    axes: entry.axes.map((value) => {
      const axis = object(value, "axis");
      if (!Array.isArray(axis.range) || axis.range.length !== 2) throw new Error("axis range must contain two numbers");
      return { id: string(axis.id, "axis id"), label: string(axis.label, "axis label"), range: [number(axis.range[0], "axis range"), number(axis.range[1], "axis range")], guidance: string(axis.guidance, "axis guidance") };
    }),
    rules: entry.rules.map((value) => {
      const rule = object(value, "rule");
      const kind = string(rule.kind, "rule kind");
      if (kind !== "deterministic" && kind !== "model") throw new Error("rule kind must be deterministic or model");
      const implementation = rule.implementation === undefined ? undefined : string(rule.implementation, "implementation");
      const prompt = rule.prompt === undefined ? undefined : string(rule.prompt, "prompt");
      if ((kind === "deterministic" && !implementation) || (kind === "model" && !prompt)) throw new Error(`rule ${String(rule.id)} is missing its ${kind} definition`);
      return { id: string(rule.id, "rule id"), kind, severity: string(rule.severity, "severity"), ...(implementation ? { implementation } : {}), ...(prompt ? { prompt } : {}) };
    }),
  };
}

export function validateTemplate(value: unknown): TemplateDefinition {
  const entry = object(value, "template");
  if (!Array.isArray(entry.slots)) throw new Error("template slots must be an array");
  return {
    id: id(entry.id), version: version(entry.version), outputKind: string(entry.outputKind, "outputKind"),
    slots: entry.slots.map((value) => {
      const slot = object(value, "slot");
      const description = slot.description === undefined ? undefined : string(slot.description, "slot description");
      if (slot.maxTokens !== undefined) {
        throw new Error(
          `slot ${String(slot.id)}: maxTokens is forbidden; set maxChars (budget = maxChars*3+2)`,
        );
      }
      const maxChars =
        slot.maxChars === undefined ? undefined : number(slot.maxChars, "slot maxChars");
      if (maxChars !== undefined && (!Number.isInteger(maxChars) || maxChars < 1)) {
        throw new Error(`slot ${String(slot.id)}: maxChars must be a positive integer`);
      }
      return {
        id: string(slot.id, "slot id"),
        required: slot.required === true,
        ...(description ? { description } : {}),
        ...(maxChars !== undefined ? { maxChars } : {}),
      };
    }),
  };
}
