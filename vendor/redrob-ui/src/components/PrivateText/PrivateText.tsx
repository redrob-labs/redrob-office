import * as React from 'react';
import { cx } from '../../internal/cx';

export interface PrivateTextProps {
  /** What the model saw in place of this text, e.g. `[a name]`. */
  as?: string;
  /** This text was removed entirely rather than replaced. */
  out?: boolean;
  outLabel?: string;
  className?: string;
  children?: React.ReactNode;
}

/**
 * Text the person wrote that the model did not see, shown as what they wrote.
 *
 * The reader sees their own words; the substitution is stated, not implied. A product that silently redacted
 * would be asking for trust it has not shown, and one that showed only the placeholder would make the person
 * re-read their own sentence to work out what was taken.
 *
 * `tabIndex={0}` and a visually-hidden sentence, because the explanation is in a `title` and a title is
 * unreachable by keyboard and unread by most screen readers.
 */
export function PrivateText(props: PrivateTextProps): React.ReactElement {
  const said = props.out
    ? props.outLabel || 'Left out. It was never sent.'
    : `Kept private. The AI saw "${props.as}".`;

  return React.createElement(
    'span',
    {
      className: cx('rr-private', props.out && 'rr-private--out', props.className),
      tabIndex: 0,
      title: said,
    },
    [
      props.children,
      React.createElement('span', { key: 'h', className: 'rr-visually-hidden' }, ` (${said})`),
    ],
  );
}

export default PrivateText;
