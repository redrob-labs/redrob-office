import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from "react";

const STORAGE_PREFIX = "redrob.panelWidths.v1.";

function clamp(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, n));
}

function readStored(key: string): Record<string, number> | null {
  try {
    const raw = localStorage.getItem(STORAGE_PREFIX + key);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    const out: Record<string, number> = {};
    for (const [k, v] of Object.entries(parsed)) {
      if (typeof v === "number" && Number.isFinite(v)) out[k] = v;
    }
    return out;
  } catch {
    return null;
  }
}

export type PanelSpec = {
  /** Default width in px */
  default: number;
  min: number;
  max: number;
  /**
   * Which side of the panel its drag handle sits on. A handle to the left of
   * the panel it sizes grows the panel when dragged left, so the pointer and
   * the edge move together instead of opposite ways.
   */
  edge?: "start" | "end";
};

/**
 * Persisted horizontal panel widths with pointer-drag resize.
 * Keys are panel ids; values are pixel widths for non-flex columns.
 */
export function usePanelWidths(
  layoutKey: string,
  specs: Record<string, PanelSpec>,
): {
  width: (id: string) => number;
  style: (id: string) => { width: number; flexShrink: 0 };
  beginResize: (id: string, event: ReactPointerEvent) => void;
  reset: (id?: string) => void;
} {
  const specsRef = useRef(specs);
  specsRef.current = specs;

  const [widths, setWidths] = useState<Record<string, number>>(() => {
    const stored = readStored(layoutKey);
    const next: Record<string, number> = {};
    for (const [id, spec] of Object.entries(specs)) {
      const value = stored?.[id] ?? spec.default;
      next[id] = clamp(value, spec.min, spec.max);
    }
    return next;
  });

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_PREFIX + layoutKey, JSON.stringify(widths));
    } catch {
      // ignore
    }
  }, [layoutKey, widths]);

  const width = useCallback(
    (id: string) => {
      const spec = specsRef.current[id];
      return widths[id] ?? spec?.default ?? 280;
    },
    [widths],
  );

  const style = useCallback(
    (id: string) => ({
      width: width(id),
      flexShrink: 0 as const,
    }),
    [width],
  );

  const reset = useCallback((id?: string) => {
    setWidths((prev) => {
      if (!id) {
        const next: Record<string, number> = {};
        for (const [key, spec] of Object.entries(specsRef.current)) {
          next[key] = spec.default;
        }
        return next;
      }
      const spec = specsRef.current[id];
      if (!spec) return prev;
      return { ...prev, [id]: spec.default };
    });
  }, []);

  const endDragRef = useRef<(() => void) | null>(null);

  const beginResize = useCallback((id: string, event: ReactPointerEvent) => {
    const spec = specsRef.current[id];
    if (!spec) return;
    event.preventDefault();
    endDragRef.current?.();
    const startX = event.clientX;
    const startW = widths[id] ?? spec.default;

    const sign = spec.edge === "start" ? -1 : 1;

    const onMove = (ev: PointerEvent): void => {
      const delta = (ev.clientX - startX) * sign;
      setWidths((prev) => ({
        ...prev,
        [id]: clamp(startW + delta, spec.min, spec.max),
      }));
    };
    /*
     * Every way out of a drag ends here, not just a clean release. A pointerup
     * that lands outside the window, a cancelled pointer, or the window losing
     * focus mid-drag all used to leave `user-select: none` on <body>, and
     * Chromium will not put a caret in a subtree that cannot be selected: the
     * chat composer looked frozen until the app was reloaded.
     */
    const onUp = (): void => {
      endDragRef.current = null;
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
      window.removeEventListener("blur", onUp);
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    };
    endDragRef.current = onUp;
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onUp);
    window.addEventListener("blur", onUp);
  }, [widths]);

  // A panel that unmounts mid-drag must not take the window's selection with it.
  useEffect(() => () => endDragRef.current?.(), []);

  return { width, style, beginResize, reset };
}

export function PanelResizeHandle({
  label,
  onResizeStart,
  onReset,
}: {
  label: string;
  onResizeStart: (event: ReactPointerEvent) => void;
  onReset?: () => void;
}): JSX.Element {
  return (
    <div
      role="separator"
      aria-orientation="vertical"
      aria-label={label}
      title={label}
      onPointerDown={onResizeStart}
      onDoubleClick={() => onReset?.()}
      className="group relative z-10 w-3 shrink-0 cursor-col-resize"
    >
      <div className="absolute inset-y-0 left-1/2 w-px -translate-x-1/2 bg-gray-300 transition-colors group-hover:w-0.5 group-hover:bg-brand-500 group-active:w-0.5 group-active:bg-brand-600" />
      <div className="absolute inset-y-0 left-1/2 w-3 -translate-x-1/2" />
    </div>
  );
}
