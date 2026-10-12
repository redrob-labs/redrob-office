import * as React from 'react';
import { cx } from '../../internal/cx';
import { useStableId } from '../../internal/ids';
import { describeSchedule, isoDay, ScheduleValue, WEEKDAYS } from '../../internal/harness';
import { icons, IconName } from '../../icons';
import { DatePicker } from '../DatePicker/DatePicker';
import { Select } from '../Select/Select';
import { TimePicker } from '../TimePicker/TimePicker';
import { TimeZonePicker } from '../TimeZonePicker/TimeZonePicker';

export interface SchedulePickerProps {
  value?: ScheduleValue;
  defaultValue?: ScheduleValue;
  /** The moment "next run" is computed against. Pass it in tests to keep the output stable. */
  now?: Date;
  /** `[value, label]` pairs. Defaults to once / repeats / on a new file. */
  modes?: Array<[string, string]>;
  /** Where files arrive, for the event mode's sentence. */
  where?: string;
  locale?: string;
  weekStart?: number;
  zones?: Array<[string, string]>;
  offices?: Array<[string, string]> | false;
  label?: React.ReactNode;
  dateLabel?: string;
  repeatLabel?: string;
  dayOfMonthLabel?: string;
  timeLabel?: string;
  zoneLabel?: string;
  startLabel?: string;
  /** `false` hides the line about approval steps. */
  note?: React.ReactNode | false;
  className?: string;
  onChange?: (value: ScheduleValue) => void;
}

/**
 * When something should run: once, on a repeat, or when a file arrives.
 *
 * The live sentence under the controls is the point. A schedule assembled from five controls cannot be checked
 * before saving, so this states it back in words - the cadence, the time, the zone as a CITY, and the next run. It
 * is in an `aria-live` region so the confirmation reaches somebody who cannot see it change.
 *
 * A one-off whose time has already passed says so rather than silently never running.
 *
 * The note about approval steps is on by default: a person scheduling something unattended needs to know it will
 * still stop and wait at every step marked "Asks you first".
 */
export function SchedulePicker(props: SchedulePickerProps): React.ReactElement {
  const now = props.now || new Date();
  const controlled = props.value !== undefined;
  const base: ScheduleValue = {
    mode: 'repeat',
    date: isoDay(new Date(now.getTime() + 86400000)),
    start: isoDay(now),
    time: '09:00',
    zone: 'Asia/Seoul',
    freq: 'weekly',
    days: ['1'],
    dom: '1',
  };
  const [inner, setInner] = React.useState<ScheduleValue>({ ...base, ...(props.defaultValue || {}) });
  const w: ScheduleValue = controlled ? { ...base, ...props.value } : inner;
  const gid = useStableId('rr-sched');

  function set(k: keyof ScheduleValue, v: unknown): void {
    const next = { ...w } as Record<string, unknown>;
    next[k] = v;
    if (!controlled) setInner(next as ScheduleValue);
    if (props.onChange) props.onChange(next as ScheduleValue);
  }

  const modes = props.modes || [
    ['once', 'Once'],
    ['repeat', 'Repeats'],
    ['event', 'On a new file'],
  ];

  const dom: Array<{ value: string; label: string }> = [];
  for (let i = 1; i <= 28; i++) dom.push({ value: String(i), label: String(i) });
  dom.push({ value: 'last', label: 'Last day of the month' });

  return React.createElement('div', { className: cx('rr-sched', props.className) }, [
    React.createElement('span', { key: 'h', className: 'rr-sched__label', id: gid }, props.label || 'When'),
    React.createElement(
      'div',
      { key: 's', className: 'rr-seg rr-sched__modes', role: 'radiogroup', 'aria-labelledby': gid },
      modes.map((m) =>
        React.createElement(
          'button',
          {
            key: m[0],
            type: 'button',
            role: 'radio',
            'aria-checked': w.mode === m[0] ? 'true' : 'false',
            onClick: () => set('mode', m[0]),
          },
          m[1],
        ),
      ),
    ),
    w.mode === 'once'
      ? React.createElement(DatePicker, {
          key: 'd',
          label: props.dateLabel || 'Date',
          size: 'sm',
          value: w.date,
          onChange: (v: string | null) => {
            if (v) set('date', v);
          },
          locale: props.locale,
          weekStart: props.weekStart,
        })
      : null,
    w.mode === 'repeat'
      ? React.createElement(Select, {
          key: 'f',
          label: props.repeatLabel || 'Repeats',
          size: 'sm',
          value: w.freq,
          onChange: (event: unknown) => set('freq', (event as { target: { value: string } }).target.value),
          options: [
            { value: 'daily', label: 'Every day' },
            { value: 'weekdays', label: 'Every weekday', detail: 'Monday to Friday' },
            { value: 'weekly', label: 'Every week', detail: 'On the days you pick' },
            { value: 'monthly', label: 'Every month', detail: 'On one date' },
          ],
        })
      : null,
    w.mode === 'repeat' && w.freq === 'weekly'
      ? React.createElement(
          'div',
          { key: 'dw', className: 'rr-sched__days', role: 'group', 'aria-label': 'Days of the week' },
          WEEKDAYS.map((d) => {
            const on = (w.days || []).indexOf(d[0]) >= 0;
            return React.createElement(
              'button',
              {
                key: d[0],
                type: 'button',
                className: 'rr-sched__day',
                'aria-pressed': on ? 'true' : 'false',
                'aria-label': d[2],
                onClick: () =>
                  set('days', on ? (w.days || []).filter((x) => x !== d[0]) : (w.days || []).concat([d[0]])),
              },
              d[1],
            );
          }),
        )
      : null,
    w.mode === 'repeat' && w.freq === 'monthly'
      ? React.createElement(Select, {
          key: 'm',
          label: props.dayOfMonthLabel || 'Day of the month',
          size: 'sm',
          value: w.dom,
          onChange: (event: unknown) => set('dom', (event as { target: { value: string } }).target.value),
          options: dom,
        })
      : null,
    w.mode !== 'event'
      ? React.createElement('div', { key: 't', className: 'rr-sched__row' }, [
          React.createElement(TimePicker, {
            key: 't',
            label: props.timeLabel || 'Time',
            value: w.time,
            zone: w.zone,
            now,
            offices: props.offices,
            onChange: (v: string) => set('time', v),
          }),
          React.createElement(TimeZonePicker, {
            key: 'z',
            label: props.zoneLabel || 'Time zone',
            value: w.zone,
            now,
            zones: props.zones,
            onChange: (v: string) => set('zone', v),
          }),
        ])
      : null,
    w.mode === 'repeat'
      ? React.createElement(DatePicker, {
          key: 'st',
          label: props.startLabel || 'Starting',
          size: 'sm',
          value: w.start,
          onChange: (v: string | null) => {
            if (v) set('start', v);
          },
          locale: props.locale,
          weekStart: props.weekStart,
        })
      : null,
    React.createElement('p', { key: 'sum', className: 'rr-sched__sum', 'aria-live': 'polite' }, [
      icons[(w.mode === 'event' ? 'folder' : 'calendarClock') as IconName]({
        key: 'i',
        width: 14,
        height: 14,
        'aria-hidden': 'true',
      } as never),
      describeSchedule(w, { where: props.where, now, zones: props.zones }),
    ]),
    props.note !== false
      ? React.createElement(
          'p',
          { key: 'n', className: 'rr-sched__note' },
          props.note ||
            'On a schedule, it still stops at every step marked "Asks you first", and waits for you.',
        )
      : null,
  ]);
}

export default SchedulePicker;
