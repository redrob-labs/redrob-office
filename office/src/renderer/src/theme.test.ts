import { describe, expect, it, beforeEach, afterEach } from "vitest";
import {
  getStoredThemeMode,
  setStoredThemeMode,
  resolveTheme,
  applyTheme,
  subscribeThemeMode,
} from "./theme.js";

function fakeLocalStorage(): Storage {
  const map = new Map<string, string>();
  return {
    get length() {
      return map.size;
    },
    clear: () => map.clear(),
    getItem: (key: string) => map.get(key) ?? null,
    key: (index: number) => [...map.keys()][index] ?? null,
    removeItem: (key: string) => void map.delete(key),
    setItem: (key: string, value: string) => void map.set(key, value),
  } as Storage;
}

describe("theme mode management", () => {
  let rootClasses = new Set<string>();
  let rootAttributes = new Map<string, string>();

  beforeEach(() => {
    rootClasses.clear();
    rootAttributes.clear();

    const fakeStorage = fakeLocalStorage();
    Object.defineProperty(globalThis, "localStorage", {
      configurable: true,
      value: fakeStorage,
    });
    Object.defineProperty(globalThis, "window", {
      configurable: true,
      value: {
        localStorage: fakeStorage,
        addEventListener: () => {},
        removeEventListener: () => {},
        matchMedia: () => ({ matches: false }),
      },
    });
    Object.defineProperty(globalThis, "document", {
      configurable: true,
      value: {
        documentElement: {
          classList: {
            add: (c: string) => rootClasses.add(c),
            remove: (c: string) => rootClasses.delete(c),
            contains: (c: string) => rootClasses.has(c),
          },
          setAttribute: (k: string, v: string) => rootAttributes.set(k, v),
          getAttribute: (k: string) => rootAttributes.get(k) ?? null,
          removeAttribute: (k: string) => rootAttributes.delete(k),
        },
        body: {
          classList: {
            add: () => {},
            remove: () => {},
          },
          setAttribute: () => {},
        },
      },
    });
  });

  afterEach(() => {
    Reflect.deleteProperty(globalThis, "localStorage");
    Reflect.deleteProperty(globalThis, "window");
    Reflect.deleteProperty(globalThis, "document");
  });

  it("defaults stored theme mode to system", () => {
    expect(getStoredThemeMode()).toBe("system");
  });

  it("stores and retrieves light and dark mode overrides", () => {
    setStoredThemeMode("dark");
    expect(getStoredThemeMode()).toBe("dark");

    setStoredThemeMode("light");
    expect(getStoredThemeMode()).toBe("light");

    setStoredThemeMode("system");
    expect(getStoredThemeMode()).toBe("system");
  });

  it("resolves explicit light and dark modes accurately", () => {
    expect(resolveTheme("light")).toBe("light");
    expect(resolveTheme("dark")).toBe("dark");
  });

  it("applies dark mode class and data-theme to root element", () => {
    applyTheme("dark");
    expect(rootClasses.has("dark")).toBe(true);
    expect(rootAttributes.get("data-theme")).toBe("dark");

    applyTheme("light");
    expect(rootClasses.has("dark")).toBe(false);
    expect(rootAttributes.get("data-theme")).toBe("light");
  });

  // Settings and the sidebar both read the theme. A `storage` event never
  // fires in the document that wrote the key, so without this the rest of the
  // window keeps rendering as if it were still light.
  it("tells every consumer in this window about a change", () => {
    const seen: string[] = [];
    const stop = subscribeThemeMode((mode) => seen.push(mode));

    setStoredThemeMode("dark");
    setStoredThemeMode("light");
    stop();
    setStoredThemeMode("dark");

    expect(seen).toEqual(["dark", "light"]);
  });
});
