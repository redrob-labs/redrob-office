import { describe, expect, it } from "vitest";
import { nvidiaSmiSupportedPlatform } from "./gpu-detect.js";

describe("gpu-detect platform gates", () => {
  it("skips nvidia-smi on macOS", () => {
    expect(nvidiaSmiSupportedPlatform("darwin")).toBe(false);
  });

  it("allows nvidia-smi on Windows and Linux", () => {
    expect(nvidiaSmiSupportedPlatform("win32")).toBe(true);
    expect(nvidiaSmiSupportedPlatform("linux")).toBe(true);
  });
});
