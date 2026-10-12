import * as React from 'react';
import { cx } from '../../internal/cx';
import { useStableId } from '../../internal/ids';
import { useDismiss } from '../../internal/useDismiss';
import { useFloating } from '../../internal/useFloating';
import { Field, FieldShellProps } from '../../internal/Field';
import { icons } from '../../icons';

export interface ComboboxOption {
  value: string;
  label: string;
  /** A second line under the label. */
  description?: React.ReactNode;
  disabled?: boolean;
}

export interface ComboboxProps extends FieldShellProps {
  options?: Array<ComboboxOption | string>;
  value?: string;
  defaultValue?: string;
  placeholder?: string;
  size?: 'sm' | 'md' | 'lg';
  disabled?: boolean;
  defaultOpen?: boolean;
  /** `false` when the options already came back filtered - a server search. Stops double filtering. */
  filter?: boolean;
  /** What to say when nothing matches. */
  emptyText?: React.ReactNode;
  onChange?: (value: string, option: ComboboxOption) => void;
}

/**
 * Pick one value from a list long enough that you would rather type than scroll.
 *
 * For a short list use `Select`; for a handful use `Radio`. The typed text is held separately from the
 * chosen value, so closing without choosing restores what was selected rather than leaving a
 * half-typed string standing in for a value that was never picked.
 *
 * `filter={false}` matters for a server-backed search: filtering again on the client would hide
 * results the server deliberately returned for a fuzzy or aliased match.
 */
export function Combobox(props: ComboboxProps): React.ReactElement {
  const options = props.options || [];
  const autoId = useStableId('rr-combo');
  const id = props.id || autoId;
  const [query, setQuery] = React.useState('');
  const [open, setOpen] = React.useState(!!props.defaultOpen);
  const [active, setActive] = React.useState(0);
  const [held, setHeld] = React.useState<string | null>(props.defaultValue || null);
  const value = props.value !== undefined ? props.value : held;
  const close = React.useCallback(() => setOpen(false), []);
  const ref = useDismiss<HTMLDivElement>(open, close);
  useFloating(
    open,
    () => [
      ref.current && ref.current.querySelector<HTMLElement>('.rr-select-wrap'),
      ref.current && ref.current.querySelector<HTMLElement>('.rr-combo__list'),
    ],
    { side: 'bottom', gap: 4, matchWidth: 'exact', fitHeight: true },
  );

  const norm: ComboboxOption[] = options.map((o) => (typeof o === 'string' ? { value: o, label: o } : o));
  const selected = norm.filter((o) => o.value === value)[0];
  const text = open ? query : selected ? selected.label : '';
  const matches = norm.filter((o) => {
    if (props.filter === false) return true;
    return !open || !query || o.label.toLowerCase().indexOf(query.toLowerCase()) !== -1;
  });

  function commit(option?: ComboboxOption): void {
    if (!option || option.disabled) return;
    if (props.value === undefined) setHeld(option.value);
    if (props.onChange) props.onChange(option.value, option);
    setQuery('');
    setOpen(false);
  }

  function onKeyDown(event: React.KeyboardEvent<HTMLInputElement>): void {
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      if (!open) {
        setOpen(true);
        setActive(0);
        return;
      }
      let next = event.key === 'ArrowDown' ? active + 1 : active - 1;
      if (next < 0) next = matches.length - 1;
      if (next >= matches.length) next = 0;
      setActive(next);
    } else if (event.key === 'Enter') {
      if (open) {
        event.preventDefault();
        commit(matches[active]);
      }
    } else if (event.key === 'Escape') {
      setOpen(false);
      setQuery('');
    }
  }

  const control = React.createElement('div', { className: 'rr-combo', ref }, [
    React.createElement('div', { className: 'rr-select-wrap', key: 'w' }, [
      React.createElement('input', {
        key: 'i',
        id,
        className: cx('rr-control', `rr-control--${props.size || 'md'}`, 'rr-combo__input'),
        role: 'combobox',
        autoComplete: 'off',
        'aria-expanded': String(open),
        'aria-controls': `${id}-list`,
        'aria-autocomplete': 'list',
        'aria-activedescendant': open && matches[active] ? `${id}-opt-${active}` : undefined,
        'aria-invalid': props.error ? 'true' : undefined,
        'aria-describedby': props.error || props.hint ? `${id}-msg` : undefined,
        placeholder: props.placeholder || 'Search',
        disabled: props.disabled,
        value: text,
        onChange: (event: React.ChangeEvent<HTMLInputElement>) => {
          setQuery(event.target.value);
          setOpen(true);
          setActive(0);
        },
        onFocus: () => setOpen(true),
        onKeyDown,
      }),
      React.createElement(
        'span',
        { className: 'rr-select-wrap__caret', key: 'c' },
        icons.search({ width: '100%', height: '100%' }),
      ),
    ]),
    open
      ? React.createElement(
          'ul',
          { key: 'l', className: 'rr-combo__list', role: 'listbox', id: `${id}-list` },
          matches.length
            ? matches.map((o, i) =>
                React.createElement(
                  'li',
                  {
                    key: o.value,
                    id: `${id}-opt-${i}`,
                    role: 'option',
                    'aria-selected': String(o.value === value),
                    'aria-disabled': o.disabled ? 'true' : undefined,
                    className: cx(
                      'rr-combo__option',
                      i === active && 'rr-combo__option--active',
                      o.value === value && 'rr-combo__option--selected',
                    ),
                    onMouseEnter: () => setActive(i),
                    onMouseDown: (event: React.MouseEvent) => {
                      event.preventDefault();
                      commit(o);
                    },
                  },
                  [
                    React.createElement('span', { key: 'l' }, o.label),
                    o.description
                      ? React.createElement('span', { key: 'd', className: 'rr-combo__option-desc' }, o.description)
                      : null,
                    o.value === value
                      ? React.createElement(
                          'span',
                          { key: 'c', className: 'rr-combo__check' },
                          icons.check({ width: 14, height: 14 }),
                        )
                      : null,
                  ],
                ),
              )
            : React.createElement(
                'li',
                {
                  className: 'rr-combo__empty',
                  role: 'option',
                  'aria-disabled': 'true',
                  'aria-selected': 'false',
                },
                props.emptyText || 'No matches',
              ),
        )
      : null,
  ]);

  return Field({ ...props, id }, control);
}

export default Combobox;
