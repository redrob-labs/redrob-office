import * as React from 'react';
import { cx } from '../../internal/cx';
import {
  CROSS_CHECK_DEFAULT,
  CROSS_CHECK_LEVELS,
  CROSS_CHECKS,
  CrossCheckDefinition,
  CrossCheckValue,
  crossCheckValue,
} from '../../internal/safeguards';
export type { CrossCheckDefinition, CrossCheckLevel, CrossCheckValue } from '../../internal/safeguards';
export interface CrossCheckSettingProps {
  value?: CrossCheckValue;
  defaultValue?: CrossCheckValue;
  onChange?: (value: CrossCheckValue, changed: string) => void;
  checks?: CrossCheckDefinition[];
  levels?: Array<{ value: string; label: string }>;
  title?: React.ReactNode;
  lede?: React.ReactNode;
  /** What When it matters means, under the checks. */
  whenItMatters?: React.ReactNode;
  foot?: React.ReactNode;
  className?: string;
}
/**
 * The panel behind Cross-check in the status line: two checks, Fact check and Challenge, each Off, When it
 * matters or Always.
 *
 * Each check says what it does and how long it takes, and "When it matters" is defined in a sentence under
 * them: answers a person will rely on or pass on, never quick questions or drafts. A safeguard whose trigger is
 * vague gets switched off the first time it fires on something trivial.
 *
 * The checkers are named in every result, so the setting never has to promise more than it does.
 * `CrossCheckSetting.value(checks)` gives the status line's word for a value: the shared level, "On",
 * "1 of 2 on" or "Off".
 */
export function CrossCheckSetting(props: CrossCheckSettingProps): React.ReactElement {
  const checks = props.checks || CROSS_CHECKS;
  const levels = props.levels || CROSS_CHECK_LEVELS;
  const [held, setHeld] = React.useState<CrossCheckValue>(props.defaultValue || CROSS_CHECK_DEFAULT);
  const value = props.value !== undefined ? props.value : held;
  function set(id: string, v: string): void {
    const next: CrossCheckValue = { ...value, [id]: v };
    if (props.value === undefined) setHeld(next);
    if (props.onChange) props.onChange(next, id);
  }
  return React.createElement('div', { className: cx('rr-xcheck', props.className) }, [
    props.title ? React.createElement('p', { key: 'h', className: 'rr-xcheck__title' }, props.title) : null,
    React.createElement(
      'p',
      { key: 'l', className: 'rr-panellede' },
      props.lede || 'After Cowork answers, AIs from other companies check its work. Every check says who ran it.',
    ),
    checks.map((c) => {
      const cur = value[c.id] || 'off';
      return React.createElement(
        'div',
        { key: c.id, className: 'rr-xcheck__row', role: 'group', 'aria-labelledby': `rr-xc-${c.id}` },
        [
          React.createElement('p', { key: 'n', id: `rr-xc-${c.id}`, className: 'rr-xcheck__name' }, c.name),
          React.createElement('p', { key: 't', className: 'rr-xcheck__text' }, c.text),
          React.createElement(
            'div',
            {
              key: 's',
              className: 'rr-seg',
              role: 'radiogroup',
              'aria-label': typeof c.name === 'string' ? c.name : undefined,
            },
            levels.map((l) =>
              React.createElement(
                'button',
                {
                  key: l.value,
                  type: 'button',
                  role: 'radio',
                  'aria-checked': String(cur === l.value),
                  onClick: () => set(c.id, l.value),
                },
                l.label,
              ),
            ),
          ),
        ],
      );
    }),
    React.createElement(
      'p',
      { key: 'm', className: 'rr-xcheck__note' },
      props.whenItMatters ||
        'When it matters means answers you will rely on or pass on: a decision, a number, a claim about a rule or a fact, or anything you will send to someone. Quick questions, drafts and brainstorming are left alone. The checkers are the next best AIs for the task, from other companies than the one that answered.',
    ),
    props.foot ? React.createElement('div', { key: 'f', className: 'rr-panelfoot' }, props.foot) : null,
  ]);
}
/** What the status line says for a value: the shared level, "On", "1 of 2 on" or "Off". */
CrossCheckSetting.value = crossCheckValue;
export default CrossCheckSetting;
