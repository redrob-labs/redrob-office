import * as React from 'react';
import { cx } from '../../internal/cx';

export interface MarkRevealProps {
  /** The lockup. Used twice: as the image and as the wipe's mask, so it must be a single asset. */
  src?: string;
  /** Accessible name for the whole animation. */
  alt?: string;
  /** `handoff` is the shorter form, for a transition between two surfaces rather than an entrance. */
  mode?: 'intro' | 'handoff';
  size?: 'sm' | 'md' | 'lg';
  /** The symbol alone rather than the full lockup. */
  symbol?: boolean;
  tone?: 'light' | 'dark';
  /** Set `false` to drop the ground behind the lockup, e.g. over an existing band. */
  ground?: boolean;
  /** Reserves vertical space so the surrounding page does not shift when it plays. */
  height?: number | string;
  /** Fires once the wipe finishes, so a splash can hand over to the app. */
  onDone?: () => void;
  className?: string;
}

/**
 * The lockup arriving: light wipes across it on the 40 degree rake.
 *
 * One per surface, at an entrance - a loading screen, the top of a launch page. It is the brand's one
 * piece of performed motion, and a second one on the same page turns an entrance into decoration.
 *
 * `onDone` filters on the animation name because the element runs more than one animation and a
 * plain `onAnimationEnd` would fire on the sheen too, handing over before the wipe finished.
 */
export function MarkReveal(props: MarkRevealProps): React.ReactElement {
  const src = props.src;

  return React.createElement(
    'div',
    {
      className: cx(
        'rr-reveal',
        props.mode === 'handoff' && 'rr-reveal--handoff',
        props.size && props.size !== 'md' && `rr-reveal--${props.size}`,
        props.symbol && 'rr-reveal--symbol',
        props.tone === 'dark' && 'rr-reveal--dark',
        props.className,
      ),
      style: props.height ? { minHeight: props.height } : undefined,
      role: 'img',
      'aria-label': props.alt || 'Redrob',
    },
    [
      props.ground === false
        ? null
        : React.createElement('span', { className: 'rr-reveal__ground', key: 'g', 'aria-hidden': 'true' }),
      React.createElement(
        'span',
        {
          className: 'rr-reveal__lock',
          key: 'l',
          style: { '--rr-reveal-mask': `url(${src})` } as React.CSSProperties,
        },
        [
          React.createElement('img', {
            className: 'rr-reveal__art',
            key: 'a',
            src,
            alt: '',
            onAnimationEnd: (event: React.AnimationEvent<HTMLImageElement>) => {
              if (props.onDone && event.animationName && event.animationName.indexOf('wipe') !== -1) {
                props.onDone();
              }
            },
          }),
          React.createElement('span', { className: 'rr-reveal__sheen', key: 's', 'aria-hidden': 'true' }),
        ],
      ),
    ],
  );
}

export default MarkReveal;
