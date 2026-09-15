import { en } from "./en.js";
import { ko } from "./ko.js";
import { lookupMessage, type AppLocale } from "./types.js";

/** Sanitize registry ids (schema/rubric/template) for MessageTree paths. */
export function registryKey(id: string): string {
  return id.replace(/[/.]/g, "_").replace(/-/g, "_");
}

export function localizeMessage(
  locale: AppLocale | string | undefined,
  path: string,
  fallback: string,
): string {
  const catalog = locale === "en" ? en : ko;
  const label = lookupMessage(catalog, path);
  return label === path ? fallback : label;
}

export function slotMessagePath(templateId: string, slotId: string): string {
  return `slot.${registryKey(templateId)}.${slotId}`;
}

export function localizeSlotDescription(
  locale: AppLocale | string | undefined,
  templateId: string,
  slotId: string,
  fallback: string,
): string {
  return localizeMessage(locale, slotMessagePath(templateId, slotId), fallback);
}

export function localizeRubricId(
  locale: AppLocale | string | undefined,
  rubricId: string,
): string {
  const fallback = rubricId.includes("/")
    ? rubricId.slice(rubricId.lastIndexOf("/") + 1)
    : rubricId;
  return localizeMessage(
    locale,
    `rubric.builtin.${registryKey(rubricId)}`,
    fallback,
  );
}

export function localizeSchemaId(
  locale: AppLocale | string | undefined,
  schemaId: string,
): string {
  return localizeMessage(
    locale,
    `scale.bulk.schemas.${registryKey(schemaId)}`,
    schemaId,
  );
}
