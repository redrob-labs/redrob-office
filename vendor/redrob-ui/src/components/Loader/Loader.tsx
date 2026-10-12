import * as React from 'react';
import { cx } from '../../internal/cx';

export interface LoaderProps {
  /** What is loading. Announced even when not shown. */
  label?: string;
  /** Print the label beside the bars. */
  showLabel?: boolean;
  size?: 'sm' | 'md' | 'lg';
  tone?: 'brand' | 'neutral' | 'inverse';
  /** `false` stops it announcing. For several loaders on one screen. */
  live?: boolean;
  className?: string;
}

/**
 * Something is happening and the share is unknown.
 *
 * When there is an honest number, use `Progress`. A spinner that could have been a percentage wastes the
 * one thing the person wants to know.
 *
 * The label is always in the DOM - visible with `showLabel`, otherwise screen-reader only. A silent spinner
 * is a page that looks broken to anyone who cannot see it move. `live={false}` exists for a screen with
 * several loaders, where every one announcing itself turns into noise.
 */
export function Loader(props: LoaderProps): React.ReactElement {
  const label = props.label || 'Loading';

  return React.createElement(
    'div',
    {
      className: cx(
        'rr-loader',
        props.size && `rr-loader--${props.size}`,
        props.tone && props.tone !== 'brand' && `rr-loader--${props.tone}`,
        props.className,
      ),
      role: 'status',
      'aria-live': props.live === false ? undefined : 'polite',
    },
    [
      React.createElement('span', { className: 'rr-loader__bars', key: 'b', 'aria-hidden': 'true' }, [
        React.createElement('span', { className: 'rr-loader__bar', key: 1 }),
        React.createElement('span', { className: 'rr-loader__bar', key: 2 }),
        React.createElement('span', { className: 'rr-loader__bar', key: 3 }),
      ]),
      props.showLabel
        ? React.createElement('span', { className: 'rr-loader__label', key: 'l' }, label)
        : React.createElement('span', { className: 'rr-loader__sr', key: 'l' }, label),
    ],
  );
}

export default Loader;
