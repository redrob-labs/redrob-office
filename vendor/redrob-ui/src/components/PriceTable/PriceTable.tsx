import * as React from 'react';
import { cx } from '../../internal/cx';
import { icons } from '../../icons';

export interface PricePlan {
  id?: string;
  name?: React.ReactNode;
  /** The price for THIS market, set locally. Never converted from another. */
  price?: React.ReactNode;
  per?: React.ReactNode;
  detail?: React.ReactNode;
  action?: React.ReactNode;
}

export interface PriceRow {
  /** A group heading spanning the table. */
  group?: React.ReactNode;
  label?: React.ReactNode;
  detail?: React.ReactNode;
  /** Keyed by plan id or name. `true`, `false`/absent, or a value. */
  values?: Record<string, React.ReactNode | boolean>;
}

export interface PriceTableProps {
  plans?: PricePlan[];
  rows?: PriceRow[];
  rowLabel?: React.ReactNode;
  footNote?: React.ReactNode;
  className?: string;
}

/**
 * What each plan includes, and what it costs.
 *
 * One price per plan: the one set for the market this page is read in. Each market's number is set locally and never
 * converted from another - a price converted from somewhere else is on this company's own list of borders, and it
 * turns somebody's local cost into a rounding artefact of a rate they did not choose.
 *
 * Absence is drawn as a real "Not included" with an accessible label, not an empty cell. An empty cell is
 * indistinguishable from data that failed to load.
 *
 * A real table with `scope` on both axes, and group rows use `scope="colgroup"` so the grouping is structural.
 */
export function PriceTable(props: PriceTableProps): React.ReactElement {
  const plans = props.plans || [];
  const rows = props.rows || [];

  function cell(v: React.ReactNode | boolean): React.ReactElement {
    if (v === true) {
      return React.createElement(
        'span',
        { className: 'rr-price__yes', title: 'Included' },
        icons.check({ width: 16, height: 16 }),
      );
    }
    if (v === false || v == null) {
      return React.createElement(
        'span',
        { className: 'rr-price__no', 'aria-label': 'Not included' },
        icons.minus({ width: 16, height: 16 }),
      );
    }
    return React.createElement('span', { className: 'rr-price__val' }, v);
  }

  return React.createElement('div', { className: cx('rr-price', props.className) }, [
    React.createElement(
      'div',
      { className: 'rr-price__scroll', key: 's' },
      React.createElement('table', { className: 'rr-price__table' }, [
        React.createElement(
          'thead',
          { key: 'h' },
          React.createElement(
            'tr',
            null,
            (
              [
                React.createElement('th', { key: '_', scope: 'col' }, props.rowLabel || 'What you get'),
              ] as React.ReactNode[]
            ).concat(
              plans.map((p) =>
                React.createElement(
                  'th',
                  { key: p.id || (p.name as string), scope: 'col' },
                  React.createElement('div', { className: 'rr-price__planCell' }, [
                    React.createElement('span', { className: 'rr-price__plan', key: 'n' }, p.name),
                    React.createElement('p', { className: 'rr-price__price', key: 'p' }, [
                      React.createElement('span', { className: 'rr-price__amount', key: 'a' }, p.price),
                      p.per
                        ? React.createElement('span', { className: 'rr-price__per', key: 'n' }, p.per)
                        : null,
                    ]),
                    p.detail
                      ? React.createElement('span', { className: 'rr-price__detail', key: 'd' }, p.detail)
                      : null,
                    p.action
                      ? React.createElement('span', { className: 'rr-price__action', key: 'x' }, p.action)
                      : null,
                  ]),
                ),
              ),
            ),
          ),
        ),
        React.createElement(
          'tbody',
          { key: 'b' },
          rows.map((r, i) => {
            if (r.group) {
              return React.createElement(
                'tr',
                { key: i, className: 'rr-price__groupRow' },
                React.createElement('th', { colSpan: plans.length + 1, scope: 'colgroup' }, r.group),
              );
            }
            return React.createElement(
              'tr',
              { key: i },
              (
                [
                  React.createElement('th', { key: '_', scope: 'row' }, [
                    React.createElement('span', { key: 'l' }, r.label),
                    r.detail
                      ? React.createElement('span', { className: 'rr-price__rowDetail', key: 'd' }, r.detail)
                      : null,
                  ]),
                ] as React.ReactNode[]
              ).concat(
                plans.map((p) =>
                  React.createElement(
                    'td',
                    { key: p.id || (p.name as string) },
                    cell((r.values || {})[(p.id || p.name) as string]),
                  ),
                ),
              ),
            );
          }),
        ),
      ]),
    ),
    props.footNote ? React.createElement('p', { className: 'rr-price__foot', key: 'f' }, props.footNote) : null,
  ]);
}

export default PriceTable;
