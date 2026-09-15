import type { TemplateDefinition, TemplateSlot } from "@redrob/registry";

export interface FilledSlot {
  id: string;
  label: string;
  value: string;
}

function dataObject(data: unknown): Record<string, unknown> {
  if (data === null || typeof data !== "object" || Array.isArray(data)) {
    throw new Error("Template data must be an object.");
  }
  return data as Record<string, unknown>;
}

function valueAt(data: Record<string, unknown>, path: string): unknown {
  return path.split(".").reduce<unknown>(
    (value, key) =>
      value !== null && typeof value === "object" && !Array.isArray(value)
        ? (value as Record<string, unknown>)[key]
        : undefined,
    data,
  );
}

export function slotString(value: unknown): string | undefined {
  if (value === undefined || value === null) return undefined;
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  return JSON.stringify(value, null, 2);
}

export function collectSlots(
  template: TemplateDefinition,
  data: unknown,
): { filled: FilledSlot[]; unfilled: string[]; data: Record<string, unknown> } {
  const obj = dataObject(data);
  const unfilled = template.slots
    .filter((slot) => {
      const value = valueAt(obj, slot.id);
      const text = slotString(value);
      return slot.required && (text === undefined || text.trim() === "");
    })
    .map((slot) => slot.id);
  const filled = template.slots.flatMap((slot: TemplateSlot) => {
    const text = slotString(valueAt(obj, slot.id));
    if (text === undefined || text.trim() === "") return [];
    return [
      {
        id: slot.id,
        label: slot.description?.trim() || slot.id,
        value: text,
      },
    ];
  });
  return { filled, unfilled, data: obj };
}

export function slotMap(filled: FilledSlot[]): Record<string, string> {
  return Object.fromEntries(filled.map((slot) => [slot.id, slot.value]));
}

export function findSlot(filled: FilledSlot[], id: string): string | undefined {
  return filled.find((slot) => slot.id === id)?.value;
}

export function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function escapeXml(text: string): string {
  return escapeHtml(text);
}

export function markdownFromSlots(filled: FilledSlot[]): string {
  const sections = filled.map((slot) => `## ${slot.id}\n${slot.value}`);
  return `${sections.join("\n\n")}\n`;
}

/** Split slide-ish text: blank-line blocks, or lines starting with `-` / `N.` / `Slide`. */
export function splitSlideBlocks(text: string): string[] {
  const trimmed = text.trim();
  if (!trimmed) return [];
  const byBlank = trimmed.split(/\n\s*\n/).map((block) => block.trim()).filter(Boolean);
  if (byBlank.length > 1) return byBlank;
  const lines = trimmed.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  const bulletish = lines.filter((line) => /^(?:[-*•]|\d+[.)]|slide\s*\d+)/i.test(line));
  if (bulletish.length > 1) {
    return bulletish.map((line) => line.replace(/^(?:[-*•]|\d+[.)]|slide\s*\d+[:.\s-]*)/i, "").trim());
  }
  return [trimmed];
}
