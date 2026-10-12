import * as React from 'react';
import { cx } from '../../internal/cx';

export interface SkeletonProps {
  variant?: 'text' | 'rect' | 'circle';
  width?: number | string;
  height?: number | string;
  /** Diameter, for `circle`. */
  size?: number;
  /** How many lines, for `text`. The last one is short, the way a paragraph ends. */
  lines?: number;
  className?: string;
  style?: React.CSSProperties;
}

/**
 * The shape of content that has not arrived, so the layout does not jump when it does.
 *
 * Right when the shape is known and the wait is short. Wrong as a permanent state: a skeleton that never
 * resolves is a page pretending to work. For an unknown wait use `Loader`, which can at least say so.
 *
 * Always `aria-hidden`. A screen reader has nothing to gain from placeholder bars, and the real status
 * belongs on a `Loader` or a live region beside it.
 *
 * The last line of a multi-line block is 62% wide, because a paragraph does not end flush and a stack of
 * equal bars reads as a table.
 */
export function Skeleton(props: SkeletonProps): React.ReactElement {
  const variant = props.variant || 'text';
  const style: React.CSSProperties = { ...props.style };
  if (props.width != null) style.width = typeof props.width === 'number' ? `${props.width}px` : props.width;
  if (props.height != null) {
    style.height = typeof props.height === 'number' ? `${props.height}px` : props.height;
  }
  if (variant === 'circle' && props.size != null) {
    // height before width, deliberately. The reference assigns them in one chained expression, which
    // evaluates right to left, so height enters the object first and React renders the declarations in
    // that order. Swapping them changes the emitted style attribute.
    style.height = `${props.size}px`;
    style.width = `${props.size}px`;
  }

  const lines = variant === 'text' ? props.lines || 1 : 1;

  if (lines > 1) {
    const out: React.ReactNode[] = [];
    for (let i = 0; i < lines; i++) {
      const last = i === lines - 1;
      out.push(
        React.createElement('span', {
          key: i,
          className: 'rr-skeleton rr-skeleton--text',
          style: { ...style, ...(last ? { width: '62%' } : null) },
        }),
      );
    }
    return React.createElement(
      'span',
      { className: cx('rr-skeleton-stack', props.className), 'aria-hidden': 'true' },
      out,
    );
  }

  return React.createElement('span', {
    className: cx('rr-skeleton', `rr-skeleton--${variant}`, props.className),
    style,
    'aria-hidden': 'true',
  });
}

export default Skeleton;
