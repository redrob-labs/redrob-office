import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { en } from "./en.js";
import { ko } from "./ko.js";
import {
  detectBrowserLocale,
  lookupMessage,
  type MessageTree,
} from "./types.js";

function flatten(tree: MessageTree, prefix = ""): string[] {
  return Object.entries(tree).flatMap(([key, value]) => {
    const path = prefix ? `${prefix}.${key}` : key;
    return typeof value === "string" ? [path] : flatten(value, path);
  });
}

function assertNoEmpty(tree: MessageTree, locale: string): void {
  for (const [path, value] of flatten(tree).map((path) => {
    const parts = path.split(".");
    let cur: string | MessageTree = tree;
    for (const part of parts) {
      if (typeof cur === "string") throw new Error(`bad path ${path}`);
      cur = cur[part]!;
    }
    return [path, cur as string] as const;
  })) {
    expect(value.trim(), `${locale} ${path} is empty`).not.toBe("");
  }
}

describe("i18n catalogs", () => {
  it("keeps en and ko key sets aligned", () => {
    expect(flatten(ko).sort()).toEqual(flatten(en).sort());
  });

  it("has no empty en or ko strings", () => {
    assertNoEmpty(en, "en");
    assertNoEmpty(ko, "ko");
  });

  it("keeps published dist catalogs in sync with source", async () => {
    const here = dirname(fileURLToPath(import.meta.url));
    const [{ en: enDist }, { ko: koDist }] = await Promise.all([
      import(join(here, "../../dist/i18n/en.js")),
      import(join(here, "../../dist/i18n/ko.js")),
    ]);
    expect(flatten(enDist as MessageTree).sort()).toEqual(flatten(en).sort());
    expect(flatten(koDist as MessageTree).sort()).toEqual(flatten(ko).sort());
  });

  it("interpolates variables", () => {
    expect(lookupMessage(en, "documentsPanel.count", { count: 3 })).toBe(
      "3 documents",
    );
    expect(lookupMessage(ko, "documentsPanel.count", { count: 3 })).toBe(
      "문서 3개",
    );
  });

  it("detects Korean browser locales", () => {
    const original = globalThis.navigator;
    Object.defineProperty(globalThis, "navigator", {
      configurable: true,
      value: { language: "ko-KR", languages: ["ko-KR", "en-US"] },
    });
    expect(detectBrowserLocale()).toBe("ko");
    Object.defineProperty(globalThis, "navigator", {
      configurable: true,
      value: original,
    });
  });
});
