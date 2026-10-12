import * as React from 'react';
import { cx } from '../../internal/cx';
import { omit } from '../../internal/omit';
import { useStableId } from '../../internal/ids';
import { Field, FieldShellProps } from '../../internal/Field';
import { useFloating } from '../../internal/useFloating';
import { icons } from '../../icons';

export interface SelectOption {
  value: string | number;
  label: string;
  /** A second line under the label. Only rendered by the list, not by the native control. */
  detail?: React.ReactNode;
  disabled?: boolean;
}

export interface SelectProps extends FieldShellProps {
  /** Options, or bare strings when value and label are the same. */
  options?: Array<SelectOption | string>;
  value?: string | number;
  defaultValue?: string | number;
  /** Shown when nothing is chosen, as a disabled first option. Not a label. */
  placeholder?: string;
  size?: 'sm' | 'md' | 'lg';
  /** Submitted name. In the list variant a hidden input carries it. */
  name?: string;
  disabled?: boolean;
  invalid?: boolean;
  /**
   * Use the platform's own dropdown. Right for a long list on a phone, and for a form that has to
   * work with JavaScript off.
   */
  native?: boolean;
  onChange?: (event: unknown, option?: SelectOption) => void;
}

/**
 * Pick one value from a list.
 *
 * Under about seven visible options a set of `Radio`s is easier to compare. For a list long enough to
 * need searching, that is `Combobox`.
 *
 * The list variant is the select-only combobox pattern: focus stays on the button and the active
 * option is announced through `aria-activedescendant`, because moving real focus into the list would
 * take it away from the control the person is operating. It flips upward when there is not room
 * below, measured off the live rectangle rather than assumed.
 */
