import * as React from 'react';
import { cx } from '../../internal/cx';
import { pct, at } from '../../internal/insight';

export interface CompareBarProps {
  label: React.ReactNode;
  value?: number | null;
  /** The figure to compare against, drawn as a tick on the same track. */
  compare?: number | null;
  /** "Company" by default; printed before the comparison figure. */
  compareLabel?: string;
  max?: number;
  format?: (v: number | null | undefined) => string;
  className?: string;
}

/**
 * One measure for one group against a wider one: a team's figure as a bar, the company's as a tick, both
 * printed beside it. Stack several for "Against the company".
 */
export function CompareBar(props: CompareBarProps): React.ReactElement {
  const max = props.max != null ? props.max : 100;
  const fmt = props.format || pct;
  const compareLabel = props.compareLabel || 'Company';
  return React.createElement('div', { className: cx('rr-comparebar', props.className) }, [
    React.createElement('span', { key: 'l', className: 'rr-comparebar__label' }, props.label),
    React.createElement('span', { key: 't', className: 'rr-comparebar__track', 'aria-hidden': 'true' }, [
      props.value != null
        ? React.createElement('span', { key: 'v', className: 'rr-comparebar__bar', style: { width: at(props.value, max) } })
        : null,
      props.compare != null
        ? React.createElement('span', { key: 'c', className: 'rr-comparebar__tick', style: { left: at(props.compare, max) } })
        : null,
    ]),
    React.createElement('b', { key: 'v', className: 'rr-comparebar__value' }, fmt(props.value)),
    React.createElement('span', { key: 'c', className: 'rr-comparebar__compare' }, `${compareLabel} ${fmt(props.compare)}`),
  ]);
}

export default CompareBar;
