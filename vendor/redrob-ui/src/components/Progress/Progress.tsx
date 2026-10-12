import * as React from 'react';
import { cx } from '../../internal/cx';

export interface ProgressProps {
  value?: number;
  max?: number;
  /** Names what is progressing. Also becomes the accessible name. */
  label?: React.ReactNode;
  /** Accessible name when there is no visible label. */
  ariaLabel?: string;
  /** Print the percentage beside the label. */
  showValue?: boolean;
  /** Something is happening but the share is unknown. Drops the value attributes. */
  indeterminate?: boolean;
  tone?: 'brand' | 'success' | 'warning' | 'danger';
  size?: 'sm' | 'md';
  className?: string;
}

/**
 * How far along something measurable is.
 *
 * Measurable is the condition: use `Loader` when the share is unknown and there is no honest number to
 * show. An indeterminate Progress says "I am working"; a Progress bar stuck at 90% says something untrue.
 *
 * The value is clamped into range rather than trusted, so a bad number from upstream cannot draw a bar past
 * its track. When indeterminate, the value attributes are omitted entirely - a `progressbar` carrying
 * `aria-valuenow="0"` tells a screen reader nothing is happening.
 */
export function Progress(props: ProgressProps): React.ReactElement {
  const max = props.max || 100;
  const value = Math.max(0, Math.min(props.value != null ? props.value : 0, max));
  const pct = Math.round((value / max) * 100);
  const indeterminate = !!props.indeterminate;

  return React.createElement(
    'div',
    {
      className: cx(
        'rr-progress',
        props.tone && `rr-progress--${props.tone}`,
        props.size === 'sm' && 'rr-progress--sm',
        indeterminate && 'rr-progress--indeterminate',
        props.className,
      ),
    },
    [
      props.label || props.showValue
        ? React.createElement('div', { className: 'rr-progress__head', key: 'h' }, [
            React.createElement('span', { className: 'rr-progress__label', key: 'l' }, props.label),
            props.showValue && !indeterminate
              ? React.createElement('span', { className: 'rr-progress__value', key: 'v' }, `${pct}%`)
              : null,
          ])
        : null,
      React.createElement(
        'div',
        {
          className: 'rr-progress__track',
          key: 't',
          role: 'progressbar',
          'aria-valuemin': indeterminate ? undefined : 0,
          'aria-valuemax': indeterminate ? undefined : max,
          'aria-valuenow': indeterminate ? undefined : value,
          'aria-label': props.label || props.ariaLabel,
        },
        React.createElement('div', {
          className: 'rr-progress__bar',
          style: { width: indeterminate ? undefined : `${pct}%` },
        }),
      ),
    ],
  );
}

export default Progress;
