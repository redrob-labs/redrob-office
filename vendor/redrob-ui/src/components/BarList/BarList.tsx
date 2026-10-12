import * as React from 'react';
import { cx } from '../../internal/cx';
import { at } from '../../internal/insight';

export interface BarListRow {
  label: React.ReactNode;
  value?: number | null;
  /** A second line under the label, e.g. "12 people". */
  sub?: React.ReactNode;
  /** Below the privacy floor. No bar, no figure: a hatched track that says why. */
  hidden?: boolean;
  /** A second line under the figure. */
  note?: React.ReactNode;
  /** A reference tick on this row, e.g. the peer benchmark. */
  reference?: number | null;
  /** The reader's own row (their team). Drawn in full strength, labelled in bold. */
  mark?: boolean;
  href?: string;
  key?: string | number;
}

export interface BarListProps {
  rows?: BarListRow[];
  format?: (v: number | null | undefined) => string;
  /** The scale's end. The largest value or reference by default. */
  max?: number;
  /** Legend for the reference tick, printed under the list. */
  referenceLabel?: React.ReactNode;
  /** What a hidden row says. "Fewer than 3 people" by default. */
  hiddenLabel?: string;
  /** Plain-click handler for linked rows, for a client-side router. Same contract as `AppShell.onNavigate`. */
  onNavigate?: (href: string, event: React.MouseEvent<HTMLAnchorElement>) => void;
  className?: string;
}

const defaultFormat = (v: number | null | undefined): string =>
  v == null || Number.isNaN(v) ? '-' : String(Math.round(v));

/**
 * Horizontal bars on one shared scale, one row per group, for comparing teams, tools or kinds of work.
 *
 * Each row is a list item whose text carries the label, the figure and its note, so the list reads in full
 * without the bars. A group below the privacy floor keeps its row - leaving it out would let a reader
 * subtract it back from the total - but shows a hatched track and the reason instead of a number.
 */
export function BarList(props: BarListProps): React.ReactElement {
  const rows = props.rows || [];
  const fmt = props.format || defaultFormat;
  const hiddenLabel = props.hiddenLabel || 'Fewer than 3 people';
  const shown = rows.filter((r) => !r.hidden);
  // The largest value or reference. Not floored at 1: that suits percentages, but amounts under one
  // (dollars, hours) drew as 2px stubs. Only a list with nothing above zero falls back to 1.
  const largest = Math.max(0, ...shown.map((r) => Math.max(r.value || 0, r.reference || 0)));
  const max = props.max != null ? props.max : largest > 0 ? largest : 1;
  const nav = props.onNavigate;
  return React.createElement('div', { className: cx('rr-barlist', props.className) }, [
    React.createElement(
      'ul',
      { key: 'l', className: 'rr-barlist__rows' },
      rows.map((r, i) => {
        const inner = [
          React.createElement('span', { key: 'l', className: 'rr-barlist__label' }, [
            React.createElement('span', { key: 'n', className: cx(r.mark && 'rr-barlist__label--mark') }, r.label),
            r.sub != null ? React.createElement('small', { key: 's' }, r.sub) : null,
          ]),
          React.createElement(
            'span',
            { key: 'b', className: 'rr-barlist__track', 'aria-hidden': 'true' },
            r.hidden
              ? React.createElement('span', { className: 'rr-barlist__hidden' }, hiddenLabel)
              : [
                  r.value != null
                    ? React.createElement('span', {
                        key: 'v',
                        className: cx('rr-barlist__bar', r.mark && 'rr-barlist__bar--mark'),
                        style: { width: `max(2px, ${at(r.value, max)})` },
                      })
                    : null,
                  r.reference != null
                    ? React.createElement('span', { key: 'r', className: 'rr-barlist__ref', style: { left: at(r.reference, max) } })
                    : null,
                ],
          ),
          React.createElement('span', { key: 'f', className: 'rr-barlist__figure' }, [
            r.hidden
              ? React.createElement('span', { key: 'h', className: 'rr-visually-hidden' }, hiddenLabel)
              : React.createElement('span', { key: 'v' }, fmt(r.value)),
            r.note != null ? React.createElement('small', { key: 'n' }, r.note) : null,
          ]),
        ];
        const row = r.href
          ? React.createElement(
              'a',
              {
                className: 'rr-barlist__row rr-barlist__row--link',
                href: r.href,
                onClick: nav
                  ? (e: React.MouseEvent<HTMLAnchorElement>) => {
                      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
                      nav(r.href as string, e);
                    }
                  : undefined,
              },
              inner,
            )
          : React.createElement('div', { className: 'rr-barlist__row' }, inner);
        return React.createElement('li', { key: r.key != null ? r.key : i }, row);
      }),
    ),
    props.referenceLabel != null
      ? React.createElement('div', { key: 'k', className: 'rr-barlist__key' }, [
          React.createElement('i', { key: 'i', 'aria-hidden': 'true' }),
          React.createElement('span', { key: 't' }, props.referenceLabel),
        ])
      : null,
  ]);
}

export default BarList;
