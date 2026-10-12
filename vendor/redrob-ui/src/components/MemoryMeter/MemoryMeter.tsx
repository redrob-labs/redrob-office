import * as React from 'react';
import { cx } from '../../internal/cx';
import { CTX_COLORS } from '../../internal/harness';

export interface MemorySegment {
  label?: React.ReactNode;
  value: number;
  color?: string;
}

export interface MemoryMeterProps {
  /** The whole window. Segments are shares of this. */
  total?: number;
  segments?: MemorySegment[];
  label?: React.ReactNode;
  leftLabel?: React.ReactNode;
  /** Defaults to a percentage. Pass a formatter to show tokens or words instead. */
  format?: (v: number) => string;
  className?: string;
}

/**
 * @deprecated Use Meter (with `segments`). Kept for 1.x.
 *
 * How full the working memory is, and what is taking up the room.
 *
 * "Room left" is a segment in the legend, not an absence. A meter that only shows what is used makes the reader do
 * the subtraction, and running out of context is the thing they are trying to avoid.
 *
 * The accessible name carries the percentage in words, so the state is available without reading the bar.
 */
export function MemoryMeter(props: MemoryMeterProps): React.ReactElement {
  const total = Number(props.total) || 0;
  const segs = props.segments || [];
  const used = segs.reduce((a, s) => a + (Number(s.value) || 0), 0);
  const share = (v: number): number => (total ? Math.round((v / total) * 100) : 0);
  const fmt = props.format || ((v: number) => `${share(v)}%`);
  const left = Math.max(0, total - used);

  return React.createElement(
    'div',
    {
      className: cx('rr-mem', props.className),
      role: 'group',
      'aria-label': `${props.label || 'Working memory'}: ${share(used)} percent full`,
    },
    [
      React.createElement('div', { className: 'rr-mem__head', key: 'h' }, [
        React.createElement('span', { className: 'rr-mem__title', key: 't' }, props.label || 'Working memory'),
        React.createElement('span', { className: 'rr-mem__full', key: 'f' }, `${share(used)}% full`),
      ]),
      React.createElement(
        'div',
        { className: 'rr-mem__bar', key: 'b' },
        segs.map((s, i) =>
          React.createElement('span', {
            className: 'rr-mem__seg',
            key: i,
            style: {
              width: `${share(s.value)}%`,
              background: s.color || CTX_COLORS[i % CTX_COLORS.length],
            },
          }),
        ),
      ),
      React.createElement(
        'div',
        { className: 'rr-mem__legend', key: 'l' },
        (
          segs.map((s, i) =>
            React.createElement('span', { className: 'rr-mem__key', key: i }, [
              React.createElement('span', {
                className: 'rr-mem__swatch',
                key: 's',
                style: { background: s.color || CTX_COLORS[i % CTX_COLORS.length] },
              }),
              s.label,
              React.createElement('span', { className: 'rr-mem__num', key: 'n' }, fmt(s.value)),
            ]),
          ) as React.ReactNode[]
        ).concat([
          React.createElement('span', { className: 'rr-mem__key rr-mem__key--left', key: 'free' }, [
            React.createElement('span', {
              className: 'rr-mem__swatch',
              key: 's',
              style: { background: 'var(--surface-sunken)' },
            }),
            props.leftLabel || 'Room left',
            React.createElement('span', { className: 'rr-mem__num', key: 'n' }, fmt(left)),
          ]),
        ]),
      ),
    ],
  );
}

export default MemoryMeter;
