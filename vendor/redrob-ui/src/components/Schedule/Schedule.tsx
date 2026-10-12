import * as React from 'react';
import { cx } from '../../internal/cx';
import { Switch } from '../Switch/Switch';
import { TaskStatus } from '../TaskStatus/TaskStatus';

export interface ScheduleLastRun {
  state?: 'queued' | 'running' | 'blocked' | 'done' | 'failed' | 'stopped';
  label?: string;
  at?: string;
}

export interface ScheduleProps {
  name?: React.ReactNode;
  /** How often, in words: "Every weekday". */
  cadence?: React.ReactNode;
  nextRun?: React.ReactNode;
  lastRun?: ScheduleLastRun;
  /** `false` reads as Paused rather than hiding the row. */
  enabled?: boolean;
  switchLabel?: string;
  className?: string;
  /** Omit it and the schedule cannot be paused from here. */
  onToggle?: (event: React.ChangeEvent<HTMLInputElement>) => void;
}

/**
 * @deprecated Use ScheduleRow. Kept for 1.x.
 *
 * One scheduled task: what it is, when it runs next, and how the last run went.
 *
 * A paused schedule stays visible and says "Paused". Hiding it would leave a task nobody remembers to turn back
 * on, and the last run's state is what tells somebody whether the pause was deliberate.
 *
 * The switch's label names the task, so a page of schedules does not present a column of switches called "on".
 */
export function Schedule(props: ScheduleProps): React.ReactElement {
  const last = props.lastRun;

  return React.createElement(
    'div',
    { className: cx('rr-schedule', props.enabled === false && 'rr-schedule--off', props.className) },
    [
      React.createElement('span', { className: 'rr-schedule__body', key: 'b' }, [
        React.createElement('span', { className: 'rr-schedule__name', key: 'n' }, props.name),
        React.createElement(
          'span',
          { className: 'rr-schedule__when', key: 'w' },
          props.enabled === false
            ? 'Paused'
            : `${props.cadence || ''}${props.nextRun ? ` · next ${props.nextRun}` : ''}`,
        ),
      ]),
      last
        ? React.createElement(
            'span',
            { className: 'rr-schedule__last', key: 'l' },
            React.createElement(TaskStatus, {
              state: last.state,
              label: last.label || `Last ${last.at || ''}`,
            }),
          )
        : null,
      props.onToggle
        ? React.createElement(
            'span',
            { key: 't' },
            React.createElement(Switch, {
              checked: props.enabled !== false,
              onChange: props.onToggle,
              label: props.switchLabel || `Runs on schedule: ${props.name || 'task'}`,
            }),
          )
        : null,
    ],
  );
}

export default Schedule;
