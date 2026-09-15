import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { loadShellNav } from "./shell-nav-state";

const STORAGE_KEY = "redrob.shellNav.v8";
const LEGACY_KEY = "redrob.shellNav.v7";

function fakeSessionStorage(): Storage {
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

describe("shell nav state", () => {
  beforeEach(() => {
    Object.defineProperty(globalThis, "sessionStorage", {
      configurable: true,
      value: fakeSessionStorage(),
    });
  });

  afterEach(() => {
    Reflect.deleteProperty(globalThis, "sessionStorage");
  });

  it("boots into chat with nothing open", () => {
    const nav = loadShellNav();
    expect(nav.tab).toBe("chat");
    expect(nav.openDocs).toEqual([]);
    expect(nav.activeDocId).toBeNull();
  });

  it("sends a session saved on the retired task catalog back to chat", () => {
    sessionStorage.setItem(
      LEGACY_KEY,
      JSON.stringify({ tab: "templates", openDocs: [], activeDocId: null }),
    );
    expect(loadShellNav().tab).toBe("chat");
  });

  it("keeps a handed-off step open when one is restored", () => {
    sessionStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        tab: "work",
        openDocs: [{ id: "create/draft", categoryId: "create", templateId: "draft" }],
        activeDocId: "create/draft",
      }),
    );
    const nav = loadShellNav();
    expect(nav.tab).toBe("work");
    expect(nav.openDocs.map((doc) => doc.templateId)).toEqual(["draft"]);
  });

  it("leaves the work surface when the restored session has no step open", () => {
    sessionStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ tab: "work", openDocs: [], activeDocId: null }),
    );
    expect(loadShellNav().tab).toBe("chat");
  });
});
