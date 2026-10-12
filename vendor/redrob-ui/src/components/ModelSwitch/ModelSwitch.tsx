import * as React from 'react';
import { cx } from '../../internal/cx';
import { icons } from '../../icons';

export interface ModelSwitchProps {
  /** The model now answering. Named, because the person is being told which one. */
  to?: React.ReactNode;
  /** Who switched. `you` when the person pinned it, otherwise Redrob Auto did. */
  by?: 'you' | 'auto';
  /** Why, as a clause: "because this needs longer reasoning". */
  reason?: string;
  note?: React.ReactNode;
  className?: string;
}

/**
 * @deprecated Use ThreadNote. Kept for 1.x.
 *
 * Says the model changed mid-conversation, and that nothing was lost.
 *
 * The reassurance is the point. A person who sees the model change reasonably assumes the new one is starting
 * cold, so the note says it reads the same memory. Without that line, a switch reads as a reset.
 *
 * `role="note"`, so it is an aside in the transcript rather than another turn in the conversation.
 */
export function ModelSwitch(props: ModelSwitchProps): React.ReactElement {
  return React.createElement('p', { className: cx('rr-mswitch', props.className), role: 'note' }, [
    React.createElement(
      'span',
      { key: 'i', className: 'rr-mswitch__icon', 'aria-hidden': 'true' },
      props.by === 'you' ? icons.pin({ width: 14, height: 14 }) : icons.sparkle({ width: 14, height: 14 }),
    ),
    React.createElement('span', { key: 't' }, [
      props.by === 'you' ? 'Switched to ' : 'Redrob Auto switched to ',
      React.createElement('b', { key: 'b' }, props.to),
      props.reason ? ` ${props.reason}` : '',
      '. ',
      props.note || 'It reads the same memory, so it knows everything above.',
    ]),
  ]);
}

export default ModelSwitch;
