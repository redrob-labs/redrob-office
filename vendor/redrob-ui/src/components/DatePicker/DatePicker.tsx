import * as React from 'react';
import { cx } from '../../internal/cx';
import { useStableId } from '../../internal/ids';
import { useDismiss } from '../../internal/useDismiss';
import { useFloating } from '../../internal/useFloating';
import { Field, FieldShellProps } from '../../internal/Field';
import { docLocale, parseDate, parseMonth, weekStartFor, weekdayNames, ymd } from '../../internal/datetime';
import { icons } from '../../icons';
import { Button } from '../Button/Button';
import { IconButton } from '../IconButton/IconButton';

export interface DatePickerProps extends FieldShellProps {
  /** `YYYY-MM-DD`, or a Date. */
  value?: string | Date | null;
  defaultValue?: string | Date | null;
  /** Defaults to the page's `lang`. Drives the month names, the weekday names and the week start. */
  locale?: string;
  /** Override the locale's week start. 0 is Sunday. */
  weekStart?: number;
  size?: 'sm' | 'md' | 'lg';
  placeholder?: string;
  disabled?: boolean;
  defaultOpen?: boolean;
  /** Format the value in the field. Defaults to the locale's medium date style. */
  format?: (d: Date) => string;
  calendarLabel?: string;
  prevLabel?: string;
  nextLabel?: string;
  todayLabel?: React.ReactNode;
  clearLabel?: React.ReactNode;
  className?: string;
  onChange?: (value: string | null, date: Date | null) => void;
}

/**
 * A date, typed or picked.
 *
 * Typed first, and that ordering is the point. A calendar that is the only way in locks out anyone
 * whose JavaScript failed, anyone on a screen reader, and anyone who simply knows the date and would
 * rather write it than hunt for it. The calendar is the second route, never the only one.
 *
 * The typed parser accepts the shapes people actually write - "4 Mar 2026", "Mar 4 2026",
 * "2026. 3. 4." - and when it cannot read one it keeps the text instead of discarding it, so nobody
 * loses what they typed to a format they were never told about.
 *
 * For a date of birth use `DateInput`: a calendar is the wrong instrument for a year eighty years back.
 */
