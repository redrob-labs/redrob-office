import * as React from 'react';
import { cx } from '../../internal/cx';
import { sparkPath } from '../../internal/mark';

export interface StatProps {
  label?: React.ReactNode;
  value?: React.ReactNode;
  /** The change, as a number. Its sign decides the direction. */
  delta?: number;
  /** Unit after the delta. `%` by default. */
  deltaSuffix?: string;
  /** `false` when down is the good direction - cost, latency, churn. */
  upIsGood?: boolean;
  /** What the delta is measured against: "vs last month". */
  period?: React.ReactNode;
  /** A short series drawn beside the figure. Needs at least two points. */
  trend?: number[];
  wash?: boolean | 'brand';
  className?: string;
}

/**
 * One number that matters, with what it is and which way it moved.
 *
 * `upIsGood={false}` exists because up is not always good. Cost, latency and churn going up is bad news, and
 * a component that always paints a rise green tells that story backwards.
 *
 * The direction is carried by an arrow as well as the colour, so it survives for a reader who cannot
 * separate the green from the red.
 */
export function Stat(props: StatProps): React.ReactElement {
  const trend = props.trend;
  const dir =
    props.delta == null ? null : props.delta > 0 ? 'up' : props.delta < 0 ? 'down' : 'flat';
  const good = props.upIsGood === false ? dir === 'down' : dir === 'up';
  const deltaClass =
    dir === 'flat' ? 'rr-stat__delta--flat' : good ? 'rr-stat__delta--good' : 'rr-stat__delta--bad';

  let spark: React.ReactNode = null;
  if (trend && trend.length > 1) {
    const w = 120;
    const hgt = 32;
    const pad = 3;
    const d = sparkPath(trend, w - pad * 2, hgt - pad * 2);
    const minV = Math.min.apply(null, trend);
    const maxV = Math.max.apply(null, trend);
    const lastY = hgt - pad - ((trend[trend.length - 1] - minV) / (maxV - minV || 1)) * (hgt - pad * 2);
    spark = React.createElement(
      'svg',
      {
        // Sits in a children array beside the delta and the period, so it carries its own key.
        key: 'spark',
        className: 'rr-stat__spark',
        width: w,
        height: hgt,
        viewBox: `0 0 ${w} ${hgt}`,
        'aria-hidden': 'true',
        focusable: 'false',
      },
      [
        React.createElement('path', {
          key: 'p',
          d,
          transform: `translate(${pad},${pad})`,
          fill: 'none',
          strokeWidth: 2,
          strokeLinecap: 'butt',
          strokeLinejoin: 'miter',
          className: 'rr-stat__spark-line',
        }),
        React.createElement('circle', {
          key: 'c',
          cx: w - pad,
          cy: lastY,
          r: 4,
          className: 'rr-stat__spark-dot',
        }),
      ],
    );
  }

  return React.createElement(
    'div',
    {
      className: cx(
        'rr-stat',
        props.wash && 'rr-wash rr-grain',
        props.wash === 'brand' && 'rr-wash--brand',
        props.className,
      ),
    },
    [
      React.createElement('span', { className: 'rr-stat__label', key: 'l' }, props.label),
      React.createElement('span', { className: 'rr-stat__value', key: 'v' }, props.value),
      React.createElement('div', { className: 'rr-stat__foot', key: 'f' }, [
        dir
          ? React.createElement('span', { className: cx('rr-stat__delta', deltaClass), key: 'd' }, [
              React.createElement(
                'span',
                { className: 'rr-stat__arrow', key: 'a', 'aria-hidden': 'true' },
                dir === 'up' ? '↑' : dir === 'down' ? '↓' : '→',
              ),
              React.createElement(
                'span',
                { key: 't' },
                `${(props.delta as number) > 0 ? '+' : ''}${props.delta}${props.deltaSuffix || '%'}`,
              ),
              props.period
                ? React.createElement('span', { className: 'rr-stat__period', key: 'p' }, props.period)
                : null,
            ])
          : props.period
            ? React.createElement('span', { className: 'rr-stat__period', key: 'p' }, props.period)
            : null,
        spark,
      ]),
    ],
  );
}

export default Stat;
