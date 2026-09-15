import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { configureArtifacts, getArtifact } from "./artifacts.js";
import { createBlankDocument } from "./create-document.js";
import { configureDocSessions, openDocSession, closeDocSession } from "../docs/session.js";

describe("createBlankDocument", () => {
  let root = "";

  afterEach(() => {
    if (root) rmSync(root, { recursive: true, force: true });
    root = "";
  });

  it("creates editable md/docx/xlsx/pptx artifacts", async () => {
    root = mkdtempSync(join(tmpdir(), "redrob-newdoc-"));
    configureArtifacts(root, root);
    configureDocSessions(root);

    const md = await createBlankDocument({ format: "md", title: "Note" });
    expect(md.encoding).toBe("utf8");
    expect(md.body).toContain("# Note");

    const docx = await createBlankDocument({ format: "docx", title: "Doc" });
    expect(docx.encoding).toBe("binary");
    expect(docx.contentFile).toMatch(/\.docx$/);
    const ds = await openDocSession(docx.absolutePath, root);
    const outline = await ds.adapter.outline();
    expect(outline.format).toBe("docx");
    await closeDocSession(ds.id);

    const xlsx = await createBlankDocument({ format: "xlsx" });
    const xs = await openDocSession(xlsx.absolutePath, root);
    expect((await xs.adapter.outline()).sheets?.length).toBeGreaterThan(0);
    await closeDocSession(xs.id);

    const pptx = await createBlankDocument({ format: "pptx", title: "Deck" });
    const ps = await openDocSession(pptx.absolutePath, root);
    expect((await ps.adapter.outline()).slides?.length).toBe(1);
    await closeDocSession(ps.id);

    const reloaded = await getArtifact(md.id);
    expect(reloaded?.title).toBe("Note");
  });
});
