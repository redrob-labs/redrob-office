import * as React from 'react';
import { cx } from '../../internal/cx';
import { CHANGE_WORD } from '../../internal/harness';
import { Button } from '../Button/Button';

export interface ChangeItem {
  kind?: 'changed' | 'added' | 'removed';
  /** Where the change is: a field, a file, a line. */
  label?: React.ReactNode;
  /** The old value. Omit it and the change reads as an addition. */
  before?: React.ReactNode;
  /** The new value. Omit it and the change reads as a removal. */
  after?: React.ReactNode;
  note?: React.ReactNode;
}

export interface ChangesProps {
  items?: ChangeItem[];
  title?: React.ReactNode;
  summary?: React.ReactNode;
  acceptLabel?: React.ReactNode;
  rejectLabel?: React.ReactNode;
  className?: string;
  onAccept?: () => void;
  onReject?: () => void;
}

/**
 * What an agent changed, before and after, with a way to undo it.
 *
 * "Was" and "Now" on every changed item. A list of new values alone cannot be checked: the reader has no way to
 * know what was there, which is exactly what they need in order to accept or reject.
 *
 * Reject is labelled "Put it back" by default rather than "Cancel" - it undoes something that has already
 * happened, and Cancel would suggest nothing has.
 *
 * The kind is inferred from which sides are present, so a caller cannot label an addition as a change.
 */
export function Changes(props: ChangesProps): React.ReactElement {
  const items = props.items || [];

  const rows = items.map((it, i) => {
    const kind = it.kind || (it.before == null ? 'added' : it.after == null ? 'removed' : 'changed');
    return React.createElement(
      'div',
      { className: cx('rr-changes__item', `rr-changes__item--${kind}`), key: i },
      [
        React.createElement('div', { className: 'rr-changes__where', key: 'w' }, [
          React.createElement('span', { className: 'rr-changes__kind', key: 'k' }, CHANGE_WORD[kind] || kind),
          it.label ? React.createElement('span', { className: 'rr-changes__label', key: 'l' }, it.label) : null,
        ]),
        it.before != null
          ? React.createElement('p', { className: 'rr-changes__before', key: 'b' }, [
              React.createElement('span', { className: 'rr-changes__tag', key: 't' }, 'Was'),
              it.before,
            ])
          : null,
        it.after != null
          ? React.createElement('p', { className: 'rr-changes__after', key: 'a' }, [
              React.createElement('span', { className: 'rr-changes__tag', key: 't' }, 'Now'),
              it.after,
            ])
          : null,
        it.note ? React.createElement('p', { className: 'rr-changes__note', key: 'n' }, it.note) : null,
      ],
    );
  });

  const count = `${items.length} ${items.length === 1 ? 'change' : 'changes'}`;

  return React.createElement(
    'div',
    {
      className: cx('rr-changes', props.className),
      role: 'group',
      'aria-label': `${props.title || 'Changes'}: ${count}`,
    },
    [
      React.createElement('div', { className: 'rr-changes__head', key: 'h' }, [
        React.createElement('span', { className: 'rr-changes__title', key: 't' }, props.title),
        React.createElement('span', { className: 'rr-changes__count', key: 'c' }, props.summary || count),
      ]),
      React.createElement('div', { className: 'rr-changes__body', key: 'b' }, rows),
      props.onAccept || props.onReject
        ? React.createElement('div', { className: 'rr-changes__foot', key: 'f' }, [
            props.onReject
              ? React.createElement(
                  Button,
                  { key: 'r', variant: 'secondary', size: 'sm', onClick: props.onReject },
                  props.rejectLabel || 'Put it back',
                )
              : null,
            props.onAccept
              ? React.createElement(
                  Button,
                  { key: 'a', size: 'sm', onClick: props.onAccept },
                  props.acceptLabel || 'Keep these',
                )
              : null,
          ])
        : null,
    ],
  );
}

export default Changes;
