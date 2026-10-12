import * as React from 'react';
import { cx } from '../../internal/cx';
import { omit } from '../../internal/omit';
import { icons } from '../../icons';

export interface CheckboxProps
  extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'className' | 'type'> {
  label?: React.ReactNode;
  /** A short aside under the label. */
  hint?: React.ReactNode;
  /** Neither checked nor unchecked: some of the things below are. */
  indeterminate?: boolean;
  className?: string;
  children?: React.ReactNode;
}

/**
 * One independent yes or no.
 *
 * The whole row is the label, so the text is part of the hit area rather than something to aim beside
 * the box.
 *
 * `indeterminate` is not an attribute React can render - it only exists as a DOM property - so it is
 * set through a ref callback. Without that the parent box of a partly-checked group silently shows as
 * unchecked, which reads as "none of these" when the truth is "some".
 */
export function Checkbox(props: CheckboxProps): React.ReactElement {
  const rest = omit(props, ['label', 'hint', 'indeterminate', 'className', 'children']);
  const ref = React.useCallback(
    (node: HTMLInputElement | null) => {
      if (node) node.indeterminate = !!props.indeterminate;
    },
    [props.indeterminate],
  );

  return React.createElement(
    'label',
    {
      className: cx('rr-choice', props.disabled && 'rr-choice--disabled', props.className),
      style: { position: 'relative' },
    },
    [
      React.createElement('input', {
        type: 'checkbox',
        className: 'rr-choice__input',
        ref,
        key: 'i',
        ...rest,
      }),
      React.createElement(
        'span',
        { className: 'rr-choice__box', key: 'b' },
        props.indeterminate
          ? icons.minus({ className: 'rr-choice__mark', width: '12', height: '12' })
          : icons.check({ className: 'rr-choice__mark', width: '12', height: '12' }),
      ),
      React.createElement('span', { className: 'rr-choice__text', key: 't' }, [
        React.createElement('span', { key: 'l' }, props.label || props.children),
        props.hint ? React.createElement('span', { className: 'rr-choice__hint', key: 'h' }, props.hint) : null,
      ]),
    ],
  );
}

export default Checkbox;
