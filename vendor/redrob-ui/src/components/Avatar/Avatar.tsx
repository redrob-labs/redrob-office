import * as React from 'react';
import { cx } from '../../internal/cx';
import { initials, MARK_FAMILIES } from '../../internal/mark';
import { AvatarMark } from '../AvatarMark/AvatarMark';

export interface AvatarProps {
  /** The person's name. Becomes the image's alt, the title, and the initials fallback. */
  name?: string;
  src?: string;
  size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl';
  shape?: 'circle' | 'square';
  /** Background when there is no picture and no generated mark. */
  color?: string;
  /** `false` forces initials instead of a generated mark. */
  art?: boolean;
  /** Hash input for the generated mark, so it survives a name change. */
  seed?: string | number;
  family?: (typeof MARK_FAMILIES)[number];
  /** A dot on the corner. */
  status?: 'online' | 'away' | 'busy' | 'offline';
  className?: string;
}

/**
 * Stands in for a person: their picture, a generated mark, or their initials.
 *
 * At `xs` and `sm` it always falls back to initials even when a mark is available - the mark needs about 40px
 * to read as a mark rather than a smudge, and a smudge carries less than two letters do.
 *
 * The name is rendered into a visually-hidden span whenever there is no image, so the avatar has an
 * accessible name even though the visible content is two letters or a drawing. A `title` alone would not do
 * it: `title` is a tooltip, not a name.
 */
export function Avatar(props: AvatarProps): React.ReactElement {
  const size = props.size || 'md';

  return React.createElement(
    'span',
    {
      className: cx(
        'rr-avatar',
        `rr-avatar--${size}`,
        props.shape === 'square' && 'rr-avatar--square',
        props.className,
      ),
      style: props.color ? { background: props.color } : null,
      title: props.name,
    },
    [
      props.src
        ? React.createElement('img', {
            className: 'rr-avatar__img',
            src: props.src,
            alt: props.name || '',
            key: 'i',
          })
        : props.art === false
          ? React.createElement(
              'span',
              { key: 'n', 'aria-hidden': props.name ? undefined : 'true' },
              initials(props.name),
            )
          : size === 'xs' || size === 'sm'
            ? React.createElement(
                'span',
                { key: 'n', 'aria-hidden': props.name ? undefined : 'true' },
                initials(props.name),
              )
            : React.createElement(AvatarMark, {
                key: 'n',
                name: props.name,
                seed: props.seed,
                family: props.family,
              }),
      props.status
        ? React.createElement('span', {
            className: `rr-avatar__status rr-avatar__status--${props.status}`,
            key: 's',
          })
        : null,
      props.name && !props.src
        ? React.createElement(
            'span',
            {
              key: 'sr',
              style: { position: 'absolute', width: 1, height: 1, overflow: 'hidden', clip: 'rect(0 0 0 0)' },
            },
            props.name,
          )
        : null,
    ],
  );
}

export default Avatar;
