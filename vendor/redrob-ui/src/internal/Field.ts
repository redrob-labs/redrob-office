import * as React from 'react';
import { cx } from './cx';

export interface FieldShellProps {
  /** Ties the label to the control and names the message element `<id>-msg`. */
  id?: string;
  label?: React.ReactNode;
  /** Marks the field required in the label. Does not itself set the control's `required`. */
  required?: boolean;
  /** Guidance shown under the control. Replaced by `error` when there is one. */
  hint?: React.ReactNode;
  /** What is wrong, in words. Its presence is what makes the field invalid. */
  error?: React.ReactNode;
  className?: string;
  style?: React.CSSProperties;
}

/**
 * The frame around every form control: label above, control, then one message below.
 *
 * Error and hint share a single element id (`<id>-msg`) and the error replaces the hint rather than
 * stacking under it. That is deliberate: a control can only point `aria-describedby` at one message,
 * and showing both means a screen reader reads guidance the field has already failed.
 *
 * Not a component in the public API - it has no independent meaning, and exporting it would invite
 * a field assembled outside the system's own controls.
 */
export function Field(props: FieldShellProps, control: React.ReactNode): React.ReactElement {
  const kids: React.ReactNode[] = [];

  if (props.label) {
    kids.push(
      React.createElement('label', { className: 'rr-field__label', htmlFor: props.id, key: 'l' }, [
        props.label,
        props.required
          ? React.createElement('span', { className: 'rr-field__req', key: 'r', 'aria-hidden': 'true' }, '*')
          : null,
      ]),
    );
  }

  kids.push(React.createElement('div', { key: 'c' }, control));

  if (props.error) {
    kids.push(
      React.createElement('p', { className: 'rr-field__error', id: `${props.id}-msg`, key: 'e' }, props.error),
    );
  } else if (props.hint) {
    kids.push(
      React.createElement('p', { className: 'rr-field__hint', id: `${props.id}-msg`, key: 'h' }, props.hint),
    );
  }

  return React.createElement(
    'div',
    { className: cx('rr-field', props.className), style: props.style },
    kids,
  );
}
