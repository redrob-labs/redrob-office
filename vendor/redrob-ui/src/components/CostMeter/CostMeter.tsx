import * as React from 'react';
import { cx } from '../../internal/cx';

export interface CostBreakdown {
  label?: string;
  value: number;
}

export interface CostMeterProps {
  used?: number;
  budget?: number;
  label?: React.ReactNode;
  unit?: string;
  /** `false` hides the budget, for a spend with no ceiling. */
  showBudget?: boolean;
  /** Overrides the derived tone. Otherwise 75% is warning and 90% is danger. */
  tone?: 'default' | 'warning' | 'danger';
  /** Where it went. */
  breakdown?: CostBreakdown[];
  format?: (v: number) => string;
  className?: string;
}

/**
 * @deprecated Use Meter (without `segments`). Kept for 1.x.
 *
 * What a run has spent against what it was allowed.
 *
 * The tone escalates at 75% and 90% on its own, so a budget approaching its limit changes appearance without
 * anybody remembering to set a flag. That is the whole value: a meter that only goes red when told will be green
 * on the run that overspends.
 *
 * `breakdown` matters because a total nobody can decompose is a number nobody can act on - the question after
 * "we spent this much" is always "on what".
 */
export function CostMeter(props: CostMeterProps): React.ReactElement {
  const used = Number(props.used) || 0;
  const budget = Number(props.budget) || 0;
  const pct = budget > 0 ? Math.min(100, (used / budget) * 100) : 0;
  const tone = props.tone || (pct >= 90 ? 'danger' : pct >= 75 ? 'warning' : 'default');
  const fmt = props.format || ((v: number) => v.toLocaleString());

  return React.createElement(
    'div',
    {
      className: cx('rr-meter', tone !== 'default' && `rr-meter--${tone}`, props.className),
      role: 'group',
      'aria-label': (props.label as string) || 'Spend',
    },
    [
      React.createElement('div', { className: 'rr-meter__head', key: 'h' }, [
        React.createElement('span', { className: 'rr-meter__value', key: 'v' }, [
          fmt(used),
          budget && props.showBudget !== false
            ? React.createElement(
                'span',
                { className: 'rr-meter__of', key: 'o' },
                ` of ${fmt(budget)}${props.unit ? ` ${props.unit}` : ''}`,
              )
            : null,
        ]),
        React.createElement('span', { className: 'rr-meter__label', key: 'l' }, props.label),
      ]),
      React.createElement(
        'div',
        {
          className: 'rr-meter__track',
          key: 't',
          role: 'progressbar',
          'aria-valuenow': Math.round(pct),
          'aria-valuemin': 0,
          'aria-valuemax': 100,
        },
        React.createElement('span', { className: 'rr-meter__fill', style: { width: `${pct}%` } }),
      ),
      props.breakdown && props.breakdown.length
        ? React.createElement(
            'div',
            { className: 'rr-meter__legend', key: 'g' },
            props.breakdown.map((b, i) =>
              React.createElement('span', { key: i }, [
                `${b.label} `,
                React.createElement('b', { key: 'v' }, fmt(b.value)),
              ]),
            ),
          )
        : null,
    ],
  );
}

export default CostMeter;
