import * as React from 'react';
import { cx } from '../../internal/cx';
import { useStableId } from '../../internal/ids';
import { icons } from '../../icons';
import { IconButton } from '../IconButton/IconButton';

export interface ModalProps {
  /** `false` renders nothing. The app owns whether it is open. */
  open?: boolean;
  title?: React.ReactNode;
  /** The actions. A modal that asks a question needs an answer and a way out. */
  footer?: React.ReactNode;
  /** Max width. Keep it narrow: a wide modal is a page that forgot to be one. */
  width?: number | string;
  closeLabel?: string;
  className?: string;
  children?: React.ReactNode;
  onClose?: () => void;
}

/**
 * Interrupts, for one decision that has to be made before anything else.
 *
 * The bar is high: it takes the whole screen away. A destructive confirmation qualifies, a form usually does
 * not, and information almost never does.
 *
 * `aria-modal` and `role="dialog"` are on the panel, not the scrim, and the title is wired through
 * `aria-labelledby` - so a screen reader announces what it is rather than "dialog".
 *
 * Clicking the scrim closes it only when the click both started and ended there, which is why the handler
 * compares target with currentTarget: a drag that began inside the panel should not dismiss the decision.
 */
export function Modal(props: ModalProps): React.ReactElement | null {
  // Before the early return: a hook skipped while closed would shift every hook after it on open.
  const titleId = useStableId('rr-modal-title');
  if (props.open === false) return null;

  return React.createElement(
    'div',
    {
      className: cx('rr-modal-scrim', props.className),
      onClick: (event: React.MouseEvent) => {
        if (event.target === event.currentTarget && props.onClose) props.onClose();
      },
    },
    React.createElement(
      'div',
      {
        className: 'rr-modal',
        role: 'dialog',
        'aria-modal': 'true',
        'aria-labelledby': titleId,
        style: props.width ? { maxWidth: props.width } : null,
      },
      [
        React.createElement('div', { className: 'rr-modal__head', key: 'h' }, [
          React.createElement('h2', { className: 'rr-modal__title', id: titleId, key: 't' }, props.title),
          props.onClose
            ? React.createElement(
                IconButton,
                { key: 'c', label: props.closeLabel || 'Close', size: 'sm', onClick: props.onClose },
                icons.close({ width: '100%', height: '100%' }),
              )
            : null,
        ]),
        React.createElement('div', { className: 'rr-modal__body', key: 'b' }, props.children),
        props.footer
          ? React.createElement('div', { className: 'rr-modal__footer', key: 'f' }, props.footer)
          : null,
      ],
    ),
  );
}

export default Modal;
