import * as React from 'react';
import { cx } from '../../internal/cx';
import { omit } from '../../internal/omit';

export interface IconButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  /** What the button does, in words. Required: an icon is not an accessible name. */
  label: string;
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger';
  size?: 'sm' | 'md' | 'lg';
  /** Circular rather than rounded-square. For avatars and floating controls. */
  round?: boolean;
  /** The glyph. One icon, nothing else. */
  children?: React.ReactNode;
}

/**
 * A button whose whole label is an icon: close, more, copy, expand.
 *
 * `label` is not optional and is not decoration. It becomes both `aria-label` and `title`, so the
 * control has a name for a screen reader and a tooltip for a sighted user who cannot read the glyph.
 * An icon button with no name is a button nobody can describe.
 *
 * Defaults to `ghost`, because these sit in dense rows where four framed buttons read as a wall.
 */
export function IconButton(props: IconButtonProps): React.ReactElement {
  const variant = props.variant || 'ghost';
  const size = props.size || 'md';
  const rest = omit(props, ['variant', 'size', 'round', 'label', 'className', 'children']);

  return React.createElement(
    'button',
    {
      type: props.type || 'button',
      'aria-label': props.label,
      title: props.label,
      className: cx(
        'rr-iconbtn',
        `rr-iconbtn--${variant}`,
        `rr-iconbtn--${size}`,
        props.round && 'rr-iconbtn--round',
        props.className,
      ),
      ...rest,
    },
    React.createElement(
      'span',
      { className: 'rr-btn__icon', style: { fontSize: size === 'sm' ? '14px' : '18px' } },
      props.children,
    ),
  );
}

export default IconButton;