export function Select(props: SelectProps): React.ReactElement {
  const autoId = useStableId('rr-select');
  const id = props.id || autoId;
  const size = props.size || 'md';
  const invalid = props.invalid || !!props.error;
  const options: SelectOption[] = (props.options || []).map((o) =>
    typeof o === 'string' ? { value: o, label: o } : o,
  );

  const controlled = props.value !== undefined;
  const [inner, setInner] = React.useState<string | number | undefined>(
    props.defaultValue !== undefined
      ? props.defaultValue
      : props.placeholder
        ? ''
        : options[0] && options[0].value,
  );
  const value = controlled ? props.value : inner;
  const [open, setOpen] = React.useState(false);
  const [active, setActive] = React.useState(-1);
  const [up, setUp] = React.useState(false);
  const wrap = React.useRef<HTMLSpanElement | null>(null);
  const list = React.useRef<HTMLUListElement | null>(null);
  const btn = React.useRef<HTMLButtonElement | null>(null);
  const typed = React.useRef({ s: '', t: 0 });
  const listId = `${id}-list`;
  const current = options.filter((o) => String(o.value) === String(value))[0];

  const enabled = (i: number): boolean => !!options[i] && !options[i].disabled;

  function step(from: number, dir: number): number {
    for (let i = from + dir; i >= 0 && i < options.length; i += dir) if (enabled(i)) return i;
    return from;
  }

  function show(): void {
    if (props.disabled) return;
    const i = options.indexOf(current);
    setActive(i >= 0 ? i : step(-1, 1));
    const rect = wrap.current && wrap.current.getBoundingClientRect();
    setUp(!!rect && window.innerHeight - rect.bottom < 280 && rect.top > window.innerHeight - rect.bottom);
    setOpen(true);
  }

  function choose(i: number): void {
    if (!enabled(i)) return;
    const option = options[i];
    setOpen(false);
    if (btn.current) btn.current.focus();
    if (String(option.value) === String(value)) return;
    if (!controlled) setInner(option.value);
    if (props.onChange) {
      // Shaped like a change event so a consumer's existing handler works unchanged, which is what
      // lets the list variant be swapped in for `native` without touching the form code.
      const target = { value: String(option.value), name: props.name, id };
      props.onChange(
        { target, currentTarget: target, type: 'change', preventDefault: () => {}, stopPropagation: () => {} },
        option,
      );
    }
  }

  React.useEffect(() => {
    if (!open) return undefined;
    function away(event: PointerEvent): void {
      if (wrap.current && !wrap.current.contains(event.target as Node)) setOpen(false);
    }
    document.addEventListener('pointerdown', away);
    return () => document.removeEventListener('pointerdown', away);
  }, [open]);

  React.useEffect(() => {
    if (!open || !list.current || active < 0) return;
    const el = list.current.children[active] as HTMLElement | undefined;
    if (el && el.scrollIntoView) el.scrollIntoView({ block: 'nearest' });
  }, [open, active]);

  // Placed against the window: the list used to open inside its container and could be cut off by it.
  useFloating(open, () => [btn.current, list.current], { side: up ? 'top' : 'bottom', gap: 6, matchWidth: 'min', fitHeight: true });

  function onKey(event: React.KeyboardEvent<HTMLButtonElement>): void {
    const k = event.key;
    if (!open) {
      if (k === 'ArrowDown' || k === 'ArrowUp' || k === 'Enter' || k === ' ') {
        event.preventDefault();
        show();
      }
      return;
    }
    if (k === 'ArrowDown') {
      event.preventDefault();
      setActive(step(active, 1));
    } else if (k === 'ArrowUp') {
      event.preventDefault();
      setActive(step(active, -1));
    } else if (k === 'Home') {
      event.preventDefault();
      setActive(step(-1, 1));
    } else if (k === 'End') {
      event.preventDefault();
      setActive(step(options.length, -1));
    } else if (k === 'Enter' || k === ' ') {
      event.preventDefault();
      choose(active);
    } else if (k === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      setOpen(false);
    } else if (k === 'Tab') {
      setOpen(false);
    } else if (k.length === 1) {
      // Type-ahead: a run of keys inside 700ms is one search string, so "sw" finds Sweden rather than
      // jumping to the next S and then the next W.
      const now = Date.now();
      const t = typed.current;
      t.s = (now - t.t > 700 ? '' : t.s) + k.toLowerCase();
      t.t = now;
      for (let i = 0; i < options.length; i++) {
        let n = (active + 1 + i) % options.length;
        if (t.s.length > 1) n = i;
        if (enabled(n) && String(options[n].label).toLowerCase().indexOf(t.s) === 0) {
          setActive(n);
          break;
        }
      }
    }
  }

  if (props.native) {
    const rest = omit(props, [
      'label',
      'hint',
      'error',
      'size',
      'className',
      'style',
      'id',
      'invalid',
      'options',
      'placeholder',
      'native',
    ]) as Record<string, unknown>;
    const opts: React.ReactNode[] = options.map((o, i) =>
      React.createElement('option', { value: o.value, key: `o${i}`, disabled: o.disabled }, o.label),
    );
    if (props.placeholder) {
      opts.unshift(React.createElement('option', { value: '', key: 'ph', disabled: true }, props.placeholder));
      if (props.value === undefined && props.defaultValue === undefined) rest.defaultValue = '';
    }
    return Field(
      { ...props, id },
      React.createElement('span', { className: 'rr-select-wrap' }, [
        React.createElement(
          'select',
          {
            id,
            key: 's',
            className: cx('rr-control', `rr-control--${size}`, 'rr-select'),
            'aria-invalid': invalid ? 'true' : undefined,
            'aria-describedby': props.error || props.hint ? `${id}-msg` : undefined,
            ...rest,
          },
          opts,
        ),
        React.createElement(
          'span',
          { className: 'rr-select-wrap__caret', key: 'c' },
          icons.chevronDown({ width: '100%', height: '100%' }),
        ),
      ]),
    );
  }

  const control = React.createElement(
    'span',
    {
      className: cx('rr-select-wrap', 'rr-select-wrap--list', open && 'rr-select-wrap--open'),
      ref: wrap,
    },
    [
      React.createElement(
        'button',
        {
          key: 'b',
          ref: btn,
          type: 'button',
          id,
          role: 'combobox',
          disabled: props.disabled,
          className: cx(
            'rr-control',
            `rr-control--${size}`,
            'rr-select',
            'rr-select__button',
            !current && 'rr-select__button--empty',
          ),
          'aria-haspopup': 'listbox',
          'aria-expanded': open ? 'true' : 'false',
          'aria-controls': listId,
          'aria-activedescendant': open && active >= 0 ? `${id}-o${active}` : undefined,
          'aria-invalid': invalid ? 'true' : undefined,
          'aria-describedby': props.error || props.hint ? `${id}-msg` : undefined,
          onClick: () => (open ? setOpen(false) : show()),
          onKeyDown: onKey,
        },
        React.createElement(
          'span',
          { className: 'rr-select__value' },
          current ? current.label : props.placeholder || '',
        ),
      ),
      React.createElement(
        'span',
        { className: 'rr-select-wrap__caret', key: 'c', 'aria-hidden': 'true' },
        icons.chevronDown({ width: '100%', height: '100%' }),
      ),
      props.name
        ? React.createElement('input', {
            key: 'n',
            type: 'hidden',
            name: props.name,
            value: value == null ? '' : value,
          })
        : null,
      React.createElement(
        'ul',
        {
          key: 'l',
          ref: list,
          id: listId,
          role: 'listbox',
          tabIndex: -1,
          hidden: !open,
          'aria-labelledby': id,
          className: cx('rr-select__list', `rr-select__list--${size}`, up && 'rr-select__list--up'),
        },
        options.map((o, i) => {
          const selected = current === o;
          return React.createElement(
            'li',
            {
              key: `o${i}`,
              id: `${id}-o${i}`,
              role: 'option',
              'aria-selected': selected ? 'true' : 'false',
              'aria-disabled': o.disabled ? 'true' : undefined,
              className: cx('rr-select__option', i === active && 'rr-select__option--active'),
              onPointerMove: () => {
                if (i !== active && enabled(i)) setActive(i);
              },
              onMouseDown: (event: React.MouseEvent) => event.preventDefault(),
              onClick: () => choose(i),
            },
            [
              React.createElement('span', { key: 't', className: 'rr-select__otext' }, [
                React.createElement('span', { key: 'l', className: 'rr-select__olabel' }, o.label),
                o.detail
                  ? React.createElement('span', { key: 'd', className: 'rr-select__odetail' }, o.detail)
                  : null,
              ]),
              React.createElement(
                'span',
                { key: 'c', className: 'rr-select__check', 'aria-hidden': 'true' },
                selected ? icons.check({ width: 16, height: 16 }) : null,
              ),
            ],
          );
        }),
      ),
    ],
  );

  return Field({ ...props, id }, control);
}

export default Select;
