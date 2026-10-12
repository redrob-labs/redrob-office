import * as React from 'react';
import { cx } from '../../internal/cx';

export interface FigureProps {
  src?: string;
  srcSet?: string;
  alt?: string;
  /** CSS aspect ratio. `16 / 10` by default. */
  ratio?: string;
  caption?: React.ReactNode;
  /** Who made it, or where it came from. */
  credit?: React.ReactNode;
  /** Loads immediately. For an image above the fold. */
  eager?: boolean;
  className?: string;
  /** Replaces the image entirely - a chart, a diagram, an embed. */
  children?: React.ReactNode;
}

/**
 * A framed picture with a caption.
 *
 * There is deliberately no `bleed` prop. Running a picture off the page edge needs to know where that edge is, which
 * is the row's business rather than the figure's - `FeatureRow` owns `--rail-inset` and bleeds its own media slot.
 *
 * Figure carried a `bleed` prop for months that emitted a class no stylesheet ever defined, so it silently did
 * nothing. Better no prop than a prop that no-ops: the second kind cannot be noticed.
 */
export function Figure(props: FigureProps): React.ReactElement {
  const ratio = props.ratio || '16 / 10';

  return React.createElement('figure', { className: cx('rr-figure', props.className) }, [
    React.createElement(
      'div',
      { className: 'rr-figure__frame', key: 'f', style: { aspectRatio: ratio } },
      props.children ||
        React.createElement('img', {
          src: props.src,
          srcSet: props.srcSet,
          alt: props.alt || '',
          loading: props.eager ? 'eager' : 'lazy',
          decoding: 'async',
        }),
    ),
    React.createElement('figcaption', { className: 'rr-figure__caption', key: 'c' }, [
      React.createElement('span', { key: 't' }, props.caption),
      props.credit
        ? React.createElement('span', { className: 'rr-figure__credit', key: 'r' }, props.credit)
        : null,
    ]),
  ]);
}

export default Figure;
