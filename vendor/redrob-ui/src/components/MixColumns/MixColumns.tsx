import * as React from 'react';
import { cx } from '../../internal/cx';
import { pct, MixStep } from '../../internal/insight';

export interface MixColumnsProps {
  /** One mix per period (each a share 0-100 per step), oldest first. An all-zero mix is an empty column. */
  periods?: Array<Array<number | null>>;
  /** A label per period, e.g. the week's start date. Every other one is printed under the columns. */
  labels?: string[];
  steps?: MixStep[];
  /** Accessible name of the whole chart. */
  alt?: string;
  /** Prefix of each column's tooltip, before its label. "Week of" by default. */
  periodPrefix?: string;
  className?: string;
}

/**
 * The same ordinal mix over time: one 100% column per period, the shallowest step at the bottom, so a
 * shift towards deeper work reads as the dark part of the columns growing.
 *
 * An empty period is drawn as an empty track, not left out: dropping it would close the gap and make two
 * weeks apart look adjacent.
 */
export function MixColumns(props: MixColumnsProps): React.ReactElement {
  const periods = props.periods || [];
  const labels = props.labels || [];
  const steps = props.steps || [];
  const prefix = props.periodPrefix != null ? props.periodPrefix : 'Week of';
  const cols = { gridTemplateColumns: `repeat(${Math.max(1, periods.length)}, minmax(0, 1fr))` };
  return React.createElement('div', { className: cx('rr-mixcols', props.className) }, [
    React.createElement(
      'div',
      { className: 'rr-mixcols__plot', style: cols, role: 'img', 'aria-label': props.alt || 'Mix by period', key: 'p' },
      periods.map((mix, w) => {
        const title = `${prefix} ${labels[w] || ''}: ${steps.map((s, i) => `${s.name} ${pct(mix[i])}`).join(', ')}`;
        return React.createElement(
          'div',
          { className: 'rr-mixcols__col', key: w, title },
          mix.map((v, i) =>
            v && v > 0
              ? React.createElement('span', { key: i, className: `rr-mix__seg rr-mix__seg--${Math.min(i, 5)}`, style: { height: `${v}%` } })
              : null,
          ),
        );
      }),
    ),
    React.createElement(
      'div',
      { className: 'rr-mixcols__labels', style: cols, key: 'l', 'aria-hidden': 'true' },
      labels.map((l, i) => React.createElement('span', { key: i }, i % 2 === 0 ? l : '')),
    ),
  ]);
}

export default MixColumns;
