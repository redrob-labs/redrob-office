import * as React from 'react';
import { cx } from './cx';
import { GuideScore, GuideWeights, guideTotal } from './guide';

/**
 * The comparison a reader makes before reading any detail: how the picks on one task stand against each
 * other. Every figure is relative to the best pick shown for this task, so a strip reads the same way on
 * every row and nothing pretends to compare across tasks, whose scores come from different benchmarks.
 */

export type GlanceKey = 'quality' | 'reliability' | 'speed' | 'value';

/** `value` is the cost score: higher is cheaper for the work. */
export const GLANCE_DIMS: ReadonlyArray<{ key: GlanceKey; score: keyof GuideScore; label: string }> = [
  { key: 'quality', score: 'quality', label: 'Quality' },
  { key: 'reliability', score: 'reliability', label: 'Reliability' },
  { key: 'speed', score: 'speed', label: 'Speed' },
  { key: 'value', score: 'cost', label: 'Value' },
];

export interface GlancePick {
  id: string;
  score?: GuideScore;
  monthly?: number;
  benchmark?: boolean;
  kind?: string;
}

export interface GuideGlance {
  /** The best score shown on this task, per dimension. */
  best: Record<GlanceKey, number>;
  /** Ranked picks whose total is within the 95% intervals of #1's: a tie, whatever the rank says. */
  tied: Record<string, true>;
  /**
   * Most quality per dollar among picks with at least 80% of the best quality, so a cheap pick that is
   * plainly worse never wins it; null when there is no contest.
   */
  bestValue: string | null;
}

/** Five steps against the best on the task: 95%, 85%, 70%, 50% of it, and below. 0 when there is no figure. */
export function glanceLevel(value: number | undefined, best: number): number {
  if (value == null || !(best > 0)) return 0;
  const r = value / best;
  return r >= 0.95 ? 5 : r >= 0.85 ? 4 : r >= 0.7 ? 3 : r >= 0.5 ? 2 : 1;
}

export function guideGlance(picks: GlancePick[], w: GuideWeights): GuideGlance {
  const best = { quality: 0, reliability: 0, speed: 0, value: 0 } as Record<GlanceKey, number>;
  const ranked = picks.filter((k) => !k.benchmark && k.score);
  ranked.forEach((k) => {
    GLANCE_DIMS.forEach((d) => {
      const v = (k.score as GuideScore)[d.score];
      if (typeof v === 'number' && v > best[d.key]) best[d.key] = v;
    });
  });
  const tied: Record<string, true> = {};
  const top = ranked[0];
  const topTotal = top ? guideTotal(top, w) : null;
  const topCi = top && top.score ? top.score.ci : undefined;
  if (top && topTotal != null && topCi) {
    ranked.slice(1).forEach((k) => {
      const t = guideTotal(k, w);
      const ci = k.score ? k.score.ci : undefined;
      if (t != null && ci && Math.abs(topTotal - t) < topCi + ci) tied[k.id] = true;
    });
  }
  let bestValue: string | null = null;
  let bestRatio = 0;
  if (ranked.length > 1) {
    ranked.forEach((k) => {
      const q = (k.score as GuideScore).quality;
      if (q == null || !(k.monthly && k.monthly > 0) || q < best.quality * 0.8) return;
      const ratio = q / k.monthly;
      if (ratio > bestRatio) {
        bestRatio = ratio;
        bestValue = k.id;
      }
    });
  }
  return { best, tied, bestValue };
}

export interface GlanceLabels {
  quality?: string;
  reliability?: string;
  speed?: string;
  value?: string;
  /** Read after a dimension's figure, e.g. "best here 98". */
  bestHere?: (best: string) => string;
  /** On a strip whose ranking is partly estimated. */
  estimated?: string;
  /** "{n} of 5", for the strip's accessible name. */
  of?: (level: number) => string;
}

function dimLabel(d: { key: GlanceKey; label: string }, labels: GlanceLabels): string {
  return labels[d.key] || d.label;
}

