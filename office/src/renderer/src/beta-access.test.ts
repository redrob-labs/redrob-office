import { describe, expect, it } from "vitest";
import { looksLikeRedrobKey } from "./beta-access.js";

describe("looksLikeRedrobKey", () => {
  it("accepts a long Redrob Console secret", () => {
    expect(
      looksLikeRedrobKey(
        "redrob_abcdefghijklmnopqrstuvwxyz0123456789",
      ),
    ).toBe(true);
  });

  it("rejects empty, short, or spaced values", () => {
    expect(looksLikeRedrobKey("")).toBe(false);
    expect(looksLikeRedrobKey("redrob-short")).toBe(false);
    expect(looksLikeRedrobKey("redrob_abc defghijklmnop")).toBe(false);
  });
});
