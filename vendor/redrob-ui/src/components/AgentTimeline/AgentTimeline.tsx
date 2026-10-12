import * as React from 'react';
import { cx } from '../../internal/cx';

export interface AgentTimelineStep {
  id?: string | number;
  label?: React.ReactNode;
  /** A time or a count, beside the label. */
  meta?: React.ReactNode;
  /** One line more about this step. */
  detail?: React.ReactNode;
  state?: 'done' | 'active' | 'todo' | 'error';
  children?: React.ReactNode;
}

export interface AgentTimelineProps {
  steps?: AgentTimelineStep[];
  label?: string;
  className?: string;
}

/**
 * What the agent is doing, in order, as it happens.
 *
 * An ordered list, so the sequence survives with the stylesheet off and is announced as a sequence. The step in
 * progress carries `aria-current="step"`, which is what tells a screen reader where the run has got to rather
 * than leaving it to the dot's colour.
 */
export function AgentTimeline(props: AgentTimelineProps): React.ReactElement {
  const steps = props.steps || [];

  return React.createElement(
    'div',
    { className: cx('rr-timeline', props.className) },
    React.createElement(
      'ol',
      { className: 'rr-timeline__list', 'aria-label': props.label || 'Agent steps' },
      steps.map((step, i) => {
        const state = step.state || 'todo';
        return React.createElement(
          'li',
          {
            key: step.id || i,
            className: `rr-timeline__step rr-timeline__step--${state}`,
            'aria-current': state === 'active' ? 'step' : undefined,
          },
          [
            React.createElement('span', { className: 'rr-timeline__rail', key: 'r', 'aria-hidden': 'true' }, [
              React.createElement('span', { className: 'rr-timeline__dot', key: 'd' }),
              i < steps.length - 1
                ? React.createElement('span', { className: 'rr-timeline__line', key: 'l' })
                : null,
            ]),
            React.createElement('div', { className: 'rr-timeline__body', key: 'b' }, [
              React.createElement('span', { className: 'rr-timeline__label', key: 'l' }, [
                step.label,
                step.meta
                  ? React.createElement(
                      'span',
                      {
                        className: 'rr-timeline__meta',
                        key: 'm',
                        style: { marginLeft: '8px', fontWeight: 400 },
                      },
                      step.meta,
                    )
                  : null,
              ]),
              step.detail
                ? React.createElement('span', { className: 'rr-timeline__detail', key: 'd' }, step.detail)
                : null,
              step.children
                ? React.createElement('div', { key: 'c', style: { marginTop: '4px' } }, step.children)
                : null,
            ]),
          ],
        );
      }),
    ),
  );
}

export default AgentTimeline;
