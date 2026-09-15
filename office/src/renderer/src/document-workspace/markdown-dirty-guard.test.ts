import { describe, expect, it } from "vitest";
import type { ArtifactView } from "../../../shared/office-api";
import {
  decideMarkdownArtifactUpdate,
  shouldSyncMarkdownValue,
} from "./markdown-dirty-guard";

function view(partial: Partial<ArtifactView> & Pick<ArtifactView, "id" | "body">): ArtifactView {
  return {
    kind: "other",
    title: partial.title ?? partial.id,
    createdAt: "2026-01-01T00:00:00.000Z",
    contentFile: "doc.md",
    encoding: "utf8",
    absolutePath: `/tmp/${partial.id}.md`,
    revision: partial.revision ?? "1",
    ...partial,
  };
}

describe("decideMarkdownArtifactUpdate", () => {
  const opened = view({
    id: "file:conflict-demo.md",
    body: "# Conflict demo\n\nOriginal.\n",
    revision: "100",
  });

  it("watcher keeps local edits and marks conflict when dirty", () => {
    const decision = decideMarkdownArtifactUpdate({
      current: opened,
      incoming: view({
        ...opened,
        body: "# Conflict demo\n\nChanged externally on disk.\n",
        revision: "200",
      }),
      markdownDirty: true,
      source: "watcher-reload",
    });
    expect(decision).toEqual({ action: "keep-local", conflict: true });
  });

  it("watcher applies disk body when clean", () => {
    const decision = decideMarkdownArtifactUpdate({
      current: opened,
      incoming: view({
        ...opened,
        body: "# Conflict demo\n\nChanged externally on disk.\n",
        revision: "200",
      }),
      markdownDirty: false,
      source: "watcher-reload",
    });
    expect(decision).toEqual({ action: "apply", clearConflict: true });
  });

  it("given-prop does not clear dirty when parent only churns object identity", () => {
    const decision = decideMarkdownArtifactUpdate({
      current: opened,
      incoming: { ...opened },
      markdownDirty: true,
      source: "given-prop",
    });
    expect(decision).toEqual({ action: "ignore" });
  });

  it("given-prop keeps local and conflicts when parent pushes newer disk body", () => {
    const decision = decideMarkdownArtifactUpdate({
      current: opened,
      incoming: view({
        ...opened,
        body: "# Conflict demo\n\nChanged externally on disk.\n",
        revision: "200",
      }),
      markdownDirty: true,
      source: "given-prop",
    });
    expect(decision).toEqual({ action: "keep-local", conflict: true });
  });
});

describe("shouldSyncMarkdownValue", () => {
  it("refuses to clobber dirty local text for the same artifact id", () => {
    expect(
      shouldSyncMarkdownValue({
        artifactId: "file:conflict-demo.md",
        previousArtifactId: "file:conflict-demo.md",
        dirty: true,
      }),
    ).toBe(false);
  });

  it("syncs when the open document id changes", () => {
    expect(
      shouldSyncMarkdownValue({
        artifactId: "file:other.md",
        previousArtifactId: "file:conflict-demo.md",
        dirty: true,
      }),
    ).toBe(true);
  });
});
