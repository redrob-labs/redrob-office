import * as React from 'react';
import { cx } from '../../internal/cx';
import { icons } from '../../icons';

export interface MemorySavedProps {
  label?: React.ReactNode;
  note?: React.ReactNode;
  undoLabel?: React.ReactNode;
  className?: string;
  /** What was remembered. */
  children?: React.ReactNode;
  /** Omit it and the memory cannot be undone here - so only omit it when that is true. */
  onUndo?: () => void;
}

/**
 * @deprecated Use ThreadNote with `kind="memory"`. Kept for 1.x.
 *
 * Says something was written to memory, what it was, and how to take it back.
 *
 * All three, together. A product that remembers silently is a product deciding what it knows about someone
 * without telling them, and the note says the reach out loud: every AI will know it from now on.
 *
 * `role="status"`, so it is announced without interrupting.
 */
export function MemorySaved(props: MemorySavedProps): React.ReactElement {
  return React.createElement('p', { className: cx('rr-memsaved', props.className), role: 'status' }, [
    React.createElement(
      'span',
      { key: 'i', className: 'rr-memsaved__icon', 'aria-hidden': 'true' },
      icons.bookOpen({ width: 14, height: 14 }),
    ),
    React.createElement('span', { key: 't' }, [
      props.label || 'Saved to memory: ',
      React.createElement('b', { key: 'b' }, props.children),
      '. ',
      props.note || 'Every AI will know it from now on.',
    ]),
    props.onUndo
      ? React.createElement(
          'button',
          { key: 'u', type: 'button', className: 'rr-memsaved__undo', onClick: props.onUndo },
          props.undoLabel || 'Undo',
        )
      : null,
  ]);
}

export default MemorySaved;
