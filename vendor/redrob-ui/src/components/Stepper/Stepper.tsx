import * as React from 'react';
import { cx } from '../../internal/cx';
import { icons } from '../../icons';

export interface StepperStep {
  id?: string;
  label?: React.ReactNode;
  /** What this step involves. One short line. */
  description?: React.ReactNode;
}

export interface StepperProps {
  steps?: StepperStep[];
  /** Zero-based index of the step in progress. Everything before it reads as done. */
  current?: number;
  orientation?: 'horizontal' | 'vertical';
  label?: string;
  className?: string;
}

/**
 * Where somebody is in a process that has an order.
 *
 * Steps, not views: use `Tabs` when the sections can be visited in any order. The state of each step is
 * derived from `current` alone, so there is no way to render a step both done and in progress.
 *
 * The done marker is a check rather than a colour change, and the step in progress carries
 * `aria-current="step"`, so the position survives without colour.
 */
export function Stepper(props: StepperProps): React.ReactElement {
  const steps = props.steps || [];
  const current = props.current || 0;

  return React.createElement(
    'nav',
    {
      className: cx(
        'rr-stepper',
        props.orientation === 'vertical' && 'rr-stepper--vertical',
        props.className,
      ),
      'aria-label': props.label || 'Progress',
    },
    React.createElement(
      'ol',
      { className: 'rr-stepper__list' },
      steps.map((step, i) => {
        const state = i < current ? 'done' : i === current ? 'current' : 'todo';
        return React.createElement(
          'li',
          {
            key: step.id || i,
            className: `rr-stepper__step rr-stepper__step--${state}`,
            'aria-current': state === 'current' ? 'step' : undefined,
          },
          [
            React.createElement(
              'span',
              { className: 'rr-stepper__marker', key: 'm' },
              state === 'done' ? icons.check({ width: 14, height: 14 }) : i + 1,
            ),
            React.createElement('span', { className: 'rr-stepper__text', key: 't' }, [
              React.createElement('span', { className: 'rr-stepper__label', key: 'l' }, step.label),
              step.description
                ? React.createElement('span', { className: 'rr-stepper__desc', key: 'd' }, step.description)
                : null,
            ]),
            i < steps.length - 1
              ? React.createElement('span', { className: 'rr-stepper__line', key: 'r', 'aria-hidden': 'true' })
              : null,
          ],
        );
      }),
    ),
  );
}

export default Stepper;
