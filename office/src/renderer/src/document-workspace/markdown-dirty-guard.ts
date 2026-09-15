import type { ArtifactView } from "../../../shared/office-api";

export type DirtyGuardDecision =
  | { action: "apply"; clearConflict: true }
  | { action: "keep-local"; conflict: boolean }
  | { action: "ignore" };

/**
 * Decide how DocumentWorkspace should treat an incoming artifact while the
 * markdown editor may hold unsaved text. External disk reloads and parent
 * prop churn must not clobber local edits without surfacing a conflict.
 */
export function decideMarkdownArtifactUpdate(input: {
  current: ArtifactView | null;
  incoming: ArtifactView | null;
  markdownDirty: boolean;
  source: "given-prop" | "watcher-reload" | "reload-button" | "save";
}): DirtyGuardDecision {
  const { current, incoming, markdownDirty, source } = input;

  if (source === "save" || source === "reload-button") {
    return { action: "apply", clearConflict: true };
  }

  if (!incoming) {
    return { action: "apply", clearConflict: true };
  }

  if (!current || incoming.id !== current.id) {
    return { action: "apply", clearConflict: true };
  }

  if (source === "watcher-reload") {
    if (markdownDirty) {
      return { action: "keep-local", conflict: true };
    }
    return { action: "apply", clearConflict: true };
  }

  // given-prop: parent pushed a new reference/body for the open doc.
  if (markdownDirty) {
    const bodyChanged = incoming.body !== current.body;
    const revisionChanged = incoming.revision !== current.revision;
    if (bodyChanged || revisionChanged) {
      return { action: "keep-local", conflict: true };
    }
    // Same content, new object identity — keep dirty state intact.
    return { action: "ignore" };
  }

  return { action: "apply", clearConflict: true };
}

/**
 * MarkdownEditor should not overwrite the textarea from artifact.body while
 * the person still has unsaved keystrokes for the same document id.
 */
export function shouldSyncMarkdownValue(input: {
  artifactId: string;
  previousArtifactId: string | null;
  dirty: boolean;
}): boolean {
  if (input.previousArtifactId === null) return true;
  if (input.artifactId !== input.previousArtifactId) return true;
  return !input.dirty;
}
