import * as React from 'react';
import { cx } from '../../internal/cx';
import { icons } from '../../icons';

export interface ShortlistItem {
  id?: string | number;
  label?: React.ReactNode;
  sub?: React.ReactNode;
}

export interface ShortlistProps {
  items?: ShortlistItem[];
  title?: React.ReactNode;
  /** A cap, shown as "3 of 5". */
  limit?: number;
  empty?: React.ReactNode;
  actions?: React.ReactNode;
  className?: string;
  onRemove?: (item: ShortlistItem, index: number) => void;
}

/**
 * What a person has kept for a second look.
 *
 * The empty state invites rather than reports: "Nothing on it yet. Add anything worth a second look." An empty panel
 * saying "No items" tells somebody the feature is not working.
 *
 * Each remove button names what it removes, so a column of X buttons is not a row of identical unlabelled controls
 * to a screen reader.
 */
export function Shortlist(props: ShortlistProps): React.ReactElement {
  const items = props.items || [];

  return React.createElement(
    'div',
    {
      className: cx('rr-shortlist', !items.length && 'rr-shortlist--empty', props.className),
      role: 'region',
      'aria-label': (props.title as string) || 'Your shortlist',
    },
    [
      React.createElement('div', { className: 'rr-shortlist__head', key: 'h' }, [
        React.createElement('span', { className: 'rr-shortlist__title', key: 't' }, props.title || 'Your shortlist'),
        React.createElement(
          'span',
          { className: 'rr-shortlist__count', key: 'c' },
          items.length + (props.limit ? ` of ${props.limit}` : ''),
        ),
      ]),
      items.length
        ? React.createElement(
            'ul',
            { className: 'rr-shortlist__items', key: 'i' },
            items.map((it, i) =>
              React.createElement('li', { className: 'rr-shortlist__item', key: it.id || i }, [
                React.createElement('span', { className: 'rr-shortlist__cell', key: 'c' }, [
                  React.createElement('span', { className: 'rr-shortlist__label', key: 'l' }, it.label),
                  it.sub ? React.createElement('span', { className: 'rr-shortlist__sub', key: 's' }, it.sub) : null,
                ]),
                props.onRemove
                  ? React.createElement(
                      'button',
                      {
                        type: 'button',
                        className: 'rr-shortlist__drop',
                        key: 'x',
                        'aria-label': `Take ${it.label} off the list`,
                        onClick: () => props.onRemove && props.onRemove(it, i),
                      },
                      icons.close({ width: 13, height: 13 }),
                    )
                  : null,
              ]),
            ),
          )
        : React.createElement(
            'p',
            { className: 'rr-shortlist__none', key: 'n' },
            props.empty || 'Nothing on it yet. Add anything worth a second look.',
          ),
      props.actions
        ? React.createElement('div', { className: 'rr-shortlist__actions', key: 'a' }, props.actions)
        : null,
    ],
  );
}

export default Shortlist;
