import * as React from 'react';
import { cx } from '../../internal/cx';

export interface MarkProps {
  /** The light-theme lockup. */
  src?: string;
  /** The dark-theme lockup. Omit it and the light one is used on both grounds. */
  darkSrc?: string;
  /** Height in pixels. Width follows. The only size control: the lockup is never stretched. */
  height?: number;
  /** Accessible name. Pass `''` when a heading beside it already says "Redrob". */
  alt?: string;
  /**
   * Forces a ground rather than following `data-theme`. For a panel whose ground does not follow the
   * page: a dark band on a light page, a light card on a dark one.
   */
  tone?: 'light' | 'dark';
  className?: string;
}

/**
 * The Redrob lockup, sized by height and swapped by theme.
 *
 * Both lockups are in the DOM and the stylesheet shows one, which is why the height is set inline:
 * an inline `display` here would beat the stylesheet's `display: none` and render both at once. That
 * is how this first shipped, so the sizing stays confined to `height` and `width`.
 */
export function Mark(props: MarkProps): React.ReactElement {
  const px = props.height || 22;
  const box: React.CSSProperties = { height: `${px}px`, width: 'auto' };

  return React.createElement(
    'span',
    {
      className: cx('rr-mark', props.className),
      'data-tone': props.tone === 'light' || props.tone === 'dark' ? props.tone : undefined,
    },
    [
      React.createElement('img', {
        key: 'l',
        className: 'rr-mark__light',
        src: props.src,
        alt: props.alt == null ? 'Redrob' : props.alt,
        style: box,
      }),
      props.darkSrc
        ? React.createElement('img', {
            key: 'd',
            className: 'rr-mark__dark',
            src: props.darkSrc,
            alt: '',
            'aria-hidden': 'true',
            style: box,
          })
        : null,
    ],
  );
}

export default Mark;
