import * as React from 'react';
import { cx } from '../../internal/cx';

export interface TableColumn<Row = Record<string, unknown>> {
  key: string;
  header?: React.ReactNode;
  /** Right-align. Implied by `money`. */
  align?: 'left' | 'right';
  /**
   * A currency column: the symbol pins left and the figure right, so a column holding won, rupees and
   * dollars lines all three up. Pass the cell as `"<symbol> <figure>"`.
   */
  money?: boolean;
  /** This column absorbs the spare width. The first column if none is marked. */
  grow?: boolean;
  /** Fixed width. Opts the column out of hugging its content. */
  width?: string | number;
  /** Let this column wrap instead of hugging. */
  wrap?: boolean;
  /** The cell's own language, per column or per row. */
  lang?: string | ((row: Row) => string | undefined);
  render?: (row: Row) => React.ReactNode;
}

export interface TableProps<Row = Record<string, unknown>> {
  columns?: Array<TableColumn<Row>>;
  rows?: Row[];
  /** Names the table. A real `caption`, so it is announced with the table. */
  caption?: React.ReactNode;
  dense?: boolean;
  className?: string;
}

/**
 * Rows and columns of data, in a real table.
 *
 * A real `table` with `thead`, `th scope="col"` and an optional `caption` - not a grid of divs. That is what
 * lets a screen reader say which column a cell is in, and it is the single most common way a data table
 * becomes unusable.
 *
 * Money columns split the symbol from the figure so mixed currencies align on the digits. A column of
 * "₩1,200" and "$9.50" right-aligned as plain strings lines up the wrong characters.
 *
 * `lang` is per cell rather than per table because `keep-all` line breaking is scoped to the element, and a
 * data table of mixed scripts has no single page language to inherit.
 */
export function Table<Row extends Record<string, unknown>>(props: TableProps<Row>): React.ReactElement {
  const columns = props.columns || [];
  const rows = props.rows || [];

  let grow = -1;
  for (let gi = 0; gi < columns.length; gi++) {
    if (columns[gi].grow) {
      grow = gi;
      break;
    }
  }
  if (grow === -1) grow = 0;

  return React.createElement(
    'div',
    { className: cx('rr-table-wrap', props.className) },
    React.createElement('table', { className: cx('rr-table', props.dense && 'rr-table--dense') }, [
      props.caption ? React.createElement('caption', { key: 'c' }, props.caption) : null,
      React.createElement(
        'thead',
        { key: 'h' },
        React.createElement(
          'tr',
          null,
          columns.map((col, i) =>
            React.createElement(
              'th',
              {
                key: col.key,
                scope: 'col',
                className: cx(
                  (col.align === 'right' || col.money) && 'rr-table--num',
                  i !== grow && !col.width && !col.wrap && 'rr-table--hug',
                ),
                style: col.width ? { width: col.width } : null,
              },
              col.header,
            ),
          ),
        ),
      ),
      React.createElement(
        'tbody',
        { key: 'b' },
        rows.map((row, i) =>
          React.createElement(
            'tr',
            { key: row.id != null ? (row.id as React.Key) : i },
            columns.map((col, ci) => {
              let cell: React.ReactNode =
                typeof col.render === 'function' ? col.render(row) : (row[col.key] as React.ReactNode);

              if (col.money && typeof cell === 'string') {
                const cut = cell.indexOf(' ');
                cell =
                  cut > 0
                    ? React.createElement('span', null, [
                        React.createElement('span', { key: 's', className: 'rr-money__sym' }, cell.slice(0, cut)),
                        React.createElement('span', { key: 'v' }, cell.slice(cut + 1)),
                      ])
                    : React.createElement('span', null, React.createElement('span', { key: 'v' }, cell));
              }

              const cellLang = typeof col.lang === 'function' ? col.lang(row) : col.lang;

              return React.createElement(
                'td',
                {
                  key: col.key,
                  lang: cellLang || undefined,
                  className: cx(
                    (col.align === 'right' || col.money) && 'rr-table--num',
                    col.money && 'rr-table--money',
                    ci !== grow && !col.width && !col.wrap && 'rr-table--hug',
                  ),
                },
                cell,
              );
            }),
          ),
        ),
      ),
    ]),
  );
}

export default Table;
