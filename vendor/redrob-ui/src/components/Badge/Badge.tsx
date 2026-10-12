import * as React from 'react';
import { cx } from '../../internal/cx';

export interface BadgeProps {
  tone?: 'neutral' | 'brand' | 'info' | 'success' | 'warning' | 'danger';
  /** `subtle` for a tint, `solid` for a filled chip, `outline` for a hairline. */
  variant?: 'subtle' | 'solid' | 'outline';
  size?: 'sm' | 'md';
  /** A leading dot, for a status where the word alone reads flat. */
  dot?: boolean;
  className?: string;
  children?: React.ReactNode;
}

/**
 * A short piece of state on something else: a status, a count, a label.
 *
 * Not a button and not a filter. It never carries an action, so if it needs to be clicked it is the wrong
 * component.
 *
 * The state is always a word, never only a colour or only the dot. A red dot on its own is invisible to
 * anyone who cannot distinguish it from the green one.
 */
export function Badge(props: BadgeProps): React.ReactElement {
  const tone = props.tone || 'neutral';
  const variant = props.variant || 'subtle';
  const size = props.size || 'md';

  return React.createElement(
    'span',
    {
      className: cx(
        'rr-badge',
        `rr-badge--${variant}`,
        `rr-badge--${tone}`,
        `rr-badge--${size}`,
        props.className,
      ),
    },
    [
      props.dot ? React.createElement('span', { className: 'rr-badge__dot', key: 'd' }) : null,
      React.createElement('span', { key: 'l' }, props.children),
    ],
  );
}

export default Badge;
