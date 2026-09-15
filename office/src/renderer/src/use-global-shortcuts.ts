import { useEffect, useRef } from "react";
import { matchShortcut, type ShortcutActionId } from "./shortcut-registry";

export function useGlobalShortcuts(
  open: boolean,
  handlers: Partial<Record<ShortcutActionId, () => void>>,
): void {
  const handlersRef = useRef(handlers);
  handlersRef.current = handlers;

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent): void {
      const matched = matchShortcut(event);
      if (!matched) return;
      if (matched.id === "closeOverlay" && !open) return;
      const handler = handlersRef.current[matched.id];
      if (!handler) return;
      event.preventDefault();
      handler();
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open]);
}
