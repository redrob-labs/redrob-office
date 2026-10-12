import * as React from 'react';
import { cx } from '../../internal/cx';
import { Button } from '../Button/Button';
import { Loader } from '../Loader/Loader';

export interface CheckInOption {
  label?: React.ReactNode;
}

export interface CheckInProps {
  mark?: React.ReactNode;
  /** What the agent needs decided, as a question. */
  question?: React.ReactNode;
  /** What it has found so far, so the question can be answered without reading the whole run. */
  context?: React.ReactNode;
  options?: Array<CheckInOption | string>;
  /** When it asked. Used to say nothing runs until it is answered. */
  askedAt?: string;
  className?: string;
  onAnswer?: (option: CheckInOption | string) => void;
}

/**
 * The agent has stopped and needs an answer before it goes on.
 *
 * "Nothing runs until you answer" is printed, not implied. The distinction between an agent that is waiting and one
 * that is working is the thing a person most needs to know, and it is invisible unless the interface says it.
 *
 * `context` exists so the question can be answered on its own. Without it the reader has to reconstruct the run to
 * work out what they are deciding.
 */
export function CheckIn(props: CheckInProps): React.ReactElement {
  const opts = props.options || [];

  return React.createElement(
    'div',
    { className: cx('rr-checkin', props.className), role: 'group', 'aria-label': 'The agent needs an answer' },
    [
      React.createElement('div', { className: 'rr-checkin__mark', key: 'm' }, [
        React.createElement('span', { className: 'rr-tick', key: 't', 'aria-hidden': 'true' }),
        React.createElement('span', { key: 'l' }, props.mark || 'Waiting on you'),
      ]),
      React.createElement('p', { className: 'rr-checkin__q', key: 'q' }, props.question),
      props.context
        ? React.createElement('p', { className: 'rr-checkin__ctx', key: 'c' }, props.context)
        : null,
      opts.length
        ? React.createElement(
            'div',
            { className: 'rr-checkin__opts', key: 'o' },
            opts.map((o, i) =>
              React.createElement(
                Button,
                {
                  key: i,
                  size: 'sm',
                  variant: i === 0 ? 'primary' : 'secondary',
                  onClick: () => {
                    if (props.onAnswer) props.onAnswer(o);
                  },
                },
                (o as CheckInOption).label || (o as React.ReactNode),
              ),
            ),
          )
        : null,
      props.askedAt
        ? React.createElement('div', { className: 'rr-checkin__wait', key: 'w' }, [
            React.createElement(Loader, { key: 'd', size: 'sm', label: 'Waiting' }),
            React.createElement(
              'span',
              { key: 's' },
              `Asked ${props.askedAt}. Nothing runs until you answer.`,
            ),
          ])
        : null,
    ],
  );
}

export default CheckIn;