/** The column heads above the list, aligned with every row's strip. Decorative: each strip names itself. */
export function GlanceHead(props: { labels: GlanceLabels }): React.ReactElement {
  return React.createElement('div', { className: 'rr-guide__glancehead', 'aria-hidden': 'true' }, [
    React.createElement('span', { key: 'r' }),
    React.createElement(
      'span',
      { key: 'd', className: 'rr-guide__glancecols' },
      GLANCE_DIMS.map((d) => React.createElement('span', { key: d.key }, dimLabel(d, props.labels))),
    ),
  ]);
}

/** Four five-step meters for one pick. Hatched when the ranking behind it is partly estimated. */
export function GlanceStrip(props: { pick: GlancePick; glance: GuideGlance; labels: GlanceLabels }): React.ReactElement {
  const s = (props.pick.score || {}) as GuideScore;
  const labels = props.labels;
  const estimated = props.pick.kind === 'estimate';
  const of = labels.of || ((n: number) => `${n} of 5`);
  const spoken = GLANCE_DIMS.map((d) => `${dimLabel(d, labels)} ${of(glanceLevel(s[d.score], props.glance.best[d.key]))}`);
  if (estimated) spoken.push(labels.estimated || 'Partly estimated');
  return React.createElement(
    'span',
    { className: cx('rr-guide__glance', estimated && 'is-estimated'), role: 'img', 'aria-label': spoken.join(', ') },
    GLANCE_DIMS.map((d) => {
      const v = s[d.score];
      const best = props.glance.best[d.key];
      const level = glanceLevel(v, best);
      const steps: React.ReactNode[] = [];
      for (let i = 1; i <= 5; i++) steps.push(React.createElement('i', { key: i, className: i <= level ? 'is-on' : null }));
      const figure = typeof v === 'number' ? v.toFixed(0) : '-';
      const bestHere = labels.bestHere ? labels.bestHere(best.toFixed(0)) : `best here ${best.toFixed(0)}`;
      return React.createElement(
        'span',
        { key: d.key, className: 'rr-guide__glancedim', title: `${dimLabel(d, labels)} ${figure} (${bestHere})` },
        steps,
      );
    }),
  );
}

export interface GuideMapLabels {
  /** The chart's accessible name. */
  title?: string;
  quality?: string;
  price?: string;
  /** The line through the picks nothing beats on both quality and price. */
  frontier?: string;
  /** A dot's accessible name, e.g. "#2 Claude Sonnet 5.5: quality 90, $6 a month". */
  point?: (rank: number | null, name: string, quality: string, price: string) => string;
}

export interface GuideMapPick extends GlancePick {
  name: string;
}

const W = 320;
const H = 196;
const PAD = { l: 34, r: 14, t: 14, b: 34 };

/**
 * Quality against price per month for the picks on one task, price on a log scale because the picks span
 * a 1x-100x range. The picks nothing beats on both are joined: anything off that line costs more for less.
 * Each dot is a control that opens its pick, so the chart is a way in, not only a picture.
 */
