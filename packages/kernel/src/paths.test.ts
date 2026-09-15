import { homedir } from "node:os";
import { afterEach, describe, expect, it } from "vitest";
import {
  defaultArtifactsDir,
  defaultModelsDir,
  redrobDataDir,
} from "./paths.js";

const saved = process.env.REDROB_ARTIFACTS_DIR;

afterEach(() => {
  if (saved === undefined) delete process.env.REDROB_ARTIFACTS_DIR;
  else process.env.REDROB_ARTIFACTS_DIR = saved;
});

describe("defaultArtifactsDir", () => {
  it("keeps documents in the redrob folder, beside the models", () => {
    delete process.env.REDROB_ARTIFACTS_DIR;
    expect(defaultArtifactsDir().startsWith(redrobDataDir())).toBe(true);
    // Siblings: what the app downloaded and what the person made.
    expect(defaultArtifactsDir()).not.toBe(defaultModelsDir());
  });

  it("stays out of the folders a file tool refuses to touch", () => {
    delete process.env.REDROB_ARTIFACTS_DIR;
    const dir = defaultArtifactsDir();
    expect(dir.startsWith(`${homedir()}/.config`)).toBe(false);
    expect(dir).not.toBe(homedir());
  });

  it("can be pointed somewhere else", () => {
    process.env.REDROB_ARTIFACTS_DIR = "/tmp/somewhere-else";
    expect(defaultArtifactsDir()).toBe("/tmp/somewhere-else");
  });
});
