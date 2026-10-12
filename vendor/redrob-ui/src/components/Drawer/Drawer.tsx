import * as React from 'react';
import { cx } from '../../internal/cx';
import { useStableId } from '../../internal/ids';
import { icons } from '../../icons';
import { IconButton } from '../IconButton/IconButton';

export interface DrawerProps {
  open?: boolean;
  title?: React.ReactNode;
  /** A line under the title: what this panel is for. */
  description?: React.ReactNode;
  /** Which edge it comes from. `right` for detail, `left` for navigation. */
  side?: 'left' | 'right';
  footer?: React.ReactNode;
  width?: number | string;
  closeLabel?: string;
  className?: string;
  children?: React.ReactNode;
  onClose?: () => void;
}

/**
 * A panel from the edge, for detail beside what the person was looking at.
 *
 * Use it where a `Modal` would be too much: the row stays visible behind it, so the context is not lost.
 * Right for a record's detail, a filter set, a settings panel.
 *
 * Same dialog semantics as Modal, and the same scrim rule - the click must start and end on the scrim, so
 * a text selection dragged out of the panel does not close it.
 */
export function Drawer(props: DrawerProps): React.ReactElement | null {
  // Before the early return: a hook skipped while closed would shift every hook after it on open.
  const titleId = useStableId('rr-drawer-title');
  if (props.open === false) return null;
  const side = props.side || 'right';

  return React.createElement(
    'div',
    {
      className: cx('rr-drawer-scrim', props.className),
      onClick: (event: React.MouseEvent) => {
        if (event.target === event.currentTarget && props.onClose) props.onClose();
      },
    },
    React.createElement(
      'div',
      {
        className: cx('rr-drawer', `rr-drawer--${side}`),
        role: 'dialog',
        'aria-modal': 'true',
        'aria-labelledby': titleId,
        style: props.width ? { width: props.width } : null,
      },
      [
        React.createElement('div', { className: 'rr-drawer__head', key: 'h' }, [
          React.createElement('div', { key: 't', className: 'rr-drawer__titles' }, [
            React.createElement('h2', { className: 'rr-drawer__title', id: titleId, key: 'a' }, props.title),
            props.description
              ? React.createElement('p', { className: 'rr-drawer__desc', key: 'b' }, props.description)
              : null,
          ]),
          props.onClose
            ? React.createElement(
                IconButton,
                { key: 'c', label: props.closeLabel || 'Close', size: 'sm', onClick: props.onClose },
                icons.close({ width: '100%', height: '100%' }),
              )
            : null,
        ]),
        React.createElement('div', { className: 'rr-drawer__body', key: 'b' }, props.children),
        props.footer
          ? React.createElement('div', { className: 'rr-drawer__footer', key: 'f' }, props.footer)
          : null,
      ],
    ),
  );
}

export default Drawer;
