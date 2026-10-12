import * as React from 'react';
import { cx } from '../../internal/cx';
import { omit } from '../../internal/omit';

export interface SwitchProps
  extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'className' | 'type' | 'size'> {
  label?: React.ReactNode;
  size?: 'sm' | 'md';
  className?: string;
  children?: React.ReactNode;
}

/**
 * Turns something on or off, and it takes effect immediately.
 *
 * That is the whole difference from `Checkbox`: a checkbox states an intention that a Save button
 * later commits, a switch acts now. A switch inside a form with a submit button is the wrong control.
 *
 * Carries `role="switch"` so it is announced as on/off rather than checked/unchecked.
 */
export function Switch(props: SwitchProps): React.ReactElement {
  const size = props.size || 'md';
  const rest = omit(props, ['label', 'size', 'className', 'children']);

  return React.createElement(
    'label',
    {
      className: cx(
        'rr-switch',
        size === 'sm' && 'rr-switch--sm',
        props.disabled && 'rr-switch--disabled',
        props.className,
      ),
      style: { position: 'relative' },
    },
    [
      React.createElement('input', {
        type: 'checkbox',
        role: 'switch',
        className: 'rr-switch__input',
        key: 'i',
        ...rest,
      }),
      React.createElement(
        'span',
        { className: 'rr-switch__track', key: 't' },
        React.createElement('span', { className: 'rr-switch__thumb' }),
      ),
      props.label ? React.createElement('span', { key: 'l' }, props.label) : null,
    ],
  );
}

export default Switch;
