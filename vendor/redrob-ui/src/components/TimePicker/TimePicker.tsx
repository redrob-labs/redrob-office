import * as React from 'react';
import { cx } from '../../internal/cx';
import { useFloating } from '../../internal/useFloating';
import { useStableId } from '../../internal/ids';
import { Field, FieldShellProps } from '../../internal/Field';
import { OFFICES, pad2, partOfDay, tzMinutes } from '../../internal/datetime';
import { icons } from '../../icons';
import { Button } from '../Button/Button';

export interface TimePickerProps extends FieldShellProps {
  /** `HH:MM`, 24-hour. */
  value?: string;
  defaultValue?: string;
  size?: 'sm' | 'md' | 'lg';
  disabled?: boolean;
  /** The zone this time is in. Turns on the "and what time that is elsewhere" line. */
  zone?: string;
  /** Offices to convert into. `false` turns the line off; an array replaces Redrob's own. */
  offices?: Array<[string, string]> | false;
  /** One-tap times. `false` turns the row off. */
  presets?: string[] | false;
  /** The moment offsets are computed for, so DST is right. */
  now?: Date;
  openLabel?: string;
  closeLabel?: string;
  dialogLabel?: string;
  howLabel?: string;
  hourHint?: React.ReactNode;
  minuteHint?: React.ReactNode;
  doneLabel?: React.ReactNode;
  className?: string;
  onChange?: (value: string) => void;
}

/**
 * A time of day, typed or set on a clock face.
 *
 * Typing is the primary route and the clock is the second one, for the same reason as `DatePicker`:
 * somebody who knows the time should be able to write it. "0830" and "8:30" both work, and the arrow
 * keys move in five-minute steps.
 *
 * The dial is one face for both stages. Hours use two rings - the outer for 1-12, the inner for 13-00 -
 * so a 24-hour time needs no AM/PM control, which is the part people get wrong. Minutes snap to five on
 * a tap and go to any minute on a drag, because five-minute precision is what almost every time needs
 * and the exception should not slow the common case down.
 *
 * `zone` turns on the line showing the same moment in the other offices. A meeting time is the one
 * field where being an hour out costs somebody their evening.
 */
