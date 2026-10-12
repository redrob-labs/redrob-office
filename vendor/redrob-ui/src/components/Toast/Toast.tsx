import * as React from 'react';
import { cx } from '../../internal/cx';
import { TONE_ICON, Tone } from '../../internal/tone';
import { icons } from '../../icons';
import { IconButton } from '../IconButton/IconButton';

export interface ToastProps {
  tone?: Tone;
  title?: React.ReactNode;
  /** An undo, usually. Keep it to one. */
  action?: React.ReactNode;
  closeLabel?: string;
  className?: string;
  children?: React.ReactNode;
  onClose?: () => void;
}

/**
 * Confirmation that something happened, floating and brief.
 *
 * For an action that succeeded, and for an undo. Never for something the person must act on: a toast
 * leaves, and anything that can disappear on its own cannot carry a requirement. That belongs in `Alert`.
 *
 * `aria-live="polite"` for every tone but `danger`, so it is announced when the reader pauses instead of
 * cutting across them for news they did not ask to hear twice. `danger` is assertive, as `Alert`'s is: a
 * failure the person needs now is the one case worth interrupting for.
 *
 * This renders one toast. Stacking, timing and dismissal are the app's, because a component that owned the
 * timer would also have to own pausing it on hover and on focus.
 */
export function Toast(props: ToastProps): React.ReactElement {
  const tone = props.tone || 'info';
  const Icon = TONE_ICON[tone] || icons.info;
  /* danger is assertive, as Alert's is; every other tone polite. */
  const urgent = tone === 'danger';

  return React.createElement(
    'div',
    {
      className: cx('rr-toast', `rr-toast--${tone}`, props.className),
      role: urgent ? 'alert' : 'status',
      'aria-live': urgent ? 'assertive' : 'polite',
    },
    [
      React.createElement('span', { className: 'rr-toast__icon', key: 'i' }, Icon({ width: '100%', height: '100%' })),
      React.createElement('div', { className: 'rr-toast__body', key: 'b' }, [
        React.createElement('div', { className: 'rr-toast__title', key: 't' }, props.title),
        props.children
          ? React.createElement('div', { className: 'rr-toast__text', key: 'x' }, props.children)
          : null,
        props.action
          ? React.createElement('div', { className: 'rr-toast__action', key: 'a' }, props.action)
          : null,
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

export default Toast;
