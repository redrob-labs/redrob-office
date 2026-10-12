import * as React from 'react';
import { cx } from '../../internal/cx';
import { icons } from '../../icons';
import { Button } from '../Button/Button';

export interface ApprovalStepProps {
  /** What is being asked for, as a question a person can answer. */
  title?: React.ReactNode;
  /** What will happen if approved. Concretely - which file, which account, what cost. */
  description?: React.ReactNode;
  /** The exact command, diff or payload. */
  detail?: React.ReactNode;
  approveLabel?: React.ReactNode;
  rejectLabel?: React.ReactNode;
  alwaysLabel?: React.ReactNode;
  className?: string;
  onApprove?: () => void;
  onReject?: () => void;
  /** Offers to stop asking for this kind of action. Omit it and every instance is asked. */
  onAlways?: () => void;
}

/**
 * The agent has stopped and is asking before it does something.
 *
 * Approve and Reject are both real buttons of the same size. Reject is not a link, not smaller, and not hidden
 * behind the detail - a person who wants to say no should not have to look for how.
 *
 * `detail` carries the exact thing that will happen, because "run a command" is not a question anybody can
 * answer responsibly. `onAlways` is separate from Approve so that widening permission is always a deliberate
 * second act, never a side effect of saying yes once.
 */
export function ApprovalStep(props: ApprovalStepProps): React.ReactElement {
  return React.createElement(
    'div',
    { className: cx('rr-approval', props.className), role: 'group', 'aria-label': props.title as string },
    [
      React.createElement('div', { className: 'rr-approval__head', key: 'h' }, [
        React.createElement(
          'span',
          { className: 'rr-approval__icon', key: 'i' },
          icons.shield({ width: '100%', height: '100%' }),
        ),
        React.createElement(
          'div',
          { key: 'b', style: { display: 'flex', flexDirection: 'column', gap: '4px' } },
          [
            React.createElement('span', { className: 'rr-approval__title', key: 't' }, props.title),
            props.description
              ? React.createElement('span', { className: 'rr-approval__what', key: 'w' }, props.description)
              : null,
          ],
        ),
      ]),
      props.detail
        ? React.createElement('div', { className: 'rr-approval__detail', key: 'd' }, props.detail)
        : null,
      React.createElement('div', { className: 'rr-approval__actions', key: 'a' }, [
        React.createElement(
          Button,
          { key: 'approve', size: 'sm', onClick: props.onApprove },
          props.approveLabel || 'Approve',
        ),
        React.createElement(
          Button,
          { key: 'reject', size: 'sm', variant: 'secondary', onClick: props.onReject },
          props.rejectLabel || 'Reject',
        ),
        props.onAlways
          ? React.createElement(
              Button,
              { key: 'always', size: 'sm', variant: 'ghost', onClick: props.onAlways },
              props.alwaysLabel || 'Always allow this',
            )
          : null,
      ]),
    ],
  );
}

export default ApprovalStep;
