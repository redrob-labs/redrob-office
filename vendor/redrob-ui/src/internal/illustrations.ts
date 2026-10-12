import * as React from 'react';

/**
 * The system's illustration set: constructions built from the mark's own geometry, and objects at
 * icon-grid scale for empty states and failures.
 *
 * Every line is straight or on the rake, there is no perspective, no three-quarter view and no drop
 * shadow. `50-not-generated.md` says what this system refuses to look like; these are the other half
 * of that sentence, so a new drawing that reaches for a gradient blob does not belong here.
 */

/** tan 40 - the same number the tick and every gradient use. */
export const RAKE = 0.8391;

/** Brand ink, for the one line in a drawing that carries the meaning. */
const ACCENT = 'var(--ink-brand)';
/** The only fill a drawing gets. */
const TINT = 'var(--surface-brand-subtle)';

export interface IllustrationArtProps extends React.SVGProps<SVGSVGElement> {
  /** Names the drawing. Without it the SVG is presentational and hidden from assistive tech. */
  alt?: string;
}

type Art = (props: IllustrationArtProps) => React.ReactElement;

/** One 160x120 frame, shared by every drawing, so a drawing carries only its own lines. */
function ill(children: React.ReactNode[]): Art {
  return (props: IllustrationArtProps = {}) =>
    React.createElement(
      'svg',
      {
        viewBox: '0 0 160 120',
        fill: 'none',
        stroke: 'currentColor',
        strokeWidth: 3,
        strokeLinecap: 'butt',
        strokeLinejoin: 'miter',
        role: props.alt ? 'img' : 'presentation',
        'aria-hidden': props.alt ? undefined : 'true',
        'aria-label': props.alt,
        ...props,
      },
      children,
    );
}

/** Keyed element, because every drawing is an array of siblings. */
const a = (tag: string, attrs: Record<string, unknown>, key: string): React.ReactElement =>
  React.createElement(tag, { key, ...attrs });

/**
 * Constructions read abstractly and carry the identity. Everything else is an Object: a thing, drawn
 * at the size of an icon, for an empty state or a failure. `Illustration` uses this split to pick the
 * scale class, so adding a name here without deciding which it is makes it an Object by default.
 */
export const CONSTRUCTIONS = ['threshold', 'layers', 'opening', 'reach'] as const;

export const illustrations: Record<string, Art> = {
  /* --- Constructions ------------------------------------------------------ */

  /** A ground with one raked edge and the light on the far side of it. The whole identity in four lines. */
  threshold: ill([
    a('path', { d: 'M20 104 L120 20 H140 V104 Z', fill: TINT, stroke: 'none' }, 'a'),
    a('rect', { x: 20, y: 20, width: 120, height: 84, fill: 'none', stroke: 'currentColor' }, 'b'),
    a('path', { d: 'M20 104 L120 20', stroke: ACCENT }, 'c'),
  ]),

  /** Three faces sheared to the rake, stepping open: a thing that has been opened, not one that guards. */
  layers: ill([
    a('path', { d: 'M24 100 L24 46 L48 26 L48 80 Z', fill: TINT, stroke: 'currentColor' }, 'a'),
    a('path', { d: 'M64 100 L64 38 L88 18 L88 80 Z', fill: 'none', stroke: 'currentColor' }, 'b'),
    a('path', { d: 'M104 100 L104 46 L128 26 L128 80 Z', fill: 'none', stroke: ACCENT }, 'c'),
    a('line', { x1: 14, y1: 100, x2: 146, y2: 100 }, 'd'),
  ]),

  /** Light leaving a doorway along the brand's angle. One square corner on the opening, three cut. */
  opening: ill([
    a('path', { d: 'M40 104 V34 H88 L100 46 V104', fill: TINT, stroke: 'currentColor' }, 'a'),
    a('line', { x1: 20, y1: 104, x2: 146, y2: 104 }, 'b'),
    a('path', { d: 'M100 62 L134 34', stroke: ACCENT }, 'c'),
    a('path', { d: 'M100 78 L142 44', stroke: ACCENT }, 'd'),
    a('path', { d: 'M100 94 L138 63', stroke: ACCENT, opacity: 0.45 }, 'e'),
  ]),

  /** A boundary, and one line that does not stop at it. */
  reach: ill([
    a('line', { x1: 76, y1: 12, x2: 76, y2: 108, strokeWidth: 4 }, 'a'),
    a('path', { d: 'M22 84 H68 M22 62 H68', stroke: 'currentColor', opacity: 0.4 }, 'b'),
    a('path', { d: 'M22 40 H110', stroke: 'currentColor' }, 'c'),
    a('path', { d: 'M110 40 L140 15', stroke: ACCENT }, 'd'),
  ]),

  /* --- Objects ------------------------------------------------------------ */

  /** A door standing open, with what is through it on the floor. */
  door: ill([
    a('path', { d: 'M34 104 V26 H84 V104', fill: 'none', stroke: 'currentColor' }, 'a'),
    a('path', { d: 'M84 104 V26 L124 14 V104 Z', fill: TINT, stroke: 'currentColor' }, 'b'),
    a('line', { x1: 18, y1: 104, x2: 146, y2: 104 }, 'c'),
    a('path', { d: 'M34 104 L62 80', stroke: ACCENT }, 'd'),
    a('circle', { cx: 92, cy: 66, r: 3, fill: 'currentColor', stroke: 'none' }, 'e'),
  ]),

  /** Stopped here on purpose: a run that reached something which leaves the building and waits. */
  waiting: ill([
    a('rect', { x: 20, y: 46, width: 42, height: 42, fill: TINT, stroke: 'currentColor' }, 'a'),
    a('path', { d: 'M86 104 L118 16', stroke: ACCENT, strokeWidth: 6 }, 'b'),
    a(
      'rect',
      {
        x: 120,
        y: 46,
        width: 26,
        height: 42,
        fill: 'none',
        stroke: 'currentColor',
        opacity: 0.32,
        strokeDasharray: '5 4',
      },
      'c',
    ),
    a('path', { d: 'M66 67 H80', stroke: 'currentColor' }, 'd'),
  ]),

  /** A page with nothing readable on it. For the two files in every run that turn out to be scans. */
  unreadable: ill([
    a('path', { d: 'M42 14 H104 L120 30 V106 H42 Z', fill: 'none', stroke: 'currentColor' }, 'a'),
    a('path', { d: 'M104 14 V30 H120', fill: 'none', stroke: 'currentColor' }, 'b'),
    a('path', { d: 'M56 52 H92 M56 68 H104 M56 84 H80', stroke: 'currentColor', opacity: 0.28 }, 'c'),
    a('path', { d: 'M46 96 L116 34', stroke: ACCENT }, 'd'),
  ]),

  /** Nothing here yet, and the shape of what would be. */
  nothingYet: ill([
    a('path', { d: 'M22 100 V38 H62 L72 50 H138 V100 Z', fill: 'none', stroke: 'currentColor' }, 'a'),
    a('path', { d: 'M40 76 H92', stroke: ACCENT }, 'b'),
    a('path', { d: 'M66 62 V90', stroke: ACCENT }, 'c'),
    a('path', { d: 'M108 68 H122 M108 84 H122', stroke: 'currentColor', opacity: 0.25 }, 'd'),
  ]),
};

export type IllustrationName = keyof typeof illustrations;
export const illustrationNames = Object.keys(illustrations);