export function TimePicker(props: TimePickerProps): React.ReactElement {
  const autoId = useStableId('rr-time');
  const id = props.id || autoId;
  const controlled = props.value !== undefined;
  const [inner, setInner] = React.useState(props.defaultValue || '09:00');
  const value = controlled ? props.value : inner;
  const [open, setOpen] = React.useState(false);
  const [stage, setStage] = React.useState<'h' | 'm'>('h');
  const [draft, setDraft] = React.useState<string | null>(null);
  const [hover, setHover] = React.useState<number | null>(null);
  const wrap = React.useRef<HTMLDivElement | null>(null);
  const field = React.useRef<HTMLInputElement | null>(null);
  useFloating(
    open,
    () => [field.current && field.current.parentElement, wrap.current && wrap.current.querySelector<HTMLElement>('.rr-time__pop')],
    { side: 'bottom', gap: 6 },
  );

  const parts = String(value || '00:00').split(':');
  const hh = Number(parts[0]) || 0;
  const mm = Number(parts[1]) || 0;

  function set(h2: number, m2: number): void {
    const v = `${pad2((((h2 % 24) + 24) % 24))}:${pad2((((m2 % 60) + 60) % 60))}`;
    if (!controlled) setInner(v);
    if (props.onChange) props.onChange(v);
  }

  const close = React.useCallback((refocus: boolean) => {
    setOpen(false);
    setStage('h');
    setHover(null);
    if (refocus && field.current) field.current.focus();
  }, []);

  React.useEffect(() => {
    if (!open) return undefined;
    function away(event: PointerEvent): void {
      if (wrap.current && !wrap.current.contains(event.target as Node)) close(false);
    }
    function esc(event: KeyboardEvent): void {
      if (event.key === 'Escape') close(true);
    }
    document.addEventListener('pointerdown', away);
    document.addEventListener('keydown', esc);
    return () => {
      document.removeEventListener('pointerdown', away);
      document.removeEventListener('keydown', esc);
    };
  }, [open, close]);

  function commit(text: string): void {
    const t = String(text || '').replace(/[^0-9:]/g, '');
    let h2: number;
    let m2: number;
    if (t.indexOf(':') >= 0) {
      const p = t.split(':');
      h2 = Number(p[0]);
      m2 = Number(p[1] || 0);
    } else if (t.length <= 2) {
      h2 = Number(t);
      m2 = 0;
    } else {
      h2 = Number(t.slice(0, t.length - 2));
      m2 = Number(t.slice(-2));
    }
    if (t && !isNaN(h2) && !isNaN(m2) && h2 >= 0 && h2 <= 24 && m2 >= 0 && m2 < 60) {
      set(h2 === 24 ? 0 : h2, m2);
    }
    setDraft(null);
  }

  const C = 120;
  const OUT = 92;
  const IN = 60;

  function at(deg: number, r: number): [number, number] {
    const a = ((deg - 90) * Math.PI) / 180;
    return [C + r * Math.cos(a), C + r * Math.sin(a)];
  }

  function read(event: React.PointerEvent<SVGSVGElement>): { deg: number; dist: number } {
    const box = event.currentTarget.getBoundingClientRect();
    const k = box.width / (C * 2);
    const x = (event.clientX - box.left) / k - C;
    const y = (event.clientY - box.top) / k - C;
    let deg = (Math.atan2(y, x) * 180) / Math.PI + 90;
    if (deg < 0) deg += 360;
    return { deg, dist: Math.sqrt(x * x + y * y) };
  }

  function valueAt(p: { deg: number; dist: number }, fine: boolean): number {
    if (stage === 'h') {
      const slot = Math.round(p.deg / 30) % 12;
      const innerRing = p.dist < (OUT + IN) / 2;
      return innerRing ? (slot === 0 ? 0 : slot + 12) : slot === 0 ? 12 : slot;
    }
    return fine ? Math.round(p.deg / 6) % 60 : (Math.round(p.deg / 30) * 5) % 60;
  }

  function apply(v: number): void {
    if (stage === 'h') set(v, mm);
    else set(hh, v);
  }

  const handDeg = stage === 'h' ? (hh % 12) * 30 : mm * 6;
  const handR = stage === 'h' ? (hh === 0 || hh > 12 ? IN : OUT) : OUT;
  const ghost =
    hover == null
      ? null
      : stage === 'h'
        ? { deg: (hover % 12) * 30, r: hover === 0 || hover > 12 ? IN : OUT }
        : { deg: hover * 6, r: OUT };

  const nums: Array<{ k: string; deg: number; r: number; t: string; v: number; inner?: boolean }> = [];
  for (let i = 0; i < 12; i++) {
    if (stage === 'h') {
      nums.push({ k: `o${i}`, deg: i * 30, r: OUT, t: i === 0 ? '12' : String(i), v: i === 0 ? 12 : i });
      nums.push({
        k: `i${i}`,
        deg: i * 30,
        r: IN,
        t: i === 0 ? '00' : String(i + 12),
        v: i === 0 ? 0 : i + 12,
        inner: true,
      });
    } else {
      nums.push({ k: `m${i}`, deg: i * 30, r: OUT, t: pad2(i * 5), v: i * 5 });
    }
  }
  const sel = stage === 'h' ? hh : mm;

  const zone = props.zone;
  const offices = props.offices === false ? [] : props.offices || OFFICES;
  const others = zone
    ? offices
        .filter((o) => o[0] !== zone)
        .map((o) => {
          const mins = hh * 60 + mm - tzMinutes(zone, props.now) + tzMinutes(o[0], props.now);
          const day = Math.floor(mins / 1440);
          const t = ((mins % 1440) + 1440) % 1440;
          return `${o[1]} ${pad2(Math.floor(t / 60))}:${pad2(t % 60)}${
            day < 0 ? ' the day before' : day > 0 ? ' the next day' : ''
          }`;
        })
    : [];
  const presets = props.presets === false ? [] : props.presets || ['08:00', '09:00', '12:00', '14:00', '18:00'];

  function seg(which: 'h' | 'm'): Record<string, unknown> {
    return {
      type: 'button',
      'aria-label': which === 'h' ? `Hour, ${hh}` : `Minute, ${mm}`,
      'aria-pressed': stage === which ? 'true' : 'false',
      className: cx('rr-time__seg', stage === which && 'rr-time__seg--on'),
      onClick: () => setStage(which),
      onKeyDown: (event: React.KeyboardEvent) => {
        const d = event.key === 'ArrowUp' ? 1 : event.key === 'ArrowDown' ? -1 : 0;
        if (d) {
          event.preventDefault();
          if (which === 'h') set(hh + d, mm);
          else set(hh, mm + d);
        }
      },
    };
  }

  const dial = React.createElement(
    'svg',
    {
      key: 's',
      className: 'rr-time__dial',
      viewBox: '0 0 240 240',
      'aria-hidden': 'true',
      onPointerDown: (event: React.PointerEvent<SVGSVGElement>) => {
        event.currentTarget.setPointerCapture(event.pointerId);
        apply(valueAt(read(event), false));
      },
      onPointerMove: (event: React.PointerEvent<SVGSVGElement>) => {
        const p = read(event);
        if (event.buttons) apply(valueAt(p, stage === 'm'));
        else setHover(valueAt(p, false));
      },
      onPointerLeave: () => setHover(null),
      onPointerUp: (event: React.PointerEvent<SVGSVGElement>) => {
        apply(valueAt(read(event), stage === 'm'));
        if (stage === 'h') {
          setStage('m');
          setHover(null);
        }
      },
    },
    (
      [
        React.createElement('circle', { key: 'bg', cx: C, cy: C, r: C - 2, className: 'rr-time__face' }),
        stage === 'h'
          ? React.createElement('circle', { key: 'band', cx: C, cy: C, r: IN + 18, className: 'rr-time__band' })
          : null,
        stage === 'm'
          ? React.createElement(
              'g',
              { key: 'ticks' },
              Array.apply(null, Array(60) as unknown[]).map((_, t) => {
                const a = at(t * 6, OUT + 22);
                const b = at(t * 6, t % 5 ? OUT + 18 : OUT + 15);
                return React.createElement('line', {
                  key: t,
                  x1: a[0],
                  y1: a[1],
                  x2: b[0],
                  y2: b[1],
                  className: cx('rr-time__tick', !(t % 5) && 'rr-time__tick--five'),
                });
              }),
            )
          : null,
        ghost
          ? React.createElement('circle', {
              key: 'gh',
              cx: at(ghost.deg, ghost.r)[0],
              cy: at(ghost.deg, ghost.r)[1],
              r: 16,
              className: 'rr-time__ghost',
            })
          : null,
        React.createElement(
          'g',
          { key: 'hand', className: 'rr-time__hand', style: { transform: `rotate(${handDeg}deg)` } },
          [
            React.createElement('line', { key: 'l', x1: C, y1: C, x2: C, y2: C - handR + 16 }),
            React.createElement('circle', { key: 'k', cx: C, cy: C - handR, r: 17, className: 'rr-time__knob' }),
            stage === 'm' && mm % 5
              ? React.createElement('circle', { key: 'd', cx: C, cy: C - handR, r: 2.5, className: 'rr-time__dot' })
              : null,
          ],
        ),
        React.createElement('circle', { key: 'c', cx: C, cy: C, r: 4, className: 'rr-time__pin' }),
      ] as React.ReactNode[]
    ).concat(
      nums.map((n) => {
        const p = at(n.deg, n.r);
        const on = n.v === sel && !(stage === 'h' && (handR === IN) !== !!n.inner);
        return React.createElement(
          'text',
          {
            key: n.k,
            x: p[0],
            y: p[1],
            dy: '0.35em',
            textAnchor: 'middle',
            className: cx('rr-time__num', n.inner && 'rr-time__num--in', on && 'rr-time__num--on'),
          },
          n.t,
        );
      }),
    ),
  );

  const control = React.createElement('div', { className: 'rr-time', ref: wrap }, [
    React.createElement(
      'div',
      {
        key: 'f',
        className: cx('rr-time__field', `rr-time__field--${props.size || 'sm'}`, open && 'rr-time__field--open'),
      },
      [
        React.createElement('input', {
          key: 'i',
          ref: field,
          id,
          className: 'rr-time__input',
          inputMode: 'numeric',
          autoComplete: 'off',
          disabled: props.disabled,
          'aria-describedby': `${id}-how`,
          value: draft != null ? draft : value,
          onChange: (event: React.ChangeEvent<HTMLInputElement>) => setDraft(event.target.value),
          onBlur: (event: React.FocusEvent<HTMLInputElement>) => commit(event.target.value),
          onKeyDown: (event: React.KeyboardEvent<HTMLInputElement>) => {
            if (event.key === 'Enter') {
              event.preventDefault();
              commit((event.target as HTMLInputElement).value);
            }
            if (event.key === 'ArrowUp' || event.key === 'ArrowDown') {
              event.preventDefault();
              set(hh, mm + (event.key === 'ArrowUp' ? 5 : -5));
            }
          },
        }),
        React.createElement(
          'button',
          {
            key: 'b',
            type: 'button',
            className: 'rr-time__open',
            disabled: props.disabled,
            'aria-label': open ? props.closeLabel || 'Close the clock' : props.openLabel || 'Open the clock',
            'aria-expanded': open ? 'true' : 'false',
            'aria-haspopup': 'dialog',
            onClick: () => {
              setStage('h');
              setOpen(!open);
            },
          },
          icons.clock({ width: 15, height: 15, 'aria-hidden': 'true' }),
        ),
      ],
    ),
    React.createElement(
      'span',
      { key: 'how', id: `${id}-how`, className: 'rr-visually-hidden' },
      props.howLabel || 'Type a time like 0830, or use the arrow keys to move by five minutes.',
    ),
    open
      ? React.createElement(
          'div',
          { key: 'p', className: 'rr-time__pop', role: 'dialog', 'aria-label': props.dialogLabel || 'Choose a time' },
          [
            React.createElement('div', { key: 'h', className: 'rr-time__head' }, [
              React.createElement('div', { key: 'r', className: 'rr-time__read' }, [
                React.createElement('button', { key: 'h', ...seg('h') }, pad2(hh)),
                React.createElement('span', { key: 'c', className: 'rr-time__colon', 'aria-hidden': 'true' }, ':'),
                React.createElement('button', { key: 'm', ...seg('m') }, pad2(mm)),
              ]),
              React.createElement('span', { key: 'd', className: 'rr-time__day' }, partOfDay(hh)),
            ]),
            dial,
            presets.length
              ? React.createElement(
                  'div',
                  { key: 'q', className: 'rr-time__quick', role: 'group', 'aria-label': 'Common times' },
                  presets.map((t) =>
                    React.createElement(
                      'button',
                      {
                        key: t,
                        type: 'button',
                        className: 'rr-time__chip',
                        'aria-pressed': value === t ? 'true' : 'false',
                        onClick: () => {
                          const p = t.split(':');
                          set(Number(p[0]), Number(p[1]));
                        },
                      },
                      t,
                    ),
                  ),
                )
              : null,
            others.length
              ? React.createElement('p', { key: 'o', className: 'rr-time__others' }, [
                  icons.globe({ key: 'g', width: 13, height: 13, 'aria-hidden': 'true' } as never),
                  others.join(', '),
                ])
              : null,
            React.createElement('div', { key: 'f', className: 'rr-time__foot' }, [
              React.createElement(
                'span',
                { key: 's' },
                stage === 'h'
                  ? props.hourHint || 'Choose the hour'
                  : props.minuteHint || 'Tap for five-minute steps, drag for any minute',
              ),
              React.createElement(
                Button,
                { key: 'd', size: 'sm', variant: 'primary', onClick: () => close(true) },
                props.doneLabel || 'Done',
              ),
            ]),
          ],
        )
      : null,
  ]);

  return Field({ ...props, id }, control);
}

export default TimePicker;
