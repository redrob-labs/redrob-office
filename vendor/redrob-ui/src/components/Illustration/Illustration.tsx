import * as React from 'react';
import { cx } from '../../internal/cx';
import { illustrations, CONSTRUCTIONS } from '../../internal/illustrations';

export interface IllustrationProps {
  /** Which drawing. An unknown name renders nothing rather than a broken frame. */
  name?: string;
  size?: 'sm' | 'md' | 'lg';
  /** Names the drawing. Leave it off when the drawing only repeats adjacent text. */
  alt?: string;
  className?: string;
  style?: React.CSSProperties;
}

/**
 * One of the system's drawings, at one of three sizes.
 *
 * Constructions carry the identity and get the larger frame; everything else is an Object and is
 * drawn at icon scale, for an empty state or a failure. The split is what keeps a "no results" panel
 * from being handed the full-bleed treatment meant for a launch page.
 *
 * An unknown `name` returns `null` on purpose: a missing drawing should leave a gap a reviewer
 * notices, not a placeholder box that ships.
 */
export function Illustration(props: IllustrationProps): React.ReactElement | null {
  const art = props.name ? illustrations[props.name] : undefined;
  if (!art) return null;
  const size = props.size || 'md';

  return React.createElement(
    'span',
    {
      className: cx(
        'rr-ill',
        `rr-ill--${size}`,
        (CONSTRUCTIONS as readonly string[]).indexOf(props.name as string) === -1
          ? 'rr-ill--object'
          : 'rr-ill--construction',
        props.className,
      ),
      style: props.style,
    },
    art({ alt: props.alt, width: '100%', height: '100%' }),
  );
}

export default Illustration;
