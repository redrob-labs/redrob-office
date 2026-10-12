import * as React from 'react';
import { cx } from './cx';

export interface StatusBarsProps {
  n?: number;
  of?: number;
  tone?: string;
  className?: string;
}

/**
 * `n` of `of` filled bars: a level at a glance, beside the words that carry it.
 *
 * Always `aria-hidden`. The bars are a second reading of something already written - a level shown only as
 * bars is a number nobody can read out.
 */
export function StatusBars(props: StatusBarsProps): React.ReactElement {
  const n = props.n || 0;
  const of = props.of || 3;
  const bars: React.ReactNode[] = [];
  for (let i = 0; i < of; i++) bars.push(React.createElement('i', { key: i, 'data-on': String(i < n) }));
  return React.createElement(
    'span',
    {
      className: cx('rr-bars', props.tone && `rr-bars--${props.tone}`, props.className),
      'aria-hidden': 'true',
    },
    bars,
  );
}
