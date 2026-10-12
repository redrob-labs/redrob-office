import * as React from 'react';
import { cx } from '../../internal/cx';
import { useDismiss } from '../../internal/useDismiss';
import { useFloating } from '../../internal/useFloating';
import { icons } from '../../icons';

export interface MenuItem {
  id?: string;
  label?: React.ReactNode;
  icon?: React.ReactNode;
  /** Shown right-aligned, e.g. `⌘K`. Display only: the menu does not bind it. */
  shortcut?: React.ReactNode;
  disabled?: boolean;
  /** `danger` for anything destructive. */
  tone?: 'default' | 'danger';
  /** A rule between groups. Carries no label and is not focusable. */
  type?: 'item' | 'separator';
  onSelect?: (item: MenuItem) => void;
}

export interface MenuProps {
  /** Visible label. Omit it and pass `icon` for an icon-only trigger. A string label also names the list. */
  label?: React.ReactNode;
  /** An icon before the label, or the whole trigger when there is no label. */
  icon?: React.ReactNode;
  /** Accessible name. Required when the label is not a string or there is no label. */
  ariaLabel?: string;
  /** `up` opens the list above the trigger, for a menu at the foot of a panel. Default `down`. */
  placement?: 'down' | 'up';
  items?: MenuItem[];
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger';
  size?: 'sm' | 'md' | 'lg';
  /** Which edge the list hangs from. `right` when the trigger sits at the end of a row. */
  align?: 'left' | 'right';
  defaultOpen?: boolean;
  onSelect?: (item: MenuItem) => void;
  className?: string;
}

/**
 * A button that opens a short list of actions.
 *
 * Actions, not values - a menu that sets a field is a `Select`. Keep it under about seven items and
 * put anything destructive last, with `tone: 'danger'`.
 *
 * Arrow keys move between items and wrap at both ends; Escape and a click outside close it. The
 * arrow handling reads the live DOM rather than an index in state, so a disabled item is skipped
 * without the component tracking which ones those are.
 */
export function Menu(props: MenuProps): React.ReactElement {
  const items = props.items || [];
  const [open, setOpen] = React.useState(!!props.defaultOpen);
  const close = React.useCallback(() => setOpen(false), []);
  const ref = useDismiss<HTMLDivElement>(open, close);
  // Placed against the window, so a menu in a clipped or scrolling container still shows whole.
  useFloating(
    open,
    () => [
      ref.current && ref.current.querySelector<HTMLElement>(':scope > button'),
      ref.current && ref.current.querySelector<HTMLElement>(':scope > .rr-menu__list'),
    ],
    { side: props.placement === 'up' ? 'top' : 'bottom', align: props.align === 'right' ? 'end' : 'start', fitHeight: true },
  );
  const actionable = items.filter((item) => item.type !== 'separator' && !item.disabled);
  const iconOnly = !!props.icon && (props.label == null || props.label === '');
  // The accessible name. A label that is a node (an icon and text) has no string to give, so it needs
  // ariaLabel; a string label names itself.
  const name = props.ariaLabel || (typeof props.label === 'string' ? props.label : undefined);

  function onKeyDown(event: React.KeyboardEvent<HTMLDivElement>): void {
    if (!open) return;
    const nodes = ref.current
      ? ref.current.querySelectorAll<HTMLButtonElement>('[role="menuitem"]:not([disabled])')
      : ([] as unknown as NodeListOf<HTMLButtonElement>);
    if (!nodes.length) return;
    const index = Array.prototype.indexOf.call(nodes, document.activeElement);
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      nodes[(index + 1) % nodes.length].focus();
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      nodes[(index - 1 + nodes.length) % nodes.length].focus();
    }
  }

  const trigger = React.createElement(
    'button',
    {
      type: 'button',
      key: 'trigger',
      // An icon with no visible label is an icon button: the same sizes as IconButton, and its name
      // comes from ariaLabel, because a node cannot be read out as a name.
      className: iconOnly
        ? cx('rr-iconbtn', `rr-iconbtn--${props.variant || 'ghost'}`, `rr-iconbtn--${props.size || 'md'}`)
        : cx('rr-btn', `rr-btn--${props.variant || 'secondary'}`, `rr-btn--${props.size || 'md'}`),
      'aria-haspopup': 'menu',
      'aria-expanded': String(open),
      'aria-label': iconOnly || typeof props.label !== 'string' ? name : undefined,
      title: iconOnly ? name : undefined,
      onClick: () => setOpen(!open),
    },
    iconOnly
      ? React.createElement(
          'span',
          { className: 'rr-btn__icon', style: { fontSize: props.size === 'sm' ? '14px' : '18px' } },
          props.icon,
        )
      : [
          props.icon ? React.createElement('span', { key: 'i', className: 'rr-btn__icon' }, props.icon) : null,
          React.createElement('span', { key: 'l' }, props.label),
          React.createElement(
            'span',
            { key: 'c', className: 'rr-btn__icon' },
            icons.chevronDown({ width: 16, height: 16 }),
          ),
        ],
  );

  const list = open
    ? React.createElement(
        'div',
        {
          key: 'list',
          className: cx(
            'rr-menu__list',
            props.align === 'right' && 'rr-menu__list--right',
            props.placement === 'up' && 'rr-menu__list--up',
          ),
          role: 'menu',
          'aria-label': name,
        },
        items.map((item, i) => {
          if (item.type === 'separator') {
            return React.createElement('div', {
              key: `s${i}`,
              className: 'rr-menu__sep',
              role: 'separator',
            });
          }
          return React.createElement(
            'button',
            {
              type: 'button',
              key: item.id || i,
              role: 'menuitem',
              className: cx('rr-menu__item', item.tone === 'danger' && 'rr-menu__item--danger'),
              disabled: item.disabled,
              onClick: () => {
                if (item.onSelect) item.onSelect(item);
                if (props.onSelect) props.onSelect(item);
                setOpen(false);
              },
            },
            [
              item.icon ? React.createElement('span', { key: 'i', className: 'rr-menu__icon' }, item.icon) : null,
              React.createElement('span', { key: 'l', className: 'rr-menu__label' }, item.label),
              item.shortcut
                ? React.createElement('span', { key: 'k', className: 'rr-menu__shortcut' }, item.shortcut)
                : null,
            ],
          );
        }),
      )
    : null;

  return React.createElement('div', { className: cx('rr-menu', props.className), ref, onKeyDown }, [
    trigger,
    list,
    actionable.length === 0 && open ? React.createElement('span', { key: 'empty' }) : null,
  ]);
}

export default Menu;
