/** Map stable main-process error codes to i18n keys. */
export function mapDeskError(
  message: string,
  t: (key: string, vars?: Record<string, string | number>) => string,
): string {
  switch (message) {
    case "ERR_NO_DOCUMENTS":
      return t("errors.noDocuments");
    case "ERR_NO_FIELDS":
      return t("errors.noFields");
    case "ERR_EMPTY_CERTIFICATE":
      return t("errors.emptyCertificate");
    case "ERR_RESUME_NOT_FOUND":
      return t("errors.resumeNotFound");
    case "ERR_JD_TITLE_SHORT":
      return t("jd.errors.titleShort");
    case "ERR_JD_FACTS_PLACEHOLDER":
      return t("jd.errors.placeholder");
    case "ERR_JD_FACTS_THIN:responsibilities":
      return t("jd.errors.thinResponsibilities");
    case "ERR_JD_FACTS_THIN:qualifications":
      return t("jd.errors.thinQualifications");
    case "ERR_JD_VERBATIM_ECHO":
      return t("jd.warnings.verbatimEcho");
    case "ERR_JD_MODEL_FALLBACK":
      return t("jd.modelFallback");
    default:
      if (message.startsWith("ERR_JD_UNFILLED:")) {
        const slots = message.slice("ERR_JD_UNFILLED:".length);
        return t("jd.warnings.unfilled", { slots });
      }
      if (message.startsWith("ERR_FIELD_NO_CONFIDENCE:")) {
        const path = message.slice("ERR_FIELD_NO_CONFIDENCE:".length);
        return t("errors.fieldNoConfidence", { path });
      }
      return message;
  }
}
