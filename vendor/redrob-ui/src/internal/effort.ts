import * as React from 'react';
import { cx } from './cx';
import { useStableId } from './ids';
import { EffortLevel, EffortNoteContext } from './model';

/** 1st, 2nd, 3rd, 4th ... 11th, 12th, 13th, 21st. */
export function effortOrdinal(n: number): string {
  const t = n % 100;
  const u = n % 10;
  return n + (t > 10 && t < 14 ? 'th' : u === 1 ? 'st' : u === 2 ? 'nd' : u === 3 ? 'rd' : 'th');
}

export interface EffortTunePick {
  id?: string;
  /** The effort it was ranked at. */
  effort?: EffortLevel;
  /** Every level a person can set on it, the ranked one included. */
  efforts?: EffortLevel[];
}

export interface EffortTuneProps {
  pick?: EffortTunePick;
  /** The pick's place on the task. */
  place?: number;
  /** A level number, `null` for the ranked one. */
  chosen?: number | null;
  onSelect: (level: EffortLevel) => void;
  /** A monthly amount, formatted in the reader's currency. */
  price: (monthly: number) => React.ReactNode;
  per?: string;
  title?: React.ReactNode;
  labels?: { effort?: string; ranked?: string; reset?: string };
  note?: (context: EffortNoteContext) => React.ReactNode;
  className?: string;
}

/**
 * Effort, set by the person on one pick: the maker's own scale as a radio group, the level it was ranked at
 * marked, and one line on the level chosen - its place on this task, or that it has none, and what a month
 * costs against the ranked price. Shared by ModelPicker and ModelGuide.
 *
 * A level that is not ranked says so instead of borrowing the ranked level's score: "there is no score to go
 * on" is the honest line, and a person turning effort up deserves to know they left the measured ground.
 */
export function EffortTune(props: EffortTuneProps): React.ReactElement {
  const k = props.pick || {};
  const levels = k.efforts || [];
  const rankedLevel = (k.effort || {}).level;
  const ranked: EffortLevel = levels.filter((l) => l.level === rankedLevel)[0] || k.effort || {};
  const chosen = props.chosen != null ? levels.filter((l) => l.level === props.chosen)[0] : null;
  const custom = !!chosen && chosen.level !== rankedLevel;
  const eff: EffortLevel = custom && chosen ? chosen : ranked;
  const L = props.labels || {};
  const id = useStableId('rr-effort');
  const per = props.per || '/mo';
  function note(): React.ReactNode {
    const l = eff;
    const money = l.monthly == null ? null : props.price(l.monthly);
    const times = custom && ranked.monthly && l.monthly != null ? l.monthly / ranked.monthly : null;
    const ctx: EffortNoteContext = {
      level: l,
      ranked,
      custom,
      place: custom ? l.place : props.place,
      times,
      price: money,
      per,
    };
    if (props.note) return props.note(ctx);
    if (!custom) {
      return [
        `${l.label} is the effort it was ranked at${props.place ? `, ${effortOrdinal(props.place)} for this task` : ''}. `,
        money,
        money ? `${per}.` : null,
      ];
    }
    const rel =
      times == null
        ? ''
        : times >= 1.05
          ? `, ${Math.round(times * 10) / 10} times the ranked price`
          : times <= 0.95
            ? `, ${Math.round((1 - times) * 100)}% less than the ranked price`
            : '';
    return [
      l.place
        ? `${l.label} is ${effortOrdinal(l.place)} for this task. `
        : `${l.label} is not ranked for this task, so there is no score to go on. `,
      money ? 'About ' : null,
      money,
      money ? `${per}${rel}.` : null,
    ];
  }
  return React.createElement('div', { className: cx('rr-effort', props.className) }, [
    React.createElement('div', { key: 'h', className: 'rr-effort__head' }, [
      React.createElement('p', { key: 't', id, className: 'rr-effort__title' }, [
        `${L.effort || 'Effort'} `,
        props.title ? React.createElement('span', { key: 's' }, props.title) : null,
      ]),
      custom
        ? React.createElement(
            'button',
            { key: 'r', type: 'button', className: 'rr-model__back', onClick: () => props.onSelect(ranked) },
            `${L.reset || 'Back to'} ${ranked.label}`,
          )
        : null,
    ]),
    React.createElement(
      'div',
      {
        key: 'l',
        className: 'rr-effort__levels',
        role: 'radiogroup',
        'aria-labelledby': id,
        onKeyDown: (e: React.KeyboardEvent<HTMLDivElement>) => {
          const d =
            e.key === 'ArrowRight' || e.key === 'ArrowDown'
              ? 1
              : e.key === 'ArrowLeft' || e.key === 'ArrowUp'
                ? -1
                : 0;
          if (!d) return;
          e.preventDefault();
          let i = 0;
          levels.forEach((l, j) => {
            if (l.level === eff.level) i = j;
          });
          const j = Math.max(0, Math.min(levels.length - 1, i + d));
          props.onSelect(levels[j]);
          const el = e.currentTarget.children[j];
          if (el instanceof HTMLElement) el.focus();
        },
      },
      levels.map((l) => {
        const on = l.level === eff.level;
        return React.createElement(
          'button',
          {
            key: l.level,
            type: 'button',
            role: 'radio',
            'aria-checked': String(on),
            tabIndex: on ? 0 : -1,
            className: cx('rr-effort__level', on && 'is-on'),
            onClick: () => props.onSelect(l),
          },
          [
            React.createElement('span', { key: 'l' }, l.label),
            l.level === rankedLevel
              ? React.createElement('span', { key: 'r', className: 'rr-effort__mark' }, L.ranked || 'Ranked')
              : null,
          ],
        );
      }),
    ),
    React.createElement('p', { key: 'n', className: 'rr-effort__note', 'aria-live': 'polite' }, note()),
  ]);
}
