import * as React from 'react';
import { cx } from '../../internal/cx';
import { Button } from '../Button/Button';

export interface StreamingProps {
  /** `thinking` before any text arrives, then the text streams, then `done`. */
  state?: 'thinking' | 'streaming' | 'done';
  /** The line saying what it is doing. Not the text it is producing. */
  label?: React.ReactNode;
  stopLabel?: React.ReactNode;
  className?: string;
  /** The text being produced. */
  children?: React.ReactNode;
  /** Omit it and the person cannot stop a long answer. */
  onStop?: () => void;
}

/**
 * An answer arriving, with a way to stop it.
 *
 * `label` is the line saying what it is doing; `children` is the text it is producing. They are separate
 * because a caller passing only `label` used to get a bare Stop button and no sentence.
 *
 * `thinking` is its own state with a live region, so a screen reader is told something is happening before
 * any text exists to read. Once text arrives the caret shows it is still going, and Stop stays available until
 * `done` - an answer that cannot be interrupted is one the person has to wait out.
 */
export function Streaming(props: StreamingProps): React.ReactElement {
  if (props.state === 'thinking') {
    return React.createElement(
      'span',
      { className: cx('rr-streaming__status', props.className), role: 'status', 'aria-live': 'polite' },
      [
        React.createElement('span', { className: 'rr-spinner', key: 's', style: { fontSize: '13px' } }),
        React.createElement('span', { key: 't' }, props.label || 'Thinking'),
        props.onStop
          ? React.createElement(
              Button,
              {
                key: 'b',
                size: 'sm',
                variant: 'secondary',
                className: 'rr-streaming__stop',
                onClick: props.onStop,
              },
              props.stopLabel || 'Stop',
            )
          : null,
      ],
    );
  }

  return React.createElement('span', { className: cx('rr-streaming', props.className) }, [
    props.label ? React.createElement('span', { className: 'rr-streaming__label', key: 'l' }, props.label) : null,
    React.createElement('span', { key: 't' }, props.children),
    props.state !== 'done'
      ? React.createElement('span', { className: 'rr-streaming__caret', key: 'c', 'aria-hidden': 'true' })
      : null,
    props.state !== 'done' && props.onStop
      ? React.createElement(
          Button,
          {
            key: 'b',
            size: 'sm',
            variant: 'secondary',
            className: 'rr-streaming__stop',
            onClick: props.onStop,
          },
          props.stopLabel || 'Stop',
        )
      : null,
  ]);
}

export default Streaming;
