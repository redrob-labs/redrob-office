import * as React from 'react';

/**
 * Closes an open overlay on a click outside it or on Escape, and returns the ref to put on the
 * element that counts as "inside".
 *
 * Both routes out matter: a pointer user reaches for empty space, a keyboard user reaches for
 * Escape, and an overlay that honours only one of them traps somebody. The listeners are only
 * attached while `open`, so a closed menu costs nothing.
 */
export function useDismiss<T extends HTMLElement>(
  open: boolean,
  close: () => void,
): React.RefObject<T | null> {
  const ref = React.useRef<T | null>(null);
  React.useEffect(() => {
    if (!open) return undefined;
    function onDown(event: MouseEvent): void {
      if (ref.current && !ref.current.contains(event.target as Node)) close();
    }
    function onKey(event: KeyboardEvent): void {
      if (event.key === 'Escape') close();
    }
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open, close]);
  return ref;
}
