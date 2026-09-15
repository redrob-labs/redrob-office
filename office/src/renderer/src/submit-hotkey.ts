import type { KeyboardEvent as ReactKeyboardEvent } from "react";

/** Ctrl+Enter (Windows/Linux) or ⌘+Enter (macOS). */
export function isSubmitHotkey(event: {
  key: string;
  ctrlKey: boolean;
  metaKey: boolean;
}): boolean {
  return event.key === "Enter" && (event.ctrlKey || event.metaKey);
}

export function handleSubmitHotkey(
  event: ReactKeyboardEvent,
  enabled: boolean,
  onSubmit: () => void,
): void {
  if (!isSubmitHotkey(event)) return;
  event.preventDefault();
  if (enabled) onSubmit();
}

export function isMacPlatform(): boolean {
  if (typeof navigator === "undefined") return false;
  return /Mac|iPhone|iPad|iPod/.test(navigator.platform || navigator.userAgent);
}

export function modKeyLabel(): string {
  return isMacPlatform() ? "⌘" : "Ctrl";
}
