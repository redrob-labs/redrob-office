import * as React from 'react';
import { cx } from '../../internal/cx';
import {
  MARK_CJK,
  MARK_FACES,
  MARK_FAMILIES,
  MARK_RUN,
  MARK_SEAM,
  markHash,
  markInitials,
} from '../../internal/mark';

export interface AvatarMarkProps {
  /** The name the mark is generated from, and the source of its initial. */
  name?: string;
  /** Overrides the name as the hash input, so a mark can stay put when a name changes. */
  seed?: string | number;
  /** Pin the accent family instead of deriving it. */
  family?: (typeof MARK_FAMILIES)[number];
  /** Names the mark. Without it the SVG is decorative and hidden. */
  label?: string;
  className?: string;
}

/**
 * @deprecated Use Avatar (AvatarMark is internal to it in the October 2026 delivery). Kept for 1.x.
 *
 * A generated mark for someone with no picture: the gateway, in one of nine accent families.
 *
 * The threshold sits at the same height on every mark, with the same three faces behind it. Only the colour
 * family varies, derived from the name - a set of avatars whose diagonals sat at different angles would read
 * as a rendering bug, not as a family.
 *
 * The faces are drawn before the lit wedge so the wedge covers anything past the seam, and each face is
 * inset 5px so all three stay inside the circular crop.
 *
 * The initial sits left of centre, not centred. The lit wedge is on the right, so optical balance and seam
 * clearance want the same few pixels. CJK sets larger and without the negative tracking, because one Hangul
 * syllable is a full em where two Latin caps are not.
 */
export function AvatarMark(props: AvatarMarkProps): React.ReactElement {
  const seed = props.seed != null ? props.seed : props.name || '';
  const n = markHash(seed);
  const family =
    props.family && MARK_FAMILIES.indexOf(props.family) !== -1 ? props.family : MARK_FAMILIES[n % 9];
  const o = MARK_SEAM;
  const deep = `var(--accent-${family}-5)`;
  const lit = `var(--accent-${family}-1)`;
  const edge = `var(--accent-${family}-3)`;
  const text = markInitials(props.name);
  const cjk = MARK_CJK.test(text);

  const kids: React.ReactNode[] = [
    React.createElement('rect', { key: 'g', width: 40, height: 40, fill: deep }),
  ];

  for (let i = 1; i <= MARK_FACES; i++) {
    const lo = o - i * 5;
    kids.push(
      React.createElement('path', {
        key: `f${i}`,
        fill: edge,
        opacity: 0.16,
        d: `M${lo} 40L${lo + MARK_RUN} 0h1.4L${lo + 1.4} 40Z`,
      }),
    );
  }

  kids.push(React.createElement('path', { key: 'l', fill: lit, d: `M${o} 40L${o + MARK_RUN} 0H64V40Z` }));
  kids.push(
    React.createElement('path', {
      key: 's',
      fill: edge,
      d: `M${o} 40L${o + MARK_RUN} 0h1.9L${o + 1.9} 40Z`,
    }),
  );

  if (text) {
    kids.push(
      React.createElement(
        'text',
        {
          key: 't',
          x: 16,
          y: 20,
          fill: 'var(--redrob-white)',
          textAnchor: 'middle',
          dominantBaseline: 'central',
          style: {
            fontFamily: 'var(--font-sans)',
            fontSize: `${cjk ? 16 : 13.5}px`,
            fontWeight: 600,
            letterSpacing: cjk ? '0' : '-0.02em',
          },
        },
        text,
      ),
    );
  }

  return React.createElement(
    'svg',
    {
      className: cx('rr-avatar-mark', props.className),
      viewBox: '0 0 40 40',
      width: '100%',
      height: '100%',
      role: props.label ? 'img' : undefined,
      'aria-label': props.label,
      'aria-hidden': props.label ? undefined : 'true',
      focusable: 'false',
    },
    kids,
  );
}

export default AvatarMark;
