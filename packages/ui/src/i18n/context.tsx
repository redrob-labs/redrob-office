import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { en } from "./en.js";
import { ko } from "./ko.js";
import {
  detectBrowserLocale,
  lookupMessage,
  type AppLocale,
  type MessageTree,
} from "./types.js";

const CATALOGS: Record<AppLocale, MessageTree> = { en, ko };
const STORAGE_KEY = "redrob.locale";

export interface I18nValue {
  locale: AppLocale;
  setLocale: (locale: AppLocale) => void;
  t: (path: string, vars?: Readonly<Record<string, string | number>>) => string;
}

const I18nContext = createContext<I18nValue | null>(null);

function readStoredLocale(): AppLocale | null {
  if (typeof localStorage === "undefined") {
    return null;
  }
  const value = localStorage.getItem(STORAGE_KEY);
  return value === "en" || value === "ko" ? value : null;
}

export function I18nProvider({
  children,
  initialLocale,
}: {
  children: ReactNode;
  initialLocale?: AppLocale;
}): JSX.Element {
  const [locale, setLocaleState] = useState<AppLocale>(
    () => initialLocale ?? readStoredLocale() ?? detectBrowserLocale(),
  );

  useEffect(() => {
    document.documentElement.lang = locale;
    localStorage.setItem(STORAGE_KEY, locale);
  }, [locale]);

  const setLocale = useCallback((next: AppLocale) => {
    setLocaleState(next);
  }, []);

  const t = useCallback(
    (path: string, vars?: Readonly<Record<string, string | number>>) =>
      lookupMessage(CATALOGS[locale], path, vars),
    [locale],
  );

  const value = useMemo(() => ({ locale, setLocale, t }), [locale, setLocale, t]);
  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n(): I18nValue {
  const value = useContext(I18nContext);
  if (!value) {
    throw new Error("useI18n must be used within I18nProvider");
  }
  return value;
}

export function LocaleSwitch({ className }: { className?: string }): JSX.Element {
  const { locale, setLocale, t } = useI18n();
  return (
    <label
      className={
        className ?? "flex items-center gap-1.5 text-sm text-subtle-foreground"
      }
    >
      <select
        className="cursor-pointer appearance-none rounded border-0 bg-card px-3 py-1.5 text-sm font-medium text-muted-foreground shadow-sm outline-none"
        value={locale}
        aria-label={t("language")}
        onChange={(event) => {
          const next = event.currentTarget.value;
          if (next === "en" || next === "ko") {
            setLocale(next);
          }
        }}
      >
        <option value="en">{t("languageEn")}</option>
        <option value="ko">{t("languageKo")}</option>
      </select>
    </label>
  );
}