export function GuideMap(props: {
  picks: GuideMapPick[];
  rankOf: Record<string, number | null>;
  current?: string;
  onSelect: (id: string) => void;
  price: (monthly: number) => string;
  labels: GuideMapLabels;
}): React.ReactElement | null {
  const pts = props.picks.filter(
    (k) => k.score && typeof k.score.quality === 'number' && k.monthly != null && k.monthly > 0,
  );
  if (pts.length < 2) return null;
  const L = props.labels;
  const prices = pts.map((k) => k.monthly as number);
  const qs = pts.map((k) => (k.score as GuideScore).quality as number);
  const lo = Math.log(Math.min.apply(null, prices) / 1.5);
  const hi = Math.log(Math.max.apply(null, prices) * 1.5);
  const qlo = Math.max(0, Math.floor((Math.min.apply(null, qs) - 6) / 5) * 5);
  const qhi = 100;
  const x = (m: number): number => PAD.l + ((Math.log(m) - lo) / (hi - lo || 1)) * (W - PAD.l - PAD.r);
  const y = (q: number): number => PAD.t + (1 - (q - qlo) / (qhi - qlo || 1)) * (H - PAD.t - PAD.b);
  // Cheapest first; a pick joins the line only by beating the quality of everything cheaper.
  const frontier: GuideMapPick[] = [];
  let bar = -Infinity;
  pts
    .filter((k) => !k.benchmark)
    .slice()
    .sort((a, b) => (a.monthly as number) - (b.monthly as number))
    .forEach((k) => {
      const q = (k.score as GuideScore).quality as number;
      if (q > bar) {
        frontier.push(k);
        bar = q;
      }
    });
  const onLine: Record<string, true> = {};
  frontier.forEach((k) => {
    onLine[k.id] = true;
  });
  const point = L.point || ((r: number | null, n: string, q: string, p: string) => `${r != null ? `#${r} ` : ''}${n}: quality ${q}, ${p} a month`);
  const children: React.ReactNode[] = [
    React.createElement('line', { key: 'xa', className: 'rr-guide__mapaxis', x1: PAD.l, y1: H - PAD.b, x2: W - PAD.r, y2: H - PAD.b }),
    React.createElement('line', { key: 'ya', className: 'rr-guide__mapaxis', x1: PAD.l, y1: PAD.t, x2: PAD.l, y2: H - PAD.b }),
    React.createElement('text', { key: 'yt', className: 'rr-guide__maptick', x: PAD.l - 6, y: y(qhi) + 4, textAnchor: 'end' }, String(qhi)),
    React.createElement('text', { key: 'yb', className: 'rr-guide__maptick', x: PAD.l - 6, y: y(qlo) + 4, textAnchor: 'end' }, String(qlo)),
    React.createElement('text', { key: 'xl', className: 'rr-guide__maptick', x: PAD.l, y: H - PAD.b + 14, textAnchor: 'start' }, props.price(Math.exp(lo))),
    React.createElement('text', { key: 'xr', className: 'rr-guide__maptick', x: W - PAD.r, y: H - PAD.b + 14, textAnchor: 'end' }, props.price(Math.exp(hi))),
    React.createElement('text', { key: 'xn', className: 'rr-guide__mapname', x: (PAD.l + W - PAD.r) / 2, y: H - 6, textAnchor: 'middle' }, L.price || 'Price per month'),
    React.createElement(
      'text',
      { key: 'yn', className: 'rr-guide__mapname', x: 10, y: (PAD.t + H - PAD.b) / 2, textAnchor: 'middle', transform: `rotate(-90 10 ${(PAD.t + H - PAD.b) / 2})` },
      L.quality || 'Quality',
    ),
  ];
  if (frontier.length > 1) {
    children.push(
      React.createElement('polyline', {
        key: 'f',
        className: 'rr-guide__mapline',
        points: frontier.map((k) => `${x(k.monthly as number)},${y((k.score as GuideScore).quality as number)}`).join(' '),
      }),
    );
  }
  // Drawn last-ranked first so #1 sits on top where dots overlap.
  pts
    .slice()
    .reverse()
    .forEach((k) => {
      const rank = props.rankOf[k.id];
      const q = (k.score as GuideScore).quality as number;
      const on = k.id === props.current;
      const select = (): void => props.onSelect(k.id);
      children.push(
        React.createElement(
          'g',
          {
            key: k.id,
            className: cx('rr-guide__mapdot', on && 'is-current', onLine[k.id] && 'is-frontier', k.benchmark && 'is-benchmark'),
            transform: `translate(${x(k.monthly as number)} ${y(q)})`,
            role: 'button',
            tabIndex: 0,
            'aria-pressed': String(on),
            'aria-label': point(rank, k.name, q.toFixed(0), props.price(k.monthly as number)),
            onClick: select,
            onKeyDown: (e: React.KeyboardEvent) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                select();
              }
            },
          },
          [
            React.createElement('circle', { key: 'c', r: 10 }),
            React.createElement('text', { key: 't', y: 4, textAnchor: 'middle' }, rank != null ? String(rank) : '\u2013'),
          ],
        ),
      );
    });
  return React.createElement('figure', { className: 'rr-guide__map' }, [
    React.createElement(
      'svg',
      { key: 's', viewBox: `0 0 ${W} ${H}`, role: 'group', 'aria-label': L.title || 'Quality against price' },
      children,
    ),
    frontier.length > 1
      ? React.createElement('figcaption', { key: 'c', className: 'rr-guide__mapkey' }, [
          React.createElement('i', { key: 'i', 'aria-hidden': 'true' }),
          L.frontier || 'Best trade-offs: nothing on this task is both better and cheaper',
        ])
      : null,
  ]);
}
