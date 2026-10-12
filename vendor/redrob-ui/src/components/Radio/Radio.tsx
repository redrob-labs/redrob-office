import * as React from 'react';
import { cx } from '../../internal/cx';
import { omit } from '../../internal/omit';

export interface RadioProps
  extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'className' | 'type'> {
  label?: React.ReactNode;
  /** A short aside under the label. */
  hint?: React.ReactNode;
  className?: string;
  children?: React.ReactNode;
}

/**
 * One choice out of several, where the options are all visible.
 *
 * Give every radio in a set the same `name` - that is what makes them one choice rather than several
 * independent ones, and nothing here can infer it. Under about seven options this beats a `Select`,
 * because the reader can compare them without opening anything.
 */
export function Radio(props: RadioProps): React.ReactElement {
  const rest = omit(props, ['label', 'hint', 'className', 'children']);

  return React.createElement(
    'label',
    {
      className: cx('rr-choice', props.disabled && 'rr-choice--disabled', props.className),
      style: { position: 'relative' },
    },
    [
      React.createElement('input', { type: 'radio', className: 'rr-choice__input', key: 'i', ...rest }),
      React.createElement(
        'span',
        { className: 'rr-choice__box rr-choice__box--radio', key: 'b' },
        React.createElement('span', { className: 'rr-choice__dot' }),
      ),
      React.createElement('span', { className: 'rr-choice__text', key: 't' }, [
        React.createElement('span', { key: 'l' }, props.label || props.children),
        props.hint ? React.createElement('span', { className: 'rr-choice__hint', key: 'h' }, props.hint) : null,
      ]),
    ],
  );
}

export default Radio;
