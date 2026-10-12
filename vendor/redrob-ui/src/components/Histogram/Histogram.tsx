import * as React from 'react';
import { cx } from '../../internal/cx';

export interface HistogramProps {
  /** A count per bin, in bin order. */
  bins?: number[];
  /** A label per bin, e.g. "1-2", "3-5". */
  labels?: string[];
  /** Bins from this index on are drawn in the brand colour - the range the reader is aiming for. */
  highlightFrom?: number;
  /** Accessible name; the counts are appended to it. */
  alt?: string;
  className?: string;
}

/**
 * How a set of runs spreads across ranges of one figure, e.g. agent runs by actions per instruction.
 * Columns only, no axis: the counts are in the accessible name and each column's tooltip.
 */
export function Histogram(props: HistogramProps): React.ReactElement {
  const bins = props.bins || [];
  const labels = props.labels || [];
  const top = Math.max.apply(null, [1].concat(bins));
  const from = props.highlightFrom != null ? props.highlightFrom : Infinity;
  const counts = bins.map((b, i) => `${labels[i] || i + 1}: ${b}`).join(', ');
  const cols = { gridTemplateColumns: `repeat(${Math.max(1, bins.length)}, minmax(0, 1fr))` };
  return React.createElement('div', { className: cx('rr-histogram', props.className) }, [
    React.createElement(
      'div',
      { key: 'p', className: 'rr-histogram__plot', style: cols, role: 'img', 'aria-label': props.alt ? `${props.alt}: ${counts}` : counts },
      bins.map((b, i) =>
        React.createElement('span', {
          key: i,
          title: `${labels[i] || i + 1}: ${b}`,
          className: cx('rr-histogram__bin', i >= from && 'rr-histogram__bin--high'),
          style: { height: `${(b / top) * 100}%` },
        }),
      ),
    ),
    React.createElement(
      'div',
      { key: 'l', className: 'rr-histogram__labels', style: cols, 'aria-hidden': 'true' },
      labels.map((l, i) => React.createElement('span', { key: i }, l)),
    ),
  ]);
}

export default Histogram;
