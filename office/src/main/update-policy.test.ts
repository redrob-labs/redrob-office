import { describe, expect, it } from "vitest";
import {
  checkedUpdateStatus,
  updateDownloadPercent,
} from "./update-policy.js";

describe("updateDownloadPercent", () => {
  it("rounds progress and keeps it inside the visible range", () => {
    expect(updateDownloadPercent(-3)).toBe(0);
    expect(updateDownloadPercent(42.6)).toBe(43);
    expect(updateDownloadPercent(140)).toBe(100);
    expect(updateDownloadPercent(Number.NaN)).toBe(0);
  });
});

describe("checkedUpdateStatus", () => {
  it("reports the installed version when no newer version was offered", () => {
    expect(checkedUpdateStatus("0.0.1")).toEqual({
      kind: "current",
      version: "0.0.1",
    });
    expect(checkedUpdateStatus("0.0.1", "0.0.1")).toEqual({
      kind: "current",
      version: "0.0.1",
    });
  });

  it("reports an offered version", () => {
    expect(checkedUpdateStatus("0.0.1", "0.0.2")).toEqual({
      kind: "available",
      version: "0.0.2",
    });
  });
});
