import { modKeyLabel } from "./submit-hotkey";

export type ShortcutGroupId = "basics" | "navigation" | "result";

export type ShortcutActionId =
  | "toggleShortcuts"
  | "closeOverlay"
  | "toggleSidebar"
  | "run"
  | "chatSend"
  | "chatNewline"
  | "zoomIn"
  | "zoomOut"
  | "zoomReset"
  | "goChat"
  | "goFlows"
  | "goDocuments"
  | "goDevice"
  | "goSettings"
  | "closeTab"
  | "copyResult"
  | "clearResult"
  | "saveResult";

export type ShortcutDef = {
  id: ShortcutActionId;
  group: ShortcutGroupId;
  /** i18n key under shortcuts.* */
  labelKey: string;
  /** Shown in the map; platform-aware via buildKeyLabel */
  keys: (mod: string) => string[];
  /** Match against a KeyboardEvent */
  match: (event: KeyboardEvent) => boolean;
  /** If true, ignore when focus is in input/textarea/select/contenteditable */
  ignoreInFields?: boolean;
  /** Document-only (panel form handles it); still shown in the map */
  documentOnly?: boolean;
};

function hasMod(event: KeyboardEvent): boolean {
  return event.metaKey || event.ctrlKey;
}

function noShiftAlt(event: KeyboardEvent): boolean {
  return !event.shiftKey && !event.altKey;
}

function digit(event: KeyboardEvent, n: string): boolean {
  return event.key === n || event.code === `Digit${n}`;
}

export const SHORTCUT_GROUPS: readonly { id: ShortcutGroupId; titleKey: string }[] = [
  { id: "basics", titleKey: "shortcuts.group.basics" },
  { id: "navigation", titleKey: "shortcuts.group.navigation" },
  { id: "result", titleKey: "shortcuts.group.result" },
];

export const SHORTCUTS: readonly ShortcutDef[] = [
  {
    id: "run",
    group: "basics",
    labelKey: "shortcuts.run",
    keys: (mod) => [mod, "Enter"],
    match: () => false,
    documentOnly: true,
  },
  {
    id: "chatSend",
    group: "basics",
    labelKey: "shortcuts.chatSend",
    keys: () => ["Enter"],
    match: () => false,
    documentOnly: true,
  },
  {
    id: "chatNewline",
    group: "basics",
    labelKey: "shortcuts.chatNewline",
    keys: () => ["Shift", "Enter"],
    match: () => false,
    documentOnly: true,
  },
  {
    id: "toggleShortcuts",
    group: "basics",
    labelKey: "shortcuts.toggle",
    keys: (mod) => [mod, "/"],
    match: (event) => hasMod(event) && noShiftAlt(event) && event.key === "/",
  },
  {
    id: "closeOverlay",
    group: "basics",
    labelKey: "shortcuts.closeOverlay",
    keys: () => ["Esc"],
    match: (event) => event.key === "Escape",
  },
  {
    id: "toggleSidebar",
    group: "basics",
    labelKey: "shortcuts.toggleSidebar",
    keys: (mod) => [mod, "\\"],
    match: (event) => hasMod(event) && noShiftAlt(event) && (event.key === "\\" || event.code === "Backslash"),
  },
  {
    id: "zoomIn",
    group: "basics",
    labelKey: "shortcuts.zoomIn",
    keys: (mod) => [mod, "+"],
    match: () => false,
    documentOnly: true,
  },
  {
    id: "zoomOut",
    group: "basics",
    labelKey: "shortcuts.zoomOut",
    keys: (mod) => [mod, "-"],
    match: () => false,
    documentOnly: true,
  },
  {
    id: "zoomReset",
    group: "basics",
    labelKey: "shortcuts.zoomReset",
    // Handled in Electron main (before-input-event). Keep Mod+0 free for zoom.
    keys: (mod) => [mod, "0"],
    match: () => false,
    documentOnly: true,
  },
  {
    id: "goChat",
    group: "navigation",
    labelKey: "shortcuts.goChat",
    keys: (mod) => [mod, "1"],
    match: (event) => hasMod(event) && noShiftAlt(event) && digit(event, "1"),
    ignoreInFields: true,
  },
  {
    id: "goFlows",
    group: "navigation",
    labelKey: "shortcuts.goFlows",
    keys: (mod) => [mod, "2"],
    match: (event) => hasMod(event) && noShiftAlt(event) && digit(event, "2"),
    ignoreInFields: true,
  },
  {
    id: "goDocuments",
    group: "navigation",
    labelKey: "shortcuts.goDocuments",
    keys: (mod) => [mod, "3"],
    match: (event) => hasMod(event) && noShiftAlt(event) && digit(event, "3"),
    ignoreInFields: true,
  },
  {
    id: "goDevice",
    group: "navigation",
    labelKey: "shortcuts.goDevice",
    keys: (mod) => [mod, "Shift", "D"],
    match: (event) =>
      hasMod(event) && event.shiftKey && !event.altKey && event.key.toLowerCase() === "d",
    ignoreInFields: true,
  },
  {
    id: "goSettings",
    group: "navigation",
    labelKey: "shortcuts.goSettings",
    keys: (mod) => [mod, ","],
    match: (event) =>
      hasMod(event) &&
      noShiftAlt(event) &&
      (event.key === "," || event.code === "Comma"),
    ignoreInFields: true,
  },
  {
    id: "closeTab",
    group: "basics",
    labelKey: "shortcuts.closeTab",
    keys: (mod) => [mod, "W"],
    match: (event) =>
      hasMod(event) && noShiftAlt(event) && event.key.toLowerCase() === "w",
  },
  {
    id: "copyResult",
    group: "result",
    labelKey: "shortcuts.copyResult",
    keys: (mod) => [mod, "Shift", "C"],
    match: (event) =>
      hasMod(event) && event.shiftKey && !event.altKey && event.key.toLowerCase() === "c",
    ignoreInFields: true,
  },
  {
    id: "saveResult",
    group: "result",
    labelKey: "shortcuts.saveResult",
    keys: (mod) => [mod, "S"],
    match: (event) =>
      hasMod(event) && noShiftAlt(event) && event.key.toLowerCase() === "s",
    // Allow while editing the result textarea.
  },
  {
    id: "clearResult",
    group: "result",
    labelKey: "shortcuts.clearResult",
    keys: (mod) => [mod, "Shift", "Backspace"],
    match: (event) =>
      hasMod(event) &&
      event.shiftKey &&
      !event.altKey &&
      (event.key === "Backspace" || event.key === "Delete"),
    ignoreInFields: true,
  },
];

export function shortcutKeyLabels(def: ShortcutDef): string[] {
  return def.keys(modKeyLabel());
}

export function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return true;
  return target.isContentEditable;
}

export function matchShortcut(event: KeyboardEvent): ShortcutDef | null {
  for (const def of SHORTCUTS) {
    if (def.documentOnly) continue;
    if (def.ignoreInFields && isEditableTarget(event.target)) continue;
    if (def.match(event)) return def;
  }
  return null;
}
