import * as React from 'react';
import { cx } from '../../internal/cx';
import { omit } from '../../internal/omit';
import { useStableId } from '../../internal/ids';
import { Field, FieldShellProps } from '../../internal/Field';

export interface InputProps
  extends FieldShellProps,
    Omit<React.InputHTMLAttributes<HTMLInputElement>, 'size' | 'className' | 'style' | 'id'> {
  size?: 'sm' | 'md' | 'lg';
  /** Marks the control invalid without printing a message. `error` implies it. */
  invalid?: boolean;
}

/**
 * One line of text, with its label, hint and error.
 *
 * For a person's name, an address, a phone number, a date or an amount, reach for the components in
 * the Borders group instead: each of those decides something about who can fill it in, and a bare
 * text field quietly decides it wrong.
 *
 * The id is generated once and kept, so the label keeps pointing at the same control across
 * re-renders. Pass `id` only when something outside needs to reference the field.
 */
export function Input(props: InputProps): React.ReactElement {
  const autoId = useStableId('rr-input');
  const id = props.id || autoId;
  const size = props.size || 'md';
  const rest = omit(props, ['label', 'hint', 'error', 'size', 'className', 'style', 'id', 'invalid']);
  const invalid = props.invalid || !!props.error;

  const control = React.createElement('input', {
    id,
    className: cx('rr-control', `rr-control--${size}`),
    'aria-invalid': invalid ? 'true' : undefined,
    'aria-describedby': props.error || props.hint ? `${id}-msg` : undefined,
    ...rest,
  });

  return Field({ ...props, id }, control);
}

export default Input;
