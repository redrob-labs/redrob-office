import * as React from 'react';
import { cx } from '../../internal/cx';
import { RUN_LABEL } from '../../internal/harness';
import { Loader } from '../Loader/Loader';

export interface TaskStatusProps {
  state?: 'queued' | 'running' | 'blocked' | 'done' | 'failed' | 'stopped';
  /** Overrides the state's word. Pass `''` to show the dot alone, inside a row that names it already. */
  label?: string;
  elapsed?: React.ReactNode;
  className?: string;
}

/**
 * What a run is doing, in a word and a dot.
 *
 * `blocked` is called "Waiting on you", not "Blocked". The agent is not stuck - it is holding for an answer, and
 * the label's job is to tell the person that the next move is theirs.
 *
 * `role="status"` so a change is announced, and the word is always present unless a caller explicitly passes an
 * empty label because the surrounding row already says it.
 */
export function TaskStatus(props: TaskStatusProps): React.ReactElement {
  const state = props.state || 'queued';

  return React.createElement('span', { className: cx('rr-task', `rr-task--${state}`, props.className), role: 'status' }, [
    state === 'running'
      ? React.createElement(Loader, {
          key: 'd',
          size: 'sm',
          label: props.label == null ? RUN_LABEL[state] : props.label || RUN_LABEL[state],
        })
      : React.createElement('span', { className: 'rr-task__dot', key: 'd', 'aria-hidden': 'true' }),
    props.label === ''
      ? null
      : React.createElement(
          'span',
          { className: 'rr-task__label', key: 'l' },
          props.label || RUN_LABEL[state] || state,
        ),
    props.elapsed
      ? React.createElement('span', { className: 'rr-task__elapsed', key: 'e' }, props.elapsed)
      : null,
  ]);
}

export default TaskStatus;