export function DatePicker(props: DatePickerProps): React.ReactElement {
  const autoId = useStableId('rr-date');
  const id = props.id || autoId;
  const locale = props.locale || docLocale();
  const [held, setHeld] = React.useState<string | Date | null>(props.defaultValue || null);
  const value = props.value !== undefined ? props.value : held;
  const selected = parseDate(value);
  const today = new Date();
  const [month, setMonth] = React.useState<Date>(selected || today);
  const [open, setOpen] = React.useState(!!props.defaultOpen);
  const close = React.useCallback(() => setOpen(false), []);
  const ref = useDismiss<HTMLDivElement>(open, close);
  useFloating(
    open,
    () => [
      ref.current && ref.current.querySelector<HTMLElement>('.rr-select-wrap'),
      ref.current && ref.current.querySelector<HTMLElement>('.rr-cal'),
    ],
    { side: 'bottom', gap: 4 },
  );
  const [draft, setDraft] = React.useState<string | null>(null);

  const weekStart = props.weekStart != null ? props.weekStart : weekStartFor(locale);
  const first = new Date(month.getFullYear(), month.getMonth(), 1);
  const startPad = (first.getDay() - weekStart + 7) % 7;
  const daysInMonth = new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate();
  const cells: Array<Date | null> = [];
  for (let i = 0; i < startPad; i++) cells.push(null);
  for (let i = 1; i <= daysInMonth; i++) cells.push(new Date(month.getFullYear(), month.getMonth(), i));

  function commit(d: Date): void {
    if (props.value === undefined) setHeld(ymd(d));
    if (props.onChange) props.onChange(ymd(d), d);
  }
  function pick(d: Date): void {
    commit(d);
    setOpen(false);
  }
  function shiftMonth(n: number): void {
    setMonth(new Date(month.getFullYear(), month.getMonth() + n, 1));
  }
  function clear(): void {
    if (props.value === undefined) setHeld(null);
    if (props.onChange) props.onChange(null, null);
    setDraft(null);
  }

  function fmt(d: Date): string {
    if (props.format) return props.format(d);
    try {
      return new Intl.DateTimeFormat(locale, { dateStyle: 'medium' }).format(d);
    } catch {
      return ymd(d);
    }
  }

  const shown = draft != null ? draft : selected ? fmt(selected) : '';

  function acceptTyped(text: string): void {
    const t = String(text || '').trim();
    if (!t) {
      clear();
      return;
    }
    let d = parseDate(t);
    if (!d) {
      const nums: string[] = t.match(/\d+/g) || [];
      const mo = parseMonth((t.match(/[A-Za-zÀ-ɏ가-힣]+/) || [])[0], locale);
      if (nums.length >= 3) {
        d = new Date(
          +nums[0] > 31 ? +nums[0] : +nums[2],
          (mo || +nums[1]) - 1,
          +nums[0] > 31 ? +nums[2] : +nums[0],
        );
      } else if (mo && nums.length === 2) {
        d = new Date(+nums[1] > 31 ? +nums[1] : +nums[0], mo - 1, +nums[1] > 31 ? +nums[0] : +nums[1]);
      }
    }
    if (d && !isNaN(d.getTime())) {
      commit(d);
      setMonth(d);
      setDraft(null);
    } else {
      setDraft(t);
    }
  }

  const monthLabel = (() => {
    try {
      return new Intl.DateTimeFormat(locale, { month: 'long', year: 'numeric' }).format(month);
    } catch {
      return `${month.getFullYear()}-${month.getMonth() + 1}`;
    }
  })();

  const control = React.createElement('div', { className: cx('rr-datepicker', props.className), ref }, [
    React.createElement('div', { className: 'rr-datepicker__field', key: 'f' }, [
      React.createElement('input', {
        key: 'in',
        id,
        type: 'text',
        inputMode: 'numeric',
        spellCheck: 'false',
        className: cx('rr-control', `rr-control--${props.size || 'md'}`, 'rr-datepicker__input'),
        placeholder: props.placeholder || fmt(new Date(2026, 2, 4)),
        value: shown,
        disabled: props.disabled,
        'aria-invalid': props.error ? 'true' : undefined,
        'aria-describedby': props.error || props.hint ? `${id}-msg` : undefined,
        onChange: (event: React.ChangeEvent<HTMLInputElement>) => setDraft(event.target.value),
        onBlur: (event: React.FocusEvent<HTMLInputElement>) => acceptTyped(event.target.value),
      }),
      React.createElement(
        IconButton,
        {
          key: 'b',
          label: props.calendarLabel || 'Choose a date from a calendar',
          size: 'sm',
          className: 'rr-datepicker__open',
          disabled: props.disabled,
          'aria-expanded': open ? 'true' : 'false',
          'aria-haspopup': 'dialog',
          onClick: () => setOpen(!open),
        },
        icons.calendar({ width: '100%', height: '100%' }),
      ),
    ]),
    open
      ? React.createElement(
          'div',
          {
            key: 'cal',
            className: 'rr-cal',
            role: 'dialog',
            'aria-label': props.calendarLabel || 'Choose a date',
          },
          [
            React.createElement('div', { className: 'rr-cal__head', key: 'h' }, [
              React.createElement(
                IconButton,
                { key: 'p', label: props.prevLabel || 'Previous month', size: 'sm', onClick: () => shiftMonth(-1) },
                icons.chevronLeft({ width: '100%', height: '100%' }),
              ),
              React.createElement(
                'span',
                { key: 'm', className: 'rr-cal__month', 'aria-live': 'polite' },
                monthLabel,
              ),
              React.createElement(
                IconButton,
                { key: 'n', label: props.nextLabel || 'Next month', size: 'sm', onClick: () => shiftMonth(1) },
                icons.chevronRight({ width: '100%', height: '100%' }),
              ),
            ]),
            React.createElement(
              'div',
              { className: 'rr-cal__days', key: 'w' },
              weekdayNames(locale, 'narrow', weekStart).map((d, k) =>
                React.createElement('span', { key: k, 'aria-hidden': 'true' }, d),
              ),
            ),
            React.createElement(
              'div',
              { className: 'rr-cal__grid', key: 'g', role: 'grid' },
              cells.map((d, k) => {
                if (!d) return React.createElement('span', { key: `p${k}`, className: 'rr-cal__pad' });
                const isSelected = !!selected && ymd(selected) === ymd(d);
                const isToday = ymd(today) === ymd(d);
                return React.createElement(
                  'button',
                  {
                    key: ymd(d),
                    type: 'button',
                    className: cx('rr-cal__day', isSelected && 'rr-cal__day--on', isToday && 'rr-cal__day--today'),
                    'aria-pressed': isSelected ? 'true' : undefined,
                    'aria-label': fmt(d),
                    onClick: () => pick(d),
                  },
                  d.getDate(),
                );
              }),
            ),
            React.createElement('div', { className: 'rr-cal__foot', key: 'f' }, [
              React.createElement(
                Button,
                { key: 't', size: 'sm', variant: 'ghost', onClick: () => pick(new Date()) },
                props.todayLabel || 'Today',
              ),
              React.createElement(
                Button,
                {
                  key: 'c',
                  size: 'sm',
                  variant: 'ghost',
                  onClick: () => {
                    clear();
                    setOpen(false);
                  },
                },
                props.clearLabel || 'Clear',
              ),
            ]),
          ],
        )
      : null,
  ]);

  return Field({ ...props, id }, control);
}

export default DatePicker;
