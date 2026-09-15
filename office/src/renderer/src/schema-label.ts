import {
  localizeRubricId,
  localizeSchemaId,
  localizeSlotDescription,
  registryKey,
  type AppLocale,
} from "@redrob/ui";

export { registryKey };

/** Map registry schema ids to i18n labels under scale.bulk.schemas.* */
export function schemaLabelKey(schemaId: string): string {
  return `scale.bulk.schemas.${registryKey(schemaId)}`;
}

export function schemaLabel(
  t: (path: string) => string,
  schemaId: string,
  locale?: AppLocale,
): string {
  if (locale) return localizeSchemaId(locale, schemaId);
  const key = schemaLabelKey(schemaId);
  const label = t(key);
  return label === key ? schemaId : label;
}

/** Built-in + user rubrics: prefer rubric.builtin.*, else last path segment. */
export function rubricLabel(
  t: (path: string) => string,
  rubricId: string,
  locale?: AppLocale,
): string {
  if (locale) return localizeRubricId(locale, rubricId);
  const key = `rubric.builtin.${registryKey(rubricId)}`;
  const label = t(key);
  if (label !== key) return label;
  return rubricId.includes("/")
    ? rubricId.slice(rubricId.lastIndexOf("/") + 1)
    : rubricId;
}

export function rubricAxisLabel(
  t: (path: string) => string,
  rubricId: string,
  axisId: string,
): string {
  const key = `rubric.axis.${registryKey(rubricId)}.${axisId}`;
  const label = t(key);
  return label === key ? axisId : label;
}

export function slotLabel(
  t: (path: string) => string,
  templateId: string,
  slotId: string,
  fallback: string,
  locale?: AppLocale,
): string {
  if (locale) {
    return localizeSlotDescription(locale, templateId, slotId, fallback);
  }
  const key = `slot.${registryKey(templateId)}.${slotId}`;
  const label = t(key);
  return label === key ? fallback : label;
}

export function severityLabel(
  t: (path: string) => string,
  severity: string,
): string {
  const key = `severity.${severity}`;
  const label = t(key);
  return label === key ? severity : label;
}

export function unscoredReasonLabel(
  t: (path: string) => string,
  reason: string,
): string {
  const key = `assess.unscoredReason.${reason}`;
  const label = t(key);
  return label === key ? reason : label;
}

export function operationLabel(
  t: (path: string) => string,
  operation: string,
): string {
  const key = `device.operation.${registryKey(operation)}`;
  const label = t(key);
  return label === key ? operation : label;
}

export function modelRoleLabel(
  t: (path: string) => string,
  kind: string,
): string {
  const key = `setup.role.${kind}`;
  const label = t(key);
  return label === key ? kind : label;
}

/** Runtime fallback codes raised by the inference and ASR hosts. */
const RUNTIME_ALERT_KEYS: Readonly<Record<string, string>> = {
  ERR_INFER_CPU_FALLBACK: "device.alertInferCpuFallback",
  ERR_INFER_FORK_FALLBACK: "device.alertInferForkFallback",
  ERR_INFER_EXIT_FALLBACK: "device.alertInferExitFallback",
  ERR_INFER_MODEL_MISSING: "device.alertInferModelMissing",
  ERR_ASR_ISOLATION: "device.alertAsrIsolation",
  ERR_ASR_BINARY: "device.alertAsrBinary",
  ERR_ASR_SIDECAR: "device.alertAsrSidecar",
};

export function runtimeAlertLabel(
  t: (path: string) => string,
  code: string,
): string {
  const key = RUNTIME_ALERT_KEYS[code];
  if (!key) return code;
  const label = t(key);
  return label === key ? code : label;
}

/** Fallbacks degraded the run; anything else stopped a capability outright. */
export function runtimeAlertSeverity(code: string): "warning" | "error" {
  return code.endsWith("_FALLBACK") ? "warning" : "error";
}
