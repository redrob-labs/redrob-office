import * as React from 'react';
import { cx } from '../../internal/cx';
import { OPINION_VERDICTS } from '../../internal/safeguards';
import { icons, IconName } from '../../icons';

export interface OpinionColumn {
  id: string;
  model?: React.ReactNode;
  /** What this model did here: wrote the answer, or reviewed it. */
  role?: React.ReactNode;
  /** This column wrote the answer, so an unstated cell means "wrote" rather than "quiet". */
  wrote?: boolean;
}

export interface OpinionRow {
  id: string;
  /** The claim, in a few words. */
  label?: React.ReactNode;
  /** Where in the answer it is. */
  where?: React.ReactNode;
  /** Per column: `[verdict]` or `[verdict, note]`. */
  cells: Record<string, [string, React.ReactNode?] | undefined>;
}

export interface OpinionGridProps {
  columns?: OpinionColumn[];
  rows?: OpinionRow[];
  /** Replace or extend the verdict vocabulary. */
  verdicts?: Record<string, { label: string; icon?: string }>;
  pointLabel?: React.ReactNode;
  /** Names the table for a screen reader. Visually hidden. */
  caption?: React.ReactNode;
  className?: string;
}

/**
 * Every point in an answer against the AI that wrote it and the two that reviewed it.
 *
 * A real table with `th scope="col"` and `scope="row"`, so a cell can be read as "this model, this point". A grid
 * of divs would make the verdicts unreadable to anyone not seeing the layout - and the whole purpose of this
 * component is to be checkable.
 *
 * "Didn't comment" is a stated verdict, not a blank cell. Silence from a reviewer is information, and leaving the
 * cell empty invites it to be read as agreement.
 *
 * A row where anyone disagreed is marked on the row itself, so the disagreements are findable without reading
 * every cell.
 */
export function OpinionGrid(props: OpinionGridProps): React.ReactElement {
  const cols = props.columns || [];
  const rows = props.rows || [];
  const V = { ...OPINION_VERDICTS, ...(props.verdicts || {}) };

  function verdict(v: string): React.ReactElement {
    const d = V[v] || V.quiet;
    // Returned into a `<td>` children array beside an optional note, so it needs a key of its own.
    return React.createElement('span', { key: 'v', className: `rr-opgrid__v rr-opgrid__v--${v}` }, [
      d.icon
        ? React.createElement(
            'span',
            { key: 'i', 'aria-hidden': 'true' },
            icons[d.icon as IconName]({ width: 14, height: 14 }),
          )
        : null,
      d.label,
    ]);
  }

  return React.createElement(
    'div',
    { className: cx('rr-opgrid', props.className) },
    React.createElement('table', null, [
      props.caption
        ? React.createElement('caption', { key: 'c', className: 'rr-visually-hidden' }, props.caption)
        : null,
      React.createElement(
        'thead',
        { key: 'h' },
        React.createElement('tr', null, [
          React.createElement('th', { key: 'p', scope: 'col' }, props.pointLabel || 'Point in the answer'),
          cols.map((c) =>
            React.createElement('th', { key: c.id, scope: 'col' }, [
              React.createElement('span', { key: 'm', className: 'rr-opgrid__model' }, c.model),
              c.role ? React.createElement('small', { key: 'r' }, c.role) : null,
            ]),
          ),
        ]),
      ),
      React.createElement(
        'tbody',
        { key: 'b' },
        rows.map((r) => {
          const differ = cols.some((c) => r.cells[c.id] && (r.cells[c.id] as [string])[0] === 'differ');
          return React.createElement(
            'tr',
            { key: r.id, className: differ ? 'rr-opgrid__row--differ' : undefined },
            [
              React.createElement('th', { key: 'p', scope: 'row', className: 'rr-opgrid__point' }, [
                React.createElement('b', { key: 'b' }, r.label),
                r.where ? React.createElement('span', { key: 's' }, r.where) : null,
              ]),
              cols.map((c) => {
                const cell = r.cells[c.id] || [c.wrote ? 'wrote' : 'quiet'];
                return React.createElement('td', { key: c.id }, [
                  verdict(cell[0]),
                  cell[1] ? React.createElement('span', { key: 'n', className: 'rr-opgrid__note' }, cell[1]) : null,
                ]);
              }),
            ],
          );
        }),
      ),
    ]),
  );
}

export default OpinionGrid;
