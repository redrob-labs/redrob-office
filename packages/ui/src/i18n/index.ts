export type { AppLocale, MessageTree } from "./types.js";
export { APP_LOCALES, detectBrowserLocale, lookupMessage } from "./types.js";
export { en } from "./en.js";
export { ko } from "./ko.js";
export { I18nProvider, LocaleSwitch, useI18n } from "./context.js";
export {
  localizeMessage,
  localizeRubricId,
  localizeSchemaId,
  localizeSlotDescription,
  registryKey,
  slotMessagePath,
} from "./registry-labels.js";
