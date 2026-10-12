import * as React from 'react';
import { cx } from '../../internal/cx';

export interface TabItem {
  id: string;
  label?: React.ReactNode;
  /** A number beside the label. Omit it rather than showing 0. */
  count?: number | string;
  disabled?: boolean;
}

export interface TabsProps {
  items?: TabItem[];
  /** The selected tab's id. Uncontrolled, it falls back to the first item. */
  value?: string;
  variant?: 'line' | 'pill' | 'enclosed';
  /** Names the tab list for assistive technology. */
  label?: string;
  className?: string;
  children?: React.ReactNode;
  onChange?: (id: string) => void;
}

/**
 * Switches between views of the same thing.
 *
 * Same thing, different view - not steps in a process (`Stepper`) and not separate destinations
 * (navigation). Six tabs is about the limit before a list reads better.
 *
 * Roving tabindex, which is the pattern people get wrong: Tab reaches the selected tab and then leaves
 * the list, and the arrow keys move between tabs. Making every tab tabbable sounds more accessible and
 * is worse - a keyboard user then has to press Tab past all of them to reach the panel.
 */
export function Tabs(props: TabsProps): React.ReactElement {
  const variant = props.variant || 'line';
  const items = props.items || [];
  const value = props.value != null ? props.value : items.length ? items[0].id : null;

  function onKeyDown(event: React.KeyboardEvent<HTMLDivElement>): void {
    const on = items.filter((it) => !it.disabled);
    const i = on.map((it) => it.id).indexOf(value as string);
    let next: TabItem | null = null;
    if (event.key === 'ArrowRight') next = on[(i + 1) % on.length];
    else if (event.key === 'ArrowLeft') next = on[(i - 1 + on.length) % on.length];
    else if (event.key === 'Home') next = on[0];
    else if (event.key === 'End') next = on[on.length - 1];
    if (!next) return;
    event.preventDefault();
    if (props.onChange) props.onChange(next.id);
    const el = event.currentTarget.querySelector<HTMLElement>(`#tab-${next.id}`);
    if (el) el.focus();
  }

  return React.createElement('div', { className: cx('rr-tabs', `rr-tabs--${variant}`, props.className) }, [
    React.createElement(
      'div',
      {
        className: 'rr-tabs__list',
        role: 'tablist',
        'aria-label': props.label,
        key: 'l',
        onKeyDown,
      },
      items.map((item) =>
        React.createElement(
          'button',
          {
            type: 'button',
            key: item.id,
            role: 'tab',
            id: `tab-${item.id}`,
            'aria-selected': String(item.id === value),
            'aria-controls': `panel-${item.id}`,
            tabIndex: item.id === value ? 0 : -1,
            className: 'rr-tab',
            disabled: item.disabled,
            onClick: () => {
              if (props.onChange) props.onChange(item.id);
            },
          },
          [
            React.createElement('span', { key: 't' }, item.label),
            item.count != null
              ? React.createElement('span', { className: 'rr-tab__count', key: 'c' }, item.count)
              : null,
          ],
        ),
      ),
    ),
    props.children
      ? React.createElement(
          'div',
          {
            role: 'tabpanel',
            id: `panel-${value}`,
            'aria-labelledby': `tab-${value}`,
            key: 'p',
            style: { paddingTop: 'var(--space-4)' },
          },
          props.children,
        )
      : null,
  ]);
}

export default Tabs;
