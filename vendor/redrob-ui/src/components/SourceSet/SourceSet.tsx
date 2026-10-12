import * as React from 'react';
import { cx } from '../../internal/cx';
import { SRC_STATE } from '../../internal/evidence';
import { icons } from '../../icons';

export interface SourceItem {
  id?: string | number;
  name?: React.ReactNode;
  /** Why it was skipped or only partly read. */
  reason?: React.ReactNode;
  count?: number;
  /** How many of `count` were read, for `partial`. Half is assumed when absent. */
  readCount?: number;
  state?: 'read' | 'partial' | 'skipped' | 'pending';
  stateLabel?: React.ReactNode;
  icon?: (p: Record<string, unknown>) => React.ReactElement;
}

export interface SourceSetProps {
  sources?: SourceItem[];
  /** Overrides the derived totals. */
  read?: number;
  total?: number;
  unit?: string;
  title?: React.ReactNode;
  updated?: React.ReactNode;
  missedNote?: React.ReactNode;
  className?: string;
}

/**
 * What an answer actually read, and what it did not.
 *
 * The unread count is printed with the sentence that matters: the answer cannot speak for them. A source list that
 * showed only what was read would let a reader take the answer as covering the whole set.
 *
 * Totals are derived from the sources when not given, and a `skipped` source contributes to the total but not to
 * the read count - so skipping material makes the gap larger rather than making it disappear.
 */
export function SourceSet(props: SourceSetProps): React.ReactElement {
  const sources = props.sources || [];
  let read = props.read;
  let total = props.total;

  if (read == null || total == null) {
    let r = 0;
    let t = 0;
    sources.forEach((s) => {
      const c = s.count || 0;
      t += c;
      if (s.state === 'skipped') return;
      r += s.state === 'partial' ? (s.readCount != null ? s.readCount : Math.round(c / 2)) : c;
    });
    if (read == null) read = r;
    if (total == null) total = t;
  }

  const pct = total ? Math.max(0, Math.min(100, (read / total) * 100)) : 0;
  const missed = Math.max(0, total - read);

  return React.createElement('div', { className: cx('rr-sourceset', props.className) }, [
    React.createElement('div', { className: 'rr-sourceset__head', key: 'h' }, [
      React.createElement(
        'span',
        { className: 'rr-sourceset__title', key: 't' },
        props.title || 'What this answer looked at',
      ),
      props.updated
        ? React.createElement('span', { className: 'rr-sourceset__updated', key: 'u' }, props.updated)
        : null,
    ]),
    total
      ? React.createElement('p', { className: 'rr-sourceset__count', key: 'c' }, [
          React.createElement('strong', { key: 'a' }, `${read.toLocaleString()} of ${total.toLocaleString()}`),
          React.createElement('span', { key: 'b' }, ` ${props.unit || 'documents'} read`),
        ])
      : null,
    total
      ? React.createElement(
          'div',
          {
            className: 'rr-sourceset__bar',
            key: 'b',
            role: 'img',
            'aria-label': `${read} of ${total} read`,
          },
          [React.createElement('span', { className: 'rr-sourceset__fill', key: 'f', style: { width: `${pct}%` } })],
        )
      : null,
    React.createElement(
      'ul',
      { className: 'rr-sourceset__list', key: 'l' },
      sources.map((s, i) => {
        const state = s.state || 'read';
        return React.createElement(
          'li',
          { className: cx('rr-sourceset__row', `rr-sourceset__row--${state}`), key: s.id || i },
          [
            React.createElement(
              'span',
              { className: 'rr-sourceset__icon', key: 'i' },
              (s.icon || icons.stack)({ width: 16, height: 16 }),
            ),
            React.createElement('span', { className: 'rr-sourceset__body', key: 'b' }, [
              React.createElement('span', { className: 'rr-sourceset__name', key: 'n' }, s.name),
              s.reason
                ? React.createElement('span', { className: 'rr-sourceset__reason', key: 'r' }, s.reason)
                : null,
            ]),
            s.count != null
              ? React.createElement('span', { className: 'rr-sourceset__num', key: 'c' }, s.count.toLocaleString())
              : null,
            React.createElement(
              'span',
              { className: cx('rr-sourceset__state', `rr-sourceset__state--${state}`), key: 's' },
              s.stateLabel || SRC_STATE[state] || state,
            ),
          ],
        );
      }),
    ),
    missed
      ? React.createElement(
          'p',
          { className: 'rr-sourceset__missed', key: 'm' },
          props.missedNote ||
            `${missed.toLocaleString()} ${props.unit || 'documents'} were not read. The answer cannot speak for them.`,
        )
      : null,
  ]);
}

export default SourceSet;
