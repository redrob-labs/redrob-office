import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Asked to build a website, a run wrote the page into a source checkout and
 * reported success — every folder it was allowed to write to looked equally
 * plausible, because the prompt never said which one was the person's.
 */
describe("documentsFolderRule", () => {
  let home = "";

  beforeEach(() => {
    home = mkdtempSync(join(tmpdir(), "docs-rule-"));
  });

  afterEach(() => {
    delete process.env.REDROB_ARTIFACTS_DIR;
    if (home) rmSync(home, { recursive: true, force: true });
    home = "";
    vi.resetModules();
  });

  it("names the documents folder so a page has somewhere to go", async () => {
    const documents = join(home, "documents");
    process.env.REDROB_ARTIFACTS_DIR = documents;
    vi.resetModules();
    const artifacts = await import("./artifacts.js");
    artifacts.configureArtifacts(home, documents);
    const { documentsFolderRule } = await import("./chat.js");

    const rule = documentsFolderRule();
    expect(rule).toContain(documents);
    expect(rule).toContain(`${documents}/name.html`);
  });

  it("says nothing rather than guessing when documents are not configured yet", async () => {
    vi.resetModules();
    const { documentsFolderRule } = await import("./chat.js");
    expect(documentsFolderRule()).toBe("");
  });
});
