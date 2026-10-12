import * as React from 'react';
import { cx } from '../../internal/cx';

export interface SparklineProps {
  /** The series. `null` marks a gap, and the gap is drawn as a gap. */
  values?: Array<number | null>;
  color?: string;
  /** Names the trend. Defaults to "Trend", which is thin - say what it is a trend of. */
  alt?: string;
  className?: string;
}

/**
 * A trend line the size of a word, for beside a number.
 *
 * No axes, no grid, no labels. It shows shape, not values - when a reader needs to read a figure off it, it
 * should be a `Chart`.
 *
 * Missing points break the line rather than being interpolated across. A sparkline that joins straight
 * through a gap draws data that was never measured, which is the one thing a chart must not do.
 *
 * Under two points it renders nothing: two is the minimum for a line, and a single dot pretending to be a
 * trend is worse than an empty space.
 */
export function Sparkline(props: SparklineProps): React.ReactElement | null {
  const series = props.values || [];
  const vals = series.filter((v): v is number => v != null);
  if (vals.length < 2) return null;

  const W = 96;
  const H = 24;
  const lo = Math.min.apply(null, vals);
  const hi = Math.max.apply(null, vals);
  const span = hi - lo || 1;

  const pts = series.map((v, i) => {
    if (v == null) return null;
    return [(W * i) / (series.length - 1 || 1), H - 2 - ((H - 4) * (v - lo)) / span] as [number, number];
  });

  const runs: Array<Array<[number, number]>> = [];
  let run: Array<[number, number]> = [];
  pts.forEach((p) => {
    if (!p) {
      if (run.length) runs.push(run);
      run = [];
    } else {
      run.push(p);
    }
  });
  if (run.length) runs.push(run);

  return React.createElement(
    'svg',
    {
      className: cx('rr-spark', props.className),
      viewBox: `0 0 ${W} ${H}`,
      role: 'img',
      'aria-label': props.alt || 'Trend',
    },
    runs.map((r, i) =>
      React.createElement('path', {
        key: i,
        fill: 'none',
        stroke: props.color || 'currentColor',
        strokeWidth: 2,
        strokeLinecap: 'butt',
        strokeLinejoin: 'miter',
        d: r.map((p, k) => `${k ? 'L' : 'M'}${p[0].toFixed(1)} ${p[1].toFixed(1)}`).join(' '),
      }),
    ),
  );
}

export default Sparkline;
