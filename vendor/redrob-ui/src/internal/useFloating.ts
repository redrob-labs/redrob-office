import * as React from 'react';

export type FloatingSide = 'top' | 'bottom' | 'left' | 'right';
export type FloatingAlign = 'start' | 'center' | 'end';

export interface FloatingOptions {
  /** The side tried first. It flips to the opposite side only when that side has more room. */
  side: FloatingSide;
  align?: FloatingAlign;
  /** Space between the trigger and the overlay, in px. */
  gap?: number;
  /** Cap the overlay's height to the room on its side, so a long one scrolls instead of leaving the window. */
  fitHeight?: boolean;
  /** `min`: at least the trigger's width (a list under a field). `exact`: the trigger's width. */
  matchWidth?: 'min' | 'exact';
  /** At or below this window width the stylesheet's own small-screen layout is left alone. */
  skipBelow?: number;
  /** The box to keep the overlay in. Defaults to `visibleBox`. For tests and unusual hosts. */
  boundary?: (el: HTMLElement) => { top: number; left: number; right: number; bottom: number };
}

/** Distance kept from the window edge. */
const EDGE = 8;
/** The smallest height a capped overlay is given, so it never shrinks to nothing. */
const MIN_HEIGHT = 120;

const PLACED = ['position', 'top', 'left', 'right', 'bottom', 'transform', 'margin', 'max-height', 'width', 'min-width', 'z-index'];

function clear(el: HTMLElement): void {
  for (const name of PLACED) el.style.removeProperty(name);
  delete el.dataset.side;
}

function opposite(side: FloatingSide): FloatingSide {
  return side === 'top' ? 'bottom' : side === 'bottom' ? 'top' : side === 'left' ? 'right' : 'left';
}

function clamp(value: number, low: number, high: number): number {
  return Math.max(low, Math.min(value, Math.max(low, high)));
}

/** Whether an ancestor makes `position: fixed` measure from it instead of the window. */
function holdsFixed(style: CSSStyleDeclaration): boolean {
  if (style.transform && style.transform !== 'none') return true;
  if (style.perspective && style.perspective !== 'none') return true;
  if (style.filter && style.filter !== 'none') return true;
  const backdrop = (style as unknown as Record<string, string>).backdropFilter || (style as unknown as Record<string, string>).webkitBackdropFilter;
  if (backdrop && backdrop !== 'none') return true;
  if (style.contain && /layout|paint|strict|content/.test(style.contain)) return true;
  if (style.willChange && /transform|perspective|filter/.test(style.willChange)) return true;
  return false;
}

/**
 * The box a fixed overlay can actually be seen in: the window, cut down by every clipping container
 * above the nearest ancestor that holds fixed elements. With no such ancestor it is the window.
 */
export function visibleBox(el: HTMLElement): { top: number; left: number; right: number; bottom: number } {
  const box = { top: 0, left: 0, right: window.innerWidth, bottom: window.innerHeight };
  if (typeof getComputedStyle !== 'function') return box;
  let holder: HTMLElement | null = null;
  for (let n = el.parentElement; n; n = n.parentElement) {
    if (holdsFixed(getComputedStyle(n))) {
      holder = n;
      break;
    }
  }
  for (let n = holder; n && n !== document.body && n !== document.documentElement; n = n.parentElement) {
    const style = getComputedStyle(n);
    if (/(hidden|clip|auto|scroll)/.test(style.overflowX + style.overflowY)) {
      const r = n.getBoundingClientRect();
      box.top = Math.max(box.top, r.top);
      box.left = Math.max(box.left, r.left);
      box.right = Math.min(box.right, r.right);
      box.bottom = Math.min(box.bottom, r.bottom);
    }
  }
  return box;
}

/**
 * Places an open overlay against the window rather than against its own container.
 *
 * Every overlay in the system is drawn in place, next to its trigger, so it inherits the clipping
 * of whatever it sits in: a menu at the foot of a scrolling panel, a status panel inside a chat
 * column with `overflow: hidden`. Moving the element into a portal would change the markup the
 * parity gate compares and break the descendant selectors the stylesheet relies on, so the element
 * stays where it is and is taken out of its container's clipping with `position: fixed`, measured
 * against the window, flipped to the side with room, slid back inside the edges, and capped in
 * height when even the roomier side is short.
 *
 * A transformed, filtered or `contain`ed ancestor makes a fixed element position against that ancestor
 * instead of the window, and keeps it inside every clipping container above that ancestor. Both are
 * handled: the overlay is first parked at 0,0 and measured, and that offset is taken off; and the room
 * on each side is measured inside the visible box those clipping containers leave, not the window.
 */
