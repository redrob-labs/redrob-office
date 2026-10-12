import * as React from 'react';
import { cx } from '../../internal/cx';
import { omit } from '../../internal/omit';

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  /** Visual weight. One `primary` per view: it names the action the screen is about. */
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger';
  /** `sm` 32px, `md` 40px, `lg` 48px. `md` everywhere except toolbars and table rows. */
  size?: 'sm' | 'md' | 'lg';
  /** Fully rounded. One prominent action per view. */
  shape?: 'rounded' | 'pill';
  /** Soft brand halo around the one action a view is about. */
  emphasis?: boolean;
  /** Disables the button, swaps the leading icon for a spinner and keeps the label. */
  loading?: boolean;
  iconLeft?: React.ReactNode;
  iconRight?: React.ReactNode;
  fullWidth?: boolean;
}

/**
 * Triggers an action: submitting a form, opening a dialog, running a search.
 *
 * Labels are verbs - "Save role", not "OK". An icon on its own is `IconButton`, not a Button with no
 * children: the two have different hit areas and different accessible names.
 *
 * `loading` keeps the label in place rather than replacing it with a spinner, so the button does not
 * change width while a request is in flight, and sets `aria-busy` for anything listening.
 */
export function Button(props: ButtonProps): React.ReactElement {
  const variant = props.variant || 'primary';
  const size = props.size || 'md';
  const rest = omit(props, [
    'variant',
    'size',
    'iconLeft',
    'iconRight',
    'fullWidth',
    'loading',
    'shape',
    'emphasis',
    'className',
    'children',
  ]);

  const kids: React.ReactNode[] = [];
  if (props.loading) {
    kids.push(React.createElement('span', { className: 'rr-spinner', key: 'spin' }));
  } else if (props.iconLeft) {
    kids.push(React.createElement('span', { className: 'rr-btn__icon', key: 'il' }, props.iconLeft));
  }
  kids.push(React.createElement('span', { key: 'label' }, props.children));
  if (props.iconRight && !props.loading) {
    kids.push(React.createElement('span', { className: 'rr-btn__icon', key: 'ir' }, props.iconRight));
  }

  return React.createElement(
    'button',
    {
      type: props.type || 'button',
      className: cx(
        'rr-btn',
        `rr-btn--${variant}`,
        `rr-btn--${size}`,
        props.shape === 'pill' && 'rr-btn--pill',
        props.emphasis && 'rr-btn--emphasis',
        props.fullWidth && 'rr-btn--block',
        props.className,
      ),
      disabled: props.disabled || props.loading,
      'aria-busy': props.loading ? 'true' : undefined,
      ...rest,
    },
    kids,
  );
}

export default Button;
