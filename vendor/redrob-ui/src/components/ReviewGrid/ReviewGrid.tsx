import * as React from 'react';
import { cx } from '../../internal/cx';
import { CELL_STATE } from '../../internal/evidence';
import { icons } from '../../icons';
import { Badge } from '../Badge/Badge';

export interface ReviewColumn {
  key: string;
  label?: React.ReactNode;
  width?: string | number;
}

export interface ReviewCellValue {
  value?: React.ReactNode;
  /** `unsure` flags the cell for a person. `none` is "not found". */
  state?: 'answered' | 'unsure' | 'none' | 'pending';
  /** Where in the document the answer came from. */
  source?: React.ReactNode;
}

export interface ReviewRow {
  id?: string | number;
  label?: React.ReactNode;
  sub?: React.ReactNode;
  cells?: Record<string, ReviewCellValue | undefined>;
}

export interface ReviewGridProps {
  columns?: ReviewColumn[];
  rows?: ReviewRow[];
  title?: React.ReactNode;
  caption?: React.ReactNode;
  rowLabel?: React.ReactNode;
  footNote?: React.ReactNode;
  className?: string;
  onOpenRow?: (row: ReviewRow, index: number) => void;
  onOpenCell?: (row: ReviewRow, col: ReviewColumn, cell: ReviewCellValue) => void;
}

function ReviewCell(props: {
  cell?: ReviewCellValue;
  row: ReviewRow;
  col: ReviewColumn;
  onOpen?: (row: ReviewRow, col: ReviewColumn, cell: ReviewCellValue) => void;
}): React.ReactElement {
  const cell = props.cell || {};
  const state = cell.state || (cell.value ? 'answered' : 'none');
  const open = props.onOpen && state !== 'pending';
  const inner = [
    state === 'pending'
      ? React.createElement('span', { className: 'rr-skeleton rr-review__wait', key: 'w' })
      : React.createElement('span', { className: 'rr-review__value', key: 'v' }, cell.value || CELL_STATE[state]),
    state === 'unsure'
      ? React.createElement(
          'span',
          { className: 'rr-review__flag', key: 'f', title: 'Needs a person' },
          icons.flag({ width: 13, height: 13 }),
        )
      : null,
    cell.source != null && state !== 'pending'
      ? React.createElement('span', { className: 'rr-review__src', key: 's' }, cell.source)
      : null,
  ];

  return React.createElement(
    'td',
    { className: cx('rr-review__cell', `rr-review__cell--${state}`) },
    open
      ? React.createElement(
          'button',
          {
            type: 'button',
            className: 'rr-review__open',
            onClick: () => props.onOpen && props.onOpen(props.row, props.col, cell),
          },
          inner,
        )
      : inner,
  );
}

/**
 * A grid of extracted answers across many documents, with the uncertain ones counted.
 *
 * The count of cells needing a person is in the header. A bulk extraction whose uncertainty is only visible cell by
 * cell will be treated as complete, and the whole reason to run one is to know which parts still need reading.
 *
 * A real table with `scope` on both axes, so a cell can be read as "this document, this question". Every cell
 * carries its source, so an answer can be traced back rather than trusted.
 */
export function ReviewGrid(props: ReviewGridProps): React.ReactElement {
  const cols = props.columns || [];
  const rows = props.rows || [];

  let unsure = 0;
  rows.forEach((r) => {
    cols.forEach((c) => {
      const x = (r.cells || {})[c.key];
      if (x && x.state === 'unsure') unsure += 1;
    });
  });

  return React.createElement('div', { className: cx('rr-review', props.className) }, [
    props.caption || props.title
      ? React.createElement('div', { className: 'rr-review__head', key: 'h' }, [
          React.createElement('span', { className: 'rr-review__title', key: 't' }, props.title || props.caption),
          unsure
            ? React.createElement(
                Badge,
                { key: 'b', tone: 'warning', size: 'sm' },
                unsure + (unsure === 1 ? ' answer needs a person' : ' answers need a person'),
              )
            : null,
        ])
      : null,
    React.createElement(
      'div',
      { className: 'rr-review__scroll', key: 's' },
      React.createElement('table', { className: 'rr-review__table' }, [
        React.createElement(
          'thead',
          { key: 'h' },
          React.createElement(
            'tr',
            null,
            (
              [
                React.createElement(
                  'th',
                  { className: 'rr-review__corner', key: 'c', scope: 'col' },
                  props.rowLabel || 'Document',
                ),
              ] as React.ReactNode[]
            ).concat(
              cols.map((c) =>
                React.createElement(
                  'th',
                  { key: c.key, scope: 'col', style: c.width ? { width: c.width } : null },
                  c.label,
                ),
              ),
            ),
          ),
        ),
        React.createElement(
          'tbody',
          { key: 'b' },
          rows.map((r, i) =>
            React.createElement(
              'tr',
              { key: r.id || i },
              (
                [
                  React.createElement('th', { className: 'rr-review__rowhead', key: '_h', scope: 'row' }, [
                    props.onOpenRow
                      ? React.createElement(
                          'button',
                          {
                            type: 'button',
                            className: 'rr-review__rowbtn',
                            key: 'b',
                            onClick: () => props.onOpenRow && props.onOpenRow(r, i),
                          },
                          r.label,
                        )
                      : React.createElement('span', { className: 'rr-review__rowname', key: 'n' }, r.label),
                    r.sub ? React.createElement('span', { className: 'rr-review__rowsub', key: 's' }, r.sub) : null,
                  ]),
                ] as React.ReactNode[]
              ).concat(
                cols.map((c) =>
                  React.createElement(ReviewCell, {
                    key: c.key,
                    cell: (r.cells || {})[c.key],
                    row: r,
                    col: c,
                    onOpen: props.onOpenCell,
                  }),
                ),
              ),
            ),
          ),
        ),
      ]),
    ),
    props.footNote ? React.createElement('p', { className: 'rr-review__foot', key: 'f' }, props.footNote) : null,
  ]);
}

export default ReviewGrid;
