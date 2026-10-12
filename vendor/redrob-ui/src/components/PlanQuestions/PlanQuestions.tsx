import * as React from 'react';
import { cx } from '../../internal/cx';
import { icons } from '../../icons';
import { Button } from '../Button/Button';
export interface PlanQuestion {
  id: string;
  question: React.ReactNode;
  options: React.ReactNode[];
  /** Several answers allowed. */
  multi?: boolean;
  /** An option index, or indexes when multi. */
  defaultValue?: number | number[];
}
/** The answers so far, by question id: an option index, indexes when multi, or null when unanswered. */
export type PlanAnswers = Record<string, number | number[] | null>;
export interface PlanQuestionsProps {
  questions: PlanQuestion[];
  value?: PlanAnswers;
  defaultValue?: PlanAnswers;
  onChange?: (value: PlanAnswers) => void;
  onSubmit?: (value: PlanAnswers) => void;
  /** Folds to one line once answered. */
  done?: boolean;
  summary?: React.ReactNode;
  submitLabel?: string;
  hint?: React.ReactNode;
  anyLabel?: string;
  label?: string;
  className?: string;
}
/**
 * What Plan asks before it writes: a few questions, each answered with a tap or in your own words.
 *
 * The options are buttons with `aria-pressed`, so a single tap answers, and the hint beside the submit button
 * says a reply in the person's own words works too - the options are a shortcut, never a form to complete.
 * Once answered it folds to a single line, so the thread reads as a conversation rather than a stack of forms.
 */
export function PlanQuestions(props: PlanQuestionsProps): React.ReactElement {
  const qs = props.questions || [];
  const init: PlanAnswers = {};
  qs.forEach((q) => {
    init[q.id] = q.defaultValue !== undefined ? q.defaultValue : q.multi ? [] : null;
  });
  const [held, setHeld] = React.useState<PlanAnswers>(props.defaultValue || init);
  const a = props.value !== undefined ? props.value : held;
  function on(q: PlanQuestion, i: number): boolean {
    const v = a[q.id];
    if (q.multi) return Array.isArray(v) && v.indexOf(i) >= 0;
    return v === i;
  }
  function pick(q: PlanQuestion, i: number): void {
    const next: PlanAnswers = { ...a };
    if (q.multi) {
      const prev = a[q.id];
      const v = Array.isArray(prev) ? prev.slice() : [];
      const at = v.indexOf(i);
      if (at >= 0) v.splice(at, 1);
      else v.push(i);
      next[q.id] = v;
    } else next[q.id] = i;
    if (props.value === undefined) setHeld(next);
    if (props.onChange) props.onChange(next);
  }
  if (props.done) {
    return React.createElement('p', { className: cx('rr-planq rr-planq--done', props.className) }, [
      React.createElement(
        'span',
        { key: 'i', className: 'rr-planq__tick', 'aria-hidden': 'true' },
        icons.check({ width: 14, height: 14 }),
      ),
      React.createElement('span', { key: 't' }, props.summary || 'Answered.'),
    ]);
  }
  return React.createElement(
    'div',
    {
      className: cx('rr-planq', props.className),
      role: 'group',
      'aria-label': props.label || 'Questions before the plan',
    },
    [
      React.createElement(
        'ol',
        { key: 'l', className: 'rr-planq__list' },
        qs.map((q) =>
          React.createElement('li', { key: q.id, className: 'rr-planq__q' }, [
            React.createElement('p', { key: 'p', className: 'rr-planq__ask' }, [
              q.question,
              q.multi
                ? React.createElement('span', { key: 'm', className: 'rr-planq__any' }, ` ${props.anyLabel || 'Choose any'}`)
                : null,
            ]),
            React.createElement(
              'div',
              { key: 'c', className: 'rr-planq__opts' },
              (q.options || []).map((o, i) => {
                const sel = on(q, i);
                return React.createElement(
                  'button',
                  {
                    key: i,
                    type: 'button',
                    className: 'rr-planq__opt',
                    'aria-pressed': String(sel),
                    onClick: () => pick(q, i),
                  },
                  [
                    sel
                      ? React.createElement(
                          React.Fragment,
                          { key: 'i' },
                          icons.check({ width: 13, height: 13, 'aria-hidden': 'true' }),
                        )
                      : null,
                    React.createElement('span', { key: 't' }, o),
                  ],
                );
              }),
            ),
          ]),
        ),
      ),
      React.createElement('div', { key: 'a', className: 'rr-planq__act' }, [
        React.createElement(
          Button,
          {
            key: 'b',
            variant: 'primary',
            onClick: () => {
              if (props.onSubmit) props.onSubmit(a);
            },
          },
          props.submitLabel || 'Write the plan',
        ),
        React.createElement('span', { key: 's', className: 'rr-planq__hint' }, props.hint || 'or reply in your own words'),
      ]),
    ],
  );
}
export default PlanQuestions;
