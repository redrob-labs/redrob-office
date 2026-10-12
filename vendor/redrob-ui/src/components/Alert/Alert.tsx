import * as React from 'react';
import { cx } from '../../internal/cx';
import { TONE_ICON, Tone } from '../../internal/tone';
import { icons } from '../../icons';
import { IconButton } from '../IconButton/IconButton';

export interface AlertProps {
  tone?: Tone;
  title?: React.ReactNode;
  /** A control to fix or learn more. One, not a row of them. */
  action?: React.ReactNode;
  closeLabel?: string;
  className?: string;
  children?: React.ReactNode;
  /** Omit it and the alert cannot be dismissed - correct for something that must be read. */
  onClose?: () => void;
}

/**
 * A message about the page, in place, that stays until it is dealt with.
 *
 * In place is the distinction: an Alert belongs to the thing it is about and stays there, a `Toast`
 * floats and disappears. Anything a person must act on belongs here, never in a toast.
 *
 * `danger` gets `role="alert"`, which interrupts a screen reader; everything else gets `role="status"`,
 * which waits its turn. Making them all `alert` means every mild notice talks over whatever the person
 * was reading.
 */
export function Alert(props: AlertProps): React.ReactElement {
  const tone = props.tone || 'info';
  const Icon = TONE_ICON[tone] || icons.info;

  return React.createElement(
    'div',
    {
      className: cx('rr-alert', `rr-alert--${tone}`, props.className),
      role: tone === 'danger' ? 'alert' : 'status',
    },
    [
      React.createElement('span', { className: 'rr-alert__icon', key: 'i' }, Icon({ width: '100%', height: '100%' })),
      React.createElement('div', { className: 'rr-alert__body', key: 'b' }, [
        props.title ? React.createElement('div', { className: 'rr-alert__title', key: 't' }, props.title) : null,
        props.children
          ? React.createElement('div', { className: 'rr-alert__text', key: 'x' }, props.children)
          : null,
        props.action ? React.createElement('div', { key: 'a', style: { marginTop: '4px' } }, props.action) : null,
      ]),
      props.onClose
        ? React.createElement(
            IconButton,
            { key: 'c', label: props.closeLabel || 'Dismiss', size: 'sm', onClick: props.onClose },
            icons.close({ width: '100%', height: '100%' }),
          )
        : null,
    ],
  );
}

export default Alert;
