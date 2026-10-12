import * as React from 'react';
import { cx } from '../../internal/cx';
import { useStableId } from '../../internal/ids';
import { docLocale } from '../../internal/datetime';
import { niceMax, seriesColor } from '../../internal/chart';
import { Table } from '../Table/Table';

export interface ChartSeries {
  name?: string;
  /** `null` is a gap, and a gap is drawn as a gap. */
  values?: Array<number | null>;
  color?: string;
  /** Index from which the values are estimates. Drawn in the 40° hatch, or dashed. */
  estimatedFrom?: number;
}

export interface ChartProps {
  kind?: 'bar' | 'line';
  series?: ChartSeries[];
  labels?: string[];
  title?: React.ReactNode;
  /** Accessible name when the title is not enough on its own. */
  alt?: string;
  height?: number;
  max?: number;
  locale?: string;
  format?: (v: number) => string;
  /** When the data was measured. Printed under the plot. */
  measuredAt?: string;
  /** Why points are missing. Printed with the count. */
  missingNote?: string;
  /** What the chart leaves out. Printed under the plot. */
  excluded?: string;
  labelHeader?: React.ReactNode;
  tableLabel?: React.ReactNode;
  hideTableLabel?: React.ReactNode;
  className?: string;
}

/**
 * A bar or line chart that says what it does not know.
 *
 * Square corners, butt caps, hairline rules rather than a grid - the brand's chart marks are three of the
 * surfaces that are square by rule.
 *
 * Four honesty behaviours, and they are the reason this component exists rather than a charting library:
 *
 * A gap is drawn as a gap. A missing point breaks the line into separate paths and draws no bar, and the
 * count of missing points is printed under the chart. Interpolating across a gap draws data nobody measured.
 *
 * Estimates get the brand's 40° hatch, not a second hue. An estimate is the same series in a different
 * state; a different colour makes it read as a different thing being measured.
 *
 * The measurement date and the exclusions are printed, not left to a caption somebody forgets to write.
 *
 * The figures are always available as a real table behind one button. A chart is an image to a screen reader
 * and a summary to everyone else, so the numbers have to be reachable without it.
 */
