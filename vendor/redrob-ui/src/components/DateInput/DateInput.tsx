import * as React from 'react';
import { cx } from '../../internal/cx';
import { useStableId } from '../../internal/ids';
import { docLocale } from '../../internal/datetime';
import { dateParts } from '../../internal/borders';

export interface DateInputValue {
  day?: string;
  month?: string;
  year?: string;
  /** Filled in for you when the three parts make a real date, otherwise null. */
  iso?: string | null;
}

export interface DateInputProps {
  id?: string;
  label?: React.ReactNode;
  hint?: React.ReactNode;
  error?: React.ReactNode;
  required?: boolean;
  /** Field order. `dmy`, `mdy`, `ymd` - whatever the reader writes. */
  order?: string;
  locale?: string;
  /** Turns on birthday autofill on the three parts. */
  birthday?: boolean;
  value?: DateInputValue;
  dayLabel?: React.ReactNode;
  monthLabel?: React.ReactNode;
  yearLabel?: React.ReactNode;
  className?: string;
  onChange?: (value: DateInputValue, key: 'day' | 'month' | 'year') => void;
}

/**
 * A date typed as three parts: day, month, year.
 *
 * Split from `DatePicker` on purpose. For a date of birth, an expiry or anything far from today, a
 * calendar is the wrong instrument - it asks someone to page back eighty years to reach a year they could
 * have typed in four keystrokes. The calendar is never the only way in.
 *
 * `order` exists because the order is not universal, and a form that hard-codes one teaches half its
 * readers to enter the wrong date. The month accepts a name as well as a number.
 *
 * Every part is `type="text"` with a numeric keypad, never `type="number"`. Chrome silently drops letters
 * from a number input, the scroll wheel changes the value under the pointer, a screen reader announces an
 * unlabelled spin button, and it would refuse the month names this accepts.
 */
export function DateInput(props: DateInputProps): React.ReactElement {
  const autoId = useStableId('rr-dateinput');
  const id = props.id || autoId;
  const locale = props.locale || docLocale();
  const v: DateInputValue = props.value || {};

  function set(key: 'day' | 'month' | 'year', val: string): void {
    const next: DateInputValue = { day: v.day, month: v.month, year: v.year };
    next[key] = val;
    next.iso = dateParts(next, locale);
    if (props.onChange) props.onChange(next, key);
  }

  function part(
    key: 'day' | 'month' | 'year',
    label: React.ReactNode,
    width: string,
    auto: string,
  ): React.ReactElement {
    const fid = `${id}-${key}`;
    return React.createElement(
      'div',
      { className: `rr-dateinput__part rr-dateinput__part--${width}`, key },
      [
        React.createElement('label', { className: 'rr-dateinput__label', htmlFor: fid, key: 'l' }, label),
        React.createElement('input', {
          key: 'i',
          id: fid,
          type: 'text',
          inputMode: key === 'month' ? 'text' : 'numeric',
          className: 'rr-control rr-control--md',
          autoComplete: props.birthday ? auto : undefined,
          spellCheck: 'false',
          value: v[key] == null ? '' : v[key],
          'aria-describedby': props.error || props.hint ? `${id}-msg` : undefined,
          'aria-invalid': props.error ? 'true' : undefined,
          onChange: (event: React.ChangeEvent<HTMLInputElement>) => set(key, event.target.value),
        }),
      ],
    );
  }

  const order = (props.order || 'dmy').split('');
  const parts: Record<string, React.ReactElement> = {
    d: part('day', props.dayLabel || 'Day', 'two', 'bday-day'),
    m: part('month', props.monthLabel || 'Month', 'three', 'bday-month'),
    y: part('year', props.yearLabel || 'Year', 'four', 'bday-year'),
  };

  return React.createElement('fieldset', { className: cx('rr-dateinput', props.className) }, [
    React.createElement('legend', { className: 'rr-dateinput__legend', key: 'g' }, [
      props.label || 'Date',
      props.required
        ? React.createElement('span', { className: 'rr-field__req', key: 'r', 'aria-hidden': 'true' }, '*')
        : null,
    ]),
    props.hint && !props.error
      ? React.createElement('p', { className: 'rr-field__hint', id: `${id}-msg`, key: 'h' }, props.hint)
      : null,
    props.error
      ? React.createElement('p', { className: 'rr-field__error', id: `${id}-msg`, key: 'e' }, props.error)
      : null,
    React.createElement(
      'div',
      { className: 'rr-dateinput__row', key: 'r' },
      order.map((k) => parts[k]),
    ),
  ]);
}

export default DateInput;
