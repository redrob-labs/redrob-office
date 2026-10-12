import * as React from 'react';
import { cx } from '../../internal/cx';
import { initials } from '../../internal/mark';

export interface MessageProps {
  role?: 'user' | 'assistant' | 'system';
  /** Who said it. Defaults to "You" or "Redrob" by role. */
  author?: string;
  /** Overrides the derived initials in the corner mark. */
  mark?: React.ReactNode;
  /** Receipts, citations, confidence - what is known about this answer. */
  footer?: React.ReactNode;
  className?: string;
  children?: React.ReactNode;
}

/**
 * One turn in a conversation.
 *
 * The author is a real element rather than a colour or an alignment, so who said what survives for a reader
 * who cannot see the layout. Alignment alone is how a transcript becomes unattributable.
 *
 * Everything known about an answer goes in `footer` - the receipt, the citations, the confidence. It sits
 * after the content because a reader wants the answer first and the provenance second.
 */
export function Message(props: MessageProps): React.ReactElement {
  const role = props.role || 'assistant';
  const author = props.author || (role === 'user' ? 'You' : 'Redrob');

  return React.createElement('div', { className: cx('rr-msg', `rr-msg--${role}`, props.className) }, [
    React.createElement(
      'span',
      { className: 'rr-msg__mark', key: 'm', 'aria-hidden': 'true' },
      props.mark || initials(author),
    ),
    React.createElement('div', { className: 'rr-msg__body', key: 'b' }, [
      React.createElement('span', { className: 'rr-msg__author', key: 'a' }, author),
      React.createElement(
        'div',
        { className: 'rr-msg__bubble', key: 'c' },
        React.createElement('div', { className: 'rr-msg__content' }, props.children),
      ),
      props.footer ? React.createElement('div', { className: 'rr-msg__footer', key: 'f' }, props.footer) : null,
    ]),
  ]);
}

export default Message;
