import * as React from 'react';
import { cx } from '../../internal/cx';
import { icons } from '../../icons';

export interface AgentHandoffProps {
  from?: React.ReactNode;
  fromNote?: React.ReactNode;
  fromWhen?: React.ReactNode;
  to?: React.ReactNode;
  toNote?: React.ReactNode;
  toWhen?: React.ReactNode;
  passLabel?: React.ReactNode;
  /** What was passed along: findings, files, a decision. */
  carried?: React.ReactNode[];
  carriedLabel?: React.ReactNode;
  className?: string;
}

/**
 * One agent passing work to another, and what went with it.
 *
 * `carried` is the point. A handoff without it is an org chart; with it, a person can see whether the second agent
 * actually received what it needed, which is where multi-agent runs usually go wrong.
 *
 * The group's accessible name is composed from both names, so a screen reader announces "Research passed this to
 * Drafting" rather than "group".
 */
export function AgentHandoff(props: AgentHandoffProps): React.ReactElement {
  const carried = props.carried || [];

  return React.createElement(
    'div',
    {
      className: cx('rr-handoff', props.className),
      role: 'group',
      'aria-label': `${props.from || ''} passed this to ${props.to || ''}`,
    },
    [
      React.createElement('div', { className: 'rr-handoff__step rr-handoff__step--from', key: 'f' }, [
        React.createElement(
          'span',
          { className: 'rr-handoff__rail', key: 'r', 'aria-hidden': 'true' },
          React.createElement(
            'span',
            { className: 'rr-handoff__dot rr-handoff__dot--done' },
            React.createElement(icons.check as never, { size: 12 } as never),
          ),
        ),
        React.createElement('span', { className: 'rr-handoff__body', key: 'b' }, [
          React.createElement('span', { className: 'rr-handoff__name', key: 'n' }, props.from),
          props.fromNote
            ? React.createElement('span', { className: 'rr-handoff__note', key: 'o' }, props.fromNote)
            : null,
        ]),
        React.createElement('span', { className: 'rr-handoff__when', key: 'w' }, props.fromWhen || 'Finished'),
      ]),
      React.createElement('div', { className: 'rr-handoff__pass', key: 'p' }, [
        React.createElement(
          'span',
          { className: 'rr-handoff__rail', key: 'r', 'aria-hidden': 'true' },
          React.createElement(
            'span',
            { className: 'rr-handoff__arrow' },
            React.createElement(icons.arrowDown as never, { size: 14 } as never),
          ),
        ),
        React.createElement(
          'span',
          { className: 'rr-handoff__passlabel', key: 'l' },
          props.passLabel || 'Passed on',
        ),
      ]),
      React.createElement('div', { className: 'rr-handoff__step rr-handoff__step--to', key: 't' }, [
        React.createElement(
          'span',
          { className: 'rr-handoff__rail', key: 'r', 'aria-hidden': 'true' },
          React.createElement('span', { className: 'rr-handoff__dot rr-handoff__dot--now' }),
        ),
        React.createElement('span', { className: 'rr-handoff__body', key: 'b' }, [
          React.createElement('span', { className: 'rr-handoff__name', key: 'n' }, props.to),
          props.toNote
            ? React.createElement('span', { className: 'rr-handoff__note', key: 'o' }, props.toNote)
            : null,
        ]),
        React.createElement(
          'span',
          { className: 'rr-handoff__when', key: 'w' },
          props.toWhen || 'Working on it now',
        ),
      ]),
      carried.length
        ? React.createElement('div', { className: 'rr-handoff__carried', key: 'c' }, [
            React.createElement(
              'span',
              { className: 'rr-handoff__carriedhead', key: 'h' },
              props.carriedLabel || 'What came with it',
            ),
            React.createElement(
              'ul',
              { key: 'u' },
              carried.map((c, i) => React.createElement('li', { key: i }, c)),
            ),
          ])
        : null,
    ],
  );
}

export default AgentHandoff;
