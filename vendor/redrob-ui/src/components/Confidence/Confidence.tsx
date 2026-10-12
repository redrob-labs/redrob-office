import * as React from 'react';
import { cx } from '../../internal/cx';

const CONF_LEVELS: Record<string, number> = { low: 1, medium: 2, high: 3 };

export interface ConfidenceProps {
  level?: 'low' | 'medium' | 'high';
  /** Used exactly as written - it may be Korean. Only the default is composed in English. */
  label?: React.ReactNode;
  /** Why it is this confident. */
  note?: React.ReactNode;
  className?: string;
}

/**
 * How sure an answer is, in words and in three bars.
 *
 * The words carry it; the bars are `aria-hidden` decoration. Three bars alone would be a percentage without
 * the honesty of one - a reader cannot tell 2/3 from "probably" unless it is written.
 *
 * `label` is used verbatim when passed, because the composed default is English and this ships in three
 * languages.
 */
export function Confidence(props: ConfidenceProps): React.ReactElement {
  const level = props.level || 'medium';
  const filled = CONF_LEVELS[level] || 2;
  const bars: React.ReactNode[] = [];
  for (let i = 0; i < 3; i++) {
    bars.push(
      React.createElement('span', {
        key: i,
        className: cx('rr-confidence__bar', i < filled && 'rr-confidence__bar--on'),
      }),
    );
  }

  return React.createElement('span', { className: cx('rr-confidence', `rr-confidence--${level}`, props.className) }, [
    React.createElement('span', { className: 'rr-confidence__bars', key: 'b', 'aria-hidden': 'true' }, bars),
    React.createElement(
      'span',
      { className: 'rr-confidence__label', key: 'l' },
      props.label || `${level} confidence`,
    ),
    props.note ? React.createElement('span', { className: 'rr-confidence__note', key: 'n' }, props.note) : null,
  ]);
}

export default Confidence;