export function Chart(props: ChartProps): React.ReactElement {
  const id = useStableId('rr-chart');
  const kind = props.kind || 'bar';
  const series = props.series || [];
  const labels = props.labels || [];
  const locale = props.locale || docLocale();
  const [at, setAt] = React.useState<number | null>(null);
  const [table, setTable] = React.useState(false);

  const W = 640;
  const H = props.height || 220;
  const PAD = { t: 8, r: 8, b: 26, l: 46 };
  const iw = W - PAD.l - PAD.r;
  const ih = H - PAD.t - PAD.b;

  const all: number[] = [];
  series.forEach((s) => {
    (s.values || []).forEach((v) => {
      if (v != null) all.push(v);
    });
  });
  const max = props.max != null ? props.max : niceMax(Math.max.apply(null, all.concat([0])));
  const ticks = [0, max / 2, max];

  function fmtNum(v: number): string {
    if (props.format) return props.format(v);
    try {
      return new Intl.NumberFormat(locale, { maximumFractionDigits: 1 }).format(v);
    } catch {
      return String(v);
    }
  }

  const x = (i: number): number => PAD.l + (labels.length < 2 ? iw / 2 : (iw * i) / (labels.length - 1));
  const y = (v: number): number => PAD.t + ih - (ih * v) / (max || 1);

  const hatch = React.createElement(
    'pattern',
    {
      key: 'p',
      id: `${id}-est`,
      width: 7,
      height: 7,
      patternUnits: 'userSpaceOnUse',
      patternTransform: 'rotate(40)',
    },
    [
      React.createElement('rect', { key: 'b', width: 7, height: 7, fill: 'var(--surface-base)' }),
      React.createElement('rect', { key: 'l', width: 3, height: 7, fill: 'currentColor', opacity: 0.55 }),
    ],
  );

  const marks: React.ReactNode[] = [];
  series.forEach((s, si) => {
    const color = s.color || seriesColor(si);
    const vals = s.values || [];
    const estFrom = s.estimatedFrom == null ? Infinity : s.estimatedFrom;

    if (kind === 'bar') {
      const band = iw / Math.max(labels.length, 1);
      const bw = Math.max(4, (band - 8) / Math.max(series.length, 1) - 2);
      vals.forEach((v, i) => {
        if (v == null) return;
        const bx =
          PAD.l + band * i + (band - bw * series.length - 2 * (series.length - 1)) / 2 + si * (bw + 2);
        marks.push(
          React.createElement('rect', {
            key: `${si}-${i}`,
            x: bx,
            y: y(v),
            width: bw,
            height: Math.max(1, PAD.t + ih - y(v)),
            fill: i >= estFrom ? `url(#${id}-est)` : color,
            color,
            stroke: i >= estFrom ? color : 'none',
            strokeWidth: i >= estFrom ? 1 : 0,
            onMouseEnter: () => setAt(i),
            onMouseLeave: () => setAt(null),
          }),
        );
      });
    } else {
      let run: Array<[number, number, number]> = [];
      const runs: Array<Array<[number, number, number]>> = [];
      vals.forEach((v, i) => {
        if (v == null) {
          if (run.length) runs.push(run);
          run = [];
        } else {
          run.push([x(i), y(v), i]);
        }
      });
      if (run.length) runs.push(run);

      const d = (pts: Array<[number, number, number]>): string =>
        pts.map((p, k) => `${k ? 'L' : 'M'}${p[0].toFixed(1)} ${p[1].toFixed(1)}`).join(' ');

      runs.forEach((r, ri) => {
        const solid = r.filter((p) => p[2] <= estFrom);
        const est = r.filter((p) => p[2] >= estFrom);
        if (solid.length > 1) {
          marks.push(
            React.createElement('path', {
              key: `${si}-s${ri}`,
              d: d(solid),
              fill: 'none',
              stroke: color,
              strokeWidth: 2,
              strokeLinecap: 'butt',
              strokeLinejoin: 'miter',
            }),
          );
        }
        if (est.length > 1) {
          marks.push(
            React.createElement('path', {
              key: `${si}-e${ri}`,
              d: d(est),
              fill: 'none',
              stroke: color,
              strokeWidth: 2,
              strokeLinecap: 'butt',
              strokeDasharray: '5 4',
            }),
          );
        }
      });

      vals.forEach((v, i) => {
        if (v == null) return;
        marks.push(
          React.createElement('rect', {
            key: `${si}-m${i}`,
            x: x(i) - 4,
            y: y(v) - 4,
            width: 8,
            height: 8,
            fill: color,
            stroke: 'var(--surface-base)',
            strokeWidth: 2,
          }),
        );
      });
    }
  });

  const gaps: number[] = [];
  series.forEach((s) => {
    (s.values || []).forEach((v, i) => {
      if (v == null && gaps.indexOf(i) === -1) gaps.push(i);
    });
  });

  const honest: string[] = [];
  if (props.measuredAt) honest.push(`Measured ${props.measuredAt}`);
  if (gaps.length) {
    honest.push(
      `${gaps.length}${gaps.length === 1 ? ' point missing' : ' points missing'}${
        props.missingNote ? `: ${props.missingNote}` : ''
      }`,
    );
  }
  if (series.some((s) => s.estimatedFrom != null)) honest.push('The hatched part is estimated');
  if (props.excluded) honest.push(`Leaves out ${props.excluded}`);

  return React.createElement('figure', { className: cx('rr-chart', props.className) }, [
    props.title
      ? React.createElement('figcaption', { className: 'rr-chart__title', key: 't' }, props.title)
      : null,
    series.length > 1
      ? React.createElement(
          'div',
          { className: 'rr-chart__legend', key: 'l' },
          series.map((s, si) =>
            React.createElement('span', { key: si, className: 'rr-chart__key' }, [
              React.createElement('span', {
                key: 'm',
                className: 'rr-chart__swatch',
                style: { background: s.color || seriesColor(si) },
              }),
              s.name,
            ]),
          ),
        )
      : null,
    React.createElement(
      'svg',
      {
        key: 's',
        className: 'rr-chart__plot',
        viewBox: `0 0 ${W} ${H}`,
        role: 'img',
        'aria-label': props.alt || props.title,
      },
      [
        React.createElement('defs', { key: 'd' }, hatch),
        React.createElement(
          'g',
          { key: 'g', className: 'rr-chart__rules' },
          ticks.map((t, i) =>
            React.createElement('g', { key: i }, [
              React.createElement('line', { key: 'l', x1: PAD.l, x2: W - PAD.r, y1: y(t), y2: y(t) }),
              React.createElement(
                'text',
                { key: 't', x: PAD.l - 8, y: y(t) + 4, textAnchor: 'end' },
                fmtNum(t),
              ),
            ]),
          ),
        ),
        React.createElement('g', { key: 'm' }, marks),
        React.createElement(
          'g',
          { key: 'x', className: 'rr-chart__xlab' },
          labels.map((lb, i) => {
            const band = iw / Math.max(labels.length, 1);
            // A label is about 7 characters at 11px. When there are more points than room for one each
            // (thirty days on a half-width card), every label is drawn on top of its neighbours and none
            // can be read. So only every step-th one is printed, counted back from the last point so the
            // most recent is always named, plus whichever point is hovered. Every label is still in the
            // figures table; this only decides which ones fit under the axis.
            const step = Math.max(1, Math.ceil(labels.length / Math.max(1, Math.floor(iw / 56))));
            if (at !== i && (labels.length - 1 - i) % step !== 0) return null;
            const cx2 = kind === 'bar' ? PAD.l + band * i + band / 2 : x(i);
            return React.createElement(
              'text',
              {
                key: i,
                x: cx2,
                y: H - 8,
                textAnchor: 'middle',
                className: at === i ? 'rr-chart__xlab--on' : null,
              },
              lb,
            );
          }),
        ),
      ],
    ),
    honest.length
      ? React.createElement('p', { className: 'rr-chart__honest', key: 'h' }, honest.join(' · '))
      : null,
    React.createElement(
      'button',
      {
        key: 'b',
        type: 'button',
        className: 'rr-chart__table-toggle',
        'aria-expanded': String(table),
        onClick: () => setTable(!table),
      },
      table ? props.hideTableLabel || 'Hide the figures' : props.tableLabel || 'Show the figures',
    ),
    table
      ? React.createElement(
          'div',
          { key: 'tb', className: 'rr-chart__table' },
          React.createElement(Table, {
            columns: [
              { key: 'l', header: props.labelHeader || '', grow: true },
              ...series.map((s, si) => ({
                key: `s${si}`,
                header: s.name || `Series ${si + 1}`,
                align: 'right' as const,
              })),
            ],
            rows: labels.map((lb, i) => {
              const row: Record<string, unknown> = { id: i, l: lb };
              series.forEach((s, si) => {
                const v = (s.values || [])[i];
                row[`s${si}`] = v == null ? '-' : fmtNum(v);
              });
              return row;
            }),
            dense: true,
          }),
        )
      : null,
  ]);
}

export default Chart;
