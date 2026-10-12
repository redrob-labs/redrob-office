import * as React from 'react';
import { omit } from '../../internal/omit';
import { useStableId } from '../../internal/ids';
import { Field, FieldShellProps } from '../../internal/Field';

export interface TextareaProps
  extends FieldShellProps,
    Omit<React.TextareaHTMLAttributes<HTMLTextAreaElement>, 'className' | 'style' | 'id'> {
  /** Marks the control invalid without printing a message. `error` implies it. */
  invalid?: boolean;
}

/**
 * Several lines of text.
 *
 * No size prop: a textarea's height is what the content needs, set with `rows` or by the layout, and
 * a control-height scale would only fight that.
 */
export function Textarea(props: TextareaProps): React.ReactElement {
  const autoId = useStableId('rr-textarea');
  const id = props.id || autoId;
  const rest = omit(props, ['label', 'hint', 'error', 'className', 'style', 'id', 'invalid']);
  const invalid = props.invalid || !!props.error;

  const control = React.createElement('textarea', {
    id,
    className: 'rr-control rr-textarea',
    'aria-invalid': invalid ? 'true' : undefined,
    'aria-describedby': props.error || props.hint ? `${id}-msg` : undefined,
    ...rest,
  });

  return Field({ ...props, id }, control);
}

export default Textarea;
