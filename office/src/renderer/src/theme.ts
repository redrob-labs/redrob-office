import { useEffect, useState } from "react";

export type ThemeMode = "system" | "light" | "dark";

const THEME_STORAGE_KEY = "redrob_theme_mode";

export function getStoredThemeMode(): ThemeMode {
  if (typeof window === "undefined") return "system";
  if (window.location && window.location.search.includes("theme=dark")) return "dark";
  if (window.location && window.location.search.includes("theme=light")) return "light";
  if (!window.localStorage) return "system";
  const raw = window.localStorage.getItem(THEME_STORAGE_KEY);
  if (raw === "light" || raw === "dark" || raw === "system") return raw;
  return "system";
}

/**
 * One theme for the whole window.
 *
 * `useTheme` used to hold the mode in each component's own state, and a
 * `storage` event never fires in the document that wrote it — so picking Dark
 * in Settings repainted the DOM but left every other consumer still believing
 * it was light. The sidebar went on offering "switch to dark" in dark mode,
 * and chat kept drawing the light brand mark on a dark row.
 */
const listeners = new Set<(mode: ThemeMode) => void>();

function announce(mode: ThemeMode): void {
  for (const listener of [...listeners]) listener(mode);
}

/** Watch for theme changes made anywhere in this window. Returns an unsubscribe. */
export function subscribeThemeMode(
  listener: (mode: ThemeMode) => void,
): () => void {
  listeners.add(listener);
  return () => void listeners.delete(listener);
}

export function setStoredThemeMode(mode: ThemeMode): void {
  applyTheme(mode);
  if (typeof window === "undefined" || !window.localStorage) {
    announce(mode);
    return;
  }
  window.localStorage.setItem(THEME_STORAGE_KEY, mode);
  announce(mode);
}

export function getSystemTheme(): "light" | "dark" {
  if (typeof window === "undefined" || !window.matchMedia) return "light";
  return window.matchMedia("(prefers-color-scheme: dark)").matches
    ? "dark"
    : "light";
}

export function resolveTheme(mode: ThemeMode): "light" | "dark" {
  if (mode === "system") {
    return getSystemTheme();
  }
  return mode;
}

export function applyTheme(mode: ThemeMode): void {
  if (typeof document === "undefined") return;
  const resolved = resolveTheme(mode);
  const root = document.documentElement;
  const body = document.body;

  if (resolved === "dark") {
    root.classList.add("dark");
    root.setAttribute("data-theme", "dark");
    if (body) {
      body.classList.add("dark");
      body.setAttribute("data-theme", "dark");
    }
  } else {
    root.classList.remove("dark");
    root.setAttribute("data-theme", "light");
    if (body) {
      body.classList.remove("dark");
      body.setAttribute("data-theme", "light");
    }
  }
}

/**
 * React hook for consuming and updating the application theme mode.
 */
export function useTheme(): {
  themeMode: ThemeMode;
  resolvedTheme: "light" | "dark";
  setThemeMode: (mode: ThemeMode) => void;
  toggleTheme: () => void;
} {
  const [themeMode, setMode] = useState<ThemeMode>(getStoredThemeMode);
  const [resolvedTheme, setResolvedTheme] = useState<"light" | "dark">(() =>
    resolveTheme(getStoredThemeMode()),
  );

  useEffect(() => {
    applyTheme(themeMode);
    setResolvedTheme(resolveTheme(themeMode));

    const adopt = (next: ThemeMode): void => {
      setMode(next);
      setResolvedTheme(resolveTheme(next));
    };
    const unsubscribe = subscribeThemeMode(adopt);

    const onStorage = (event: StorageEvent): void => {
      if (event.key === THEME_STORAGE_KEY) {
        const next = getStoredThemeMode();
        adopt(next);
        applyTheme(next);
      }
    };
    window.addEventListener("storage", onStorage);

    const stop = (): void => {
      unsubscribe();
      window.removeEventListener("storage", onStorage);
    };

    if (themeMode !== "system") return stop;

    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const listener = (): void => {
      applyTheme("system");
      setResolvedTheme(getSystemTheme());
    };

    media.addEventListener("change", listener);
    return () => {
      stop();
      media.removeEventListener("change", listener);
    };
  }, [themeMode]);

  const setThemeMode = (mode: ThemeMode): void => {
    setStoredThemeMode(mode);
  };

  const toggleTheme = (): void => {
    const next: ThemeMode = resolvedTheme === "dark" ? "light" : "dark";
    setThemeMode(next);
  };

  return {
    themeMode,
    resolvedTheme,
    setThemeMode,
    toggleTheme,
  };
}