export function placeFloating(anchor: HTMLElement, el: HTMLElement, options: FloatingOptions): FloatingSide | null {
  if (options.skipBelow && window.innerWidth <= options.skipBelow) {
    clear(el);
    return null;
  }
  const gap = options.gap == null ? 8 : options.gap;
  const a = anchor.getBoundingClientRect();

  el.style.position = 'fixed';
  el.style.top = '0px';
  el.style.left = '0px';
  el.style.right = 'auto';
  el.style.bottom = 'auto';
  el.style.transform = 'none';
  el.style.margin = '0';
  el.style.zIndex = '1000';
  el.style.removeProperty('max-height');
  if (options.matchWidth === 'exact') el.style.width = `${a.width}px`;
  if (options.matchWidth === 'min') el.style.minWidth = `${a.width}px`;

  const origin = el.getBoundingClientRect();
  const box = options.boundary ? options.boundary(el) : visibleBox(el);
  let w = origin.width;
  let h = origin.height;

  const room: Record<FloatingSide, number> = {
    top: a.top - box.top - gap - EDGE,
    bottom: box.bottom - a.bottom - gap - EDGE,
    left: a.left - box.left - gap - EDGE,
    right: box.right - a.right - gap - EDGE,
  };
  const vertical = options.side === 'top' || options.side === 'bottom';
  let side = options.side;
  const need = vertical ? h : w;
  if (room[side] < need && room[opposite(side)] > room[side]) side = opposite(side);

  if (vertical && options.fitHeight && h > room[side]) {
    h = Math.max(MIN_HEIGHT, room[side]);
    el.style.maxHeight = `${h}px`;
  }

  let x: number;
  let y: number;
  if (vertical) {
    y = side === 'bottom' ? a.bottom + gap : a.top - gap - h;
    const align = options.align || 'start';
    x = align === 'start' ? a.left : align === 'end' ? a.right - w : a.left + a.width / 2 - w / 2;
    w = Math.min(w, box.right - box.left - EDGE * 2);
  } else {
    x = side === 'right' ? a.right + gap : a.left - gap - w;
    y = a.top + a.height / 2 - h / 2;
  }
  x = clamp(x, box.left + EDGE, box.right - EDGE - w);
  y = clamp(y, box.top + EDGE, box.bottom - EDGE - h);

  el.style.left = `${Math.round(x - origin.left)}px`;
  el.style.top = `${Math.round(y - origin.top)}px`;
  el.dataset.side = side;
  return side;
}

const useIsoLayoutEffect = typeof window !== 'undefined' ? React.useLayoutEffect : React.useEffect;

/**
 * Keeps an open overlay placed by `placeFloating` while the window resizes, anything scrolls, or the
 * overlay or its trigger changes size. `find` returns the trigger and the overlay at the moment they
 * are needed, because the overlay only exists while open. Nothing runs while closed, and the inline
 * placement is removed again on close, so a closed component renders exactly as before.
 */
export function useFloating(
  open: boolean,
  find: () => [HTMLElement | null | undefined, HTMLElement | null | undefined],
  options: FloatingOptions,
): void {
  const findRef = React.useRef(find);
  findRef.current = find;
  const { side, align, gap, fitHeight, matchWidth, skipBelow, boundary } = options;
  const boundaryRef = React.useRef(boundary);
  boundaryRef.current = boundary;

  useIsoLayoutEffect(() => {
    if (!open) return undefined;
    let frame = 0;
    let placed: HTMLElement | null = null;
    const opts: FloatingOptions = {
      side, align, gap, fitHeight, matchWidth, skipBelow,
      boundary: boundaryRef.current ? (el) => (boundaryRef.current as NonNullable<FloatingOptions['boundary']>)(el) : undefined,
    };
    function run(): void {
      const [anchor, el] = findRef.current();
      if (!anchor || !el) return;
      placed = el;
      placeFloating(anchor, el, opts);
    }
    function schedule(): void {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(run);
    }
    run();
    window.addEventListener('resize', schedule);
    window.addEventListener('scroll', schedule, true);
    const [anchor, el] = findRef.current();
    const observer = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(schedule) : null;
    if (observer && el) observer.observe(el);
    if (observer && anchor) observer.observe(anchor);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener('resize', schedule);
      window.removeEventListener('scroll', schedule, true);
      if (observer) observer.disconnect();
      if (placed) clear(placed);
    };
  }, [open, side, align, gap, fitHeight, matchWidth, skipBelow]);
}
