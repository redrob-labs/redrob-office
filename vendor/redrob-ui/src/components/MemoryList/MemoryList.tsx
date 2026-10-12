import * as React from 'react';
import { cx } from '../../internal/cx';
import { Button } from '../Button/Button';

export interface MemoryItem {
  id?: string | number;
  /** What is remembered, in the words it was saved in. */
  text?: React.ReactNode;
  /** Where it came from: a chat, a document, the person. */
  source?: React.ReactNode;
  /** Which AIs have read it. */
  readBy?: React.ReactNode;
  /** An organisation memory the person cannot change. */
  locked?: boolean;
  lockedLabel?: React.ReactNode;
}

export interface MemoryListProps {
  items?: MemoryItem[];
  readByLabel?: string;
  editLabel?: React.ReactNode;
  forgetLabel?: React.ReactNode;
  className?: string;
  onEdit?: (item: MemoryItem, index: number) => void;
  onForget?: (item: MemoryItem, index: number) => void;
}

/**
 * Everything the product remembers, each entry editable or removable.
 *
 * The whole list, in the words it was saved in, with where it came from. Memory nobody can read is memory nobody
 * consented to, and a summary would hide the entry that is wrong.
 *
 * Forget is on every row, at the same weight as Edit. A locked entry says who can change it rather than showing
 * a disabled button with no explanation.
 */
export function MemoryList(props: MemoryListProps): React.ReactElement {
  const items = props.items || [];

  return React.createElement(
    'ul',
    { className: cx('rr-memlist', props.className) },
    items.map((m, i) =>
      React.createElement('li', { key: m.id || i, className: 'rr-memlist__item' }, [
        React.createElement('span', { key: 't', className: 'rr-memlist__text' }, m.text),
        React.createElement('span', { key: 'm', className: 'rr-memlist__meta' }, [
          m.source,
          m.readBy
            ? React.createElement(
                'span',
                { key: 'd', className: 'rr-memlist__dot', 'aria-hidden': 'true' },
                '·',
              )
            : null,
          m.readBy ? (props.readByLabel || 'Read by ') + m.readBy : null,
        ]),
        m.locked
          ? React.createElement(
              'span',
              { key: 'a', className: 'rr-memlist__lock' },
              m.lockedLabel || 'Only your admin can change this',
            )
          : React.createElement('span', { key: 'a', className: 'rr-memlist__actions' }, [
              React.createElement(
                Button,
                {
                  key: 'e',
                  size: 'sm',
                  variant: 'ghost',
                  onClick: props.onEdit ? () => props.onEdit && props.onEdit(m, i) : undefined,
                },
                props.editLabel || 'Edit',
              ),
              React.createElement(
                Button,
                {
                  key: 'f',
                  size: 'sm',
                  variant: 'ghost',
                  onClick: props.onForget ? () => props.onForget && props.onForget(m, i) : undefined,
                },
                props.forgetLabel || 'Forget',
              ),
            ]),
      ]),
    ),
  );
}

export default MemoryList;
