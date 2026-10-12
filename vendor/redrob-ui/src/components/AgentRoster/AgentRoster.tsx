import * as React from 'react';
import { cx } from '../../internal/cx';
import { RUN_LABEL } from '../../internal/harness';
import { Button } from '../Button/Button';
import { TaskStatus } from '../TaskStatus/TaskStatus';

export interface RosterAgent {
  id?: string | number;
  name?: React.ReactNode;
  /** What it is doing right now. Falls back to the state's word. */
  step?: React.ReactNode;
  state?: 'queued' | 'running' | 'blocked' | 'done' | 'failed' | 'stopped';
  elapsed?: React.ReactNode;
  note?: React.ReactNode;
}

export interface AgentRosterProps {
  agents?: RosterAgent[];
  label?: string;
  className?: string;
  /** Offers Stop on running and queued agents. Omit it and nothing can be stopped from here. */
  onStop?: (agent: RosterAgent) => void;
}

/**
 * Every agent working right now, what each is doing, and how to stop one.
 *
 * Stop appears only on running and queued agents, because stopping something already finished is a control that
 * does nothing. Each row shows its current step rather than only its state - "Running" tells a person less than
 * "Reading the third contract".
 */
export function AgentRoster(props: AgentRosterProps): React.ReactElement {
  const agents = props.agents || [];

  return React.createElement(
    'div',
    { className: cx('rr-roster', props.className), role: 'list', 'aria-label': props.label || 'Agents' },
    agents.map((a, i) =>
      React.createElement('div', { className: 'rr-roster__row', key: a.id || i, role: 'listitem' }, [
        React.createElement(
          'span',
          { className: 'rr-roster__state', key: 's' },
          React.createElement(TaskStatus, { state: a.state, label: '' }),
        ),
        React.createElement('span', { className: 'rr-roster__body', key: 'b' }, [
          React.createElement('span', { className: 'rr-roster__name', key: 'n' }, a.name),
          React.createElement(
            'span',
            { className: 'rr-roster__step', key: 'p' },
            a.step || RUN_LABEL[a.state as string] || '',
          ),
        ]),
        React.createElement('span', { className: 'rr-roster__meta', key: 'm' }, [
          a.elapsed ? React.createElement('span', { key: 'e' }, a.elapsed) : null,
          a.note ? React.createElement('span', { key: 'c' }, a.note) : null,
        ]),
        props.onStop && (a.state === 'running' || a.state === 'queued')
          ? React.createElement(
              'span',
              { className: 'rr-roster__actions', key: 'a' },
              React.createElement(
                Button,
                { variant: 'ghost', size: 'sm', onClick: () => props.onStop && props.onStop(a) },
                'Stop',
              ),
            )
          : null,
      ]),
    ),
  );
}

export default AgentRoster;
