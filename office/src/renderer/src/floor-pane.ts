/**
 * The right-hand pane, the way Slack uses one: the conversation never goes
 * away, and everything that needs room to explain itself — channel details, a
 * person's profile, the files, the meeting log — opens beside it.
 *
 * That is the difference from the tabs this replaced. Reading who someone is no
 * longer costs you the thread you were reading them in.
 */

/** The views reachable from the channel's pane switcher, in bar order. */
export const FLOOR_PANE_TABS = [
  "details",
  "meeting",
  "files",
  "directives",
] as const;

export type FloorPaneTab = (typeof FLOOR_PANE_TABS)[number];

export type FloorPane =
  | { kind: FloorPaneTab }
  /** A staff member, opened from their name rather than from the bar. */
  | { kind: "profile"; staffId: string }
  /** One message and everything behind it: its sources, its file. */
  | { kind: "message"; postId: string }
  /** A document, read beside the conversation it came out of. */
  | { kind: "artifact"; artifactId: string };

/** The heading shown at the top of the pane. */
export const FLOOR_PANE_TITLE: Record<FloorPane["kind"], string> = {
  details: "floor.details",
  meeting: "floor.meetingRoom",
  files: "floor.tabFiles",
  directives: "floor.tabDirectives",
  profile: "floor.paneProfile",
  message: "floor.paneMessage",
  artifact: "floor.paneDocument",
};

/**
 * What the pane is showing, as one comparable value. The views opened from a
 * subject — a person, a message — are only the same view for the same subject.
 */
export function paneKey(pane: FloorPane): string {
  if (pane.kind === "profile") return `profile:${pane.staffId}`;
  if (pane.kind === "message") return `message:${pane.postId}`;
  if (pane.kind === "artifact") return `artifact:${pane.artifactId}`;
  return pane.kind;
}

/** True when `pane` is the view a given switcher button stands for. */
export function isPaneOpen(
  pane: FloorPane | null,
  kind: FloorPane["kind"],
): boolean {
  return pane?.kind === kind;
}

/**
 * What clicking something that opens the pane does. Clicking what is already
 * open closes it, which is how every pane toggle in Slack behaves; clicking a
 * different person or message switches rather than closing.
 */
export function togglePane(
  current: FloorPane | null,
  next: FloorPane,
): FloorPane | null {
  return current && paneKey(current) === paneKey(next) ? null : next;
}

/**
 * Roving focus for the switcher: one button is tabbable and the arrow keys move
 * between them. Returns null for keys the bar does not own.
 */
export function nextPaneTab(
  current: FloorPaneTab,
  key: string,
): FloorPaneTab | null {
  const index = FLOOR_PANE_TABS.indexOf(current);
  if (index < 0) return null;
  const last = FLOOR_PANE_TABS.length - 1;
  if (key === "ArrowRight")
    return FLOOR_PANE_TABS[index === last ? 0 : index + 1]!;
  if (key === "ArrowLeft")
    return FLOOR_PANE_TABS[index === 0 ? last : index - 1]!;
  if (key === "Home") return FLOOR_PANE_TABS[0]!;
  if (key === "End") return FLOOR_PANE_TABS[last]!;
  return null;
}
