import type { FloorChannelArtifact, FloorChannelPost } from "../../shared/office-api";

/** Search covers what the reader can see on the line, not the plumbing. */
export function matchesFloorSearch(
  post: FloorChannelPost,
  sender: string,
  query: string,
): boolean {
  const needle = query.trim().toLowerCase();
  if (!needle) return true;
  const parts = [
    post.body,
    post.detail,
    sender,
    post.artifact?.label ?? "",
    post.artifact?.ref ?? "",
    ...post.evidence.map((item) => item.label),
  ];
  return parts.some((part) => part.toLowerCase().includes(needle));
}

export interface FloorFile {
  artifact: FloorChannelArtifact;
  /** Who delivered it, already resolved to something readable. */
  from: string;
  deliveredAt: number;
}

/**
 * The files tab, built from what the channel delivered. A file redelivered
 * after a fix is one row, dated by the newest delivery, newest first.
 */
export function collectFloorFiles(
  posts: readonly FloorChannelPost[],
  senderOf: (staffId: string) => string,
): FloorFile[] {
  const byRef = new Map<string, FloorFile>();
  for (const post of posts) {
    const artifact = post.artifact;
    if (!artifact) continue;
    const key = artifact.artifactId ?? artifact.ref;
    const seen = byRef.get(key);
    if (seen && seen.deliveredAt >= post.createdAt) continue;
    byRef.set(key, { artifact, from: senderOf(post.from), deliveredAt: post.createdAt });
  }
  return [...byRef.values()].sort((a, b) => b.deliveredAt - a.deliveredAt);
}
