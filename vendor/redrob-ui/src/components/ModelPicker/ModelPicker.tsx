import * as React from 'react';
import { cx } from '../../internal/cx';
import { useStableId } from '../../internal/ids';
import { docLocale } from '../../internal/datetime';
import { useDismiss } from '../../internal/useDismiss';
import { useFloating } from '../../internal/useFloating';
import { CURRENCY_STEP, currencyFor, Effort, EffortLevel, EffortMeter, EffortNoteContext } from '../../internal/model';
import { EffortTune } from '../../internal/effort';
import { guidePrice } from '../../internal/guide';
import { icons } from '../../icons';
import { Money } from '../Money/Money';
import { Select } from '../Select/Select';

export interface ModelPick {
  id: string;
  model?: string;
  /** A shorter name for the trigger. */
  short?: string;
  /** Which product it runs in. */
  harness?: string;
  /** The effort it was ranked at. */
  effort?: Effort;
  /** Every level a person can set on it, the ranked one included. With two or more, a pinned pick shows the effort control. */
  efforts?: EffortLevel[];
  /** Why it is ranked here, in one line. */
  why?: React.ReactNode;
  /** Price per month in the base currency. */
  monthly?: number;
}

export interface ModelTask {
  id: string;
  label?: string;
  title?: string;
  /** How much of it a plan covers. */
  usage?: string;
  picks?: ModelPick[];
}

export interface ModelProfession {
  id: string;
  label?: string;
  disabled?: boolean;
  tasks?: ModelTask[];
}

export interface ModelPickerProps {
  professions?: ModelProfession[];
  /** How many ranked picks to show. Five by default. */
  limit?: number;
  locale?: string;
  /** Currency the prices are given in. */
  currency?: string;
  /** Conversion rates from the base currency. */
  rates?: Record<string, number>;
  currencyByLang?: Record<string, string>;
  /** Offer Redrob Auto. */
  auto?: boolean;
  /** The product this picker sits in. Picks from elsewhere are shown but not selectable. */
  here?: string;
  value?: string | null;
  defaultValue?: string | null;
  defaultOpen?: boolean;
  defaultProfession?: string;
  defaultTask?: string;
  task?: string;
  /** Which task Auto matched the last message to. */
  matchedTask?: string;
  /** Where the ranking came from. */
  source?: { name?: string; edition?: string; note?: string };
  /** How the ranking and pricing work. Rendered in a details block. */
  basis?: React.ReactNode;
  label?: string;
  professionLabel?: string;
  taskLabel?: string;
  autoTaskLabel?: string;
  autoLabel?: string;
  autoText?: string;
  autoTaskText?: string;
  autoPickLabel?: string;
  matchedLabel?: string;
  awayLabel?: string;
  awayNote?: string;
  backLabel?: React.ReactNode;
  guideLabel?: React.ReactNode;
  guideHref?: string;
  basisLabel?: React.ReactNode;
  perLabel?: string;
  placement?: string;
  align?: string;
  className?: string;
  onChange?: (
    pick: ModelPick | null,
    context: { profession: ModelProfession; task: ModelTask; taskMode?: string },
  ) => void;
  onTaskChange?: (id: string, profession: ModelProfession) => void;
  onOpenGuide?: (task: ModelTask, profession: ModelProfession) => void;
  /** Effort set by the person on the pinned pick: a level number on its scale, `null` for the ranked one. Reset when the pick changes. */
  effort?: number | null;
  defaultEffort?: number | null;
  /** `level` is `null` when the person goes back to the ranked effort. */
  onEffortChange?: (level: EffortLevel | null, pick: ModelPick) => void;
  effortLabel?: string;
  rankedLabel?: string;
  resetEffortLabel?: string;
  /** "you set", beside the level the person chose. */
  yoursLabel?: string;
  /** Replaces the line under the effort control, e.g. for another language. */
  effortNote?: (context: EffortNoteContext) => React.ReactNode;
}

/**
 * Chooses which model answers, by asking what the person does and what they want.
 *
 * Profession and task first, models second. A flat list of model names asks somebody to already know which is
 * good at what, which is the knowledge they came here without.
 *
 * Redrob Auto is a real option rather than a hidden default, and it says what it will do: read each message
 * after Send, pick the highest-ranked model that runs here, and name the one that answered. A router nobody can
 * see is a router nobody can check.
 *
 * Picks that run in another product are shown greyed rather than hidden, with the reason. Hiding them would make
 * the ranking look shorter than it is; showing them selectable would offer something that cannot work here.
 *
 * Prices are converted into the reader's likely currency and rounded to that currency's step, because ₩13,247
 * claims a precision the exchange rate does not have.
 */
export function ModelPicker(props: ModelPickerProps): React.ReactElement {
  const professions = props.professions || [];
  const limit = props.limit || 5;
  const locale = props.locale || docLocale();
  const base = props.currency || 'USD';
  const rates = props.rates || {};

  let shown = currencyFor(
    props.locale ||
      (typeof document !== 'undefined' && document.documentElement.lang) ||
      locale,
    props.currencyByLang,
  );
  if (shown !== base && rates[shown] == null) shown = base;

  const firstProf = professions.filter((p) => !p.disabled)[0] || ({} as ModelProfession);
  const auto = !!props.auto;
  const here = props.here;

  const [open, setOpen] = React.useState(!!props.defaultOpen);
  const [profId, setProfId] = React.useState<string | undefined>(props.defaultProfession || firstProf.id);
  const prof = professions.filter((p) => p.id === profId)[0] || firstProf;
  const tasks = prof.tasks || [];
  const [taskHeld, setTaskHeld] = React.useState<string | undefined>(
    props.defaultTask || (auto ? 'auto' : tasks[0] && tasks[0].id),
  );
  const taskMode = props.task !== undefined ? props.task : taskHeld;
  const matchedId = taskMode === 'auto' ? props.matchedTask || (tasks[0] && tasks[0].id) : taskMode;
  const task = tasks.filter((t) => t.id === matchedId)[0] || tasks[0] || ({} as ModelTask);
  const picks = (task.picks || []).slice(0, limit);

  const away = (k: ModelPick): boolean => !!here && k.harness !== here;
  const autoPick = picks.filter((k) => !away(k))[0];

  const [valueHeld, setValueHeld] = React.useState<string | null | undefined>(
    props.defaultValue !== undefined ? props.defaultValue : auto ? null : picks[0] && picks[0].id,
  );
  const value = props.value !== undefined ? props.value : valueHeld;
  // The effort the person sets on a pinned model: a level on its own scale, or null for the ranked one.
  const [effortHeld, setEffortHeld] = React.useState<number | null>(
    props.defaultEffort != null ? props.defaultEffort : null,
  );
  const effortSet = props.effort !== undefined ? props.effort : effortHeld;

  const all: ModelPick[] = [];
  professions.forEach((p) => {
    (p.tasks || []).forEach((t) => {
      (t.picks || []).forEach((k) => all.push(k));
    });
  });
  const current = all.filter((k) => k.id === value)[0] || (auto ? null : picks[0]) || null;
  const isAuto = auto && !current;
  const cur = current || ({} as ModelPick);
  const levels = cur.efforts || [];
  const tunable = !!current && levels.length > 1 && !away(cur);
  const chosenEffort = tunable && effortSet != null ? levels.filter((l) => l.level === effortSet)[0] : null;
  const custom = !!chosenEffort && chosenEffort.level !== (cur.effort || {}).level;
  const eff = custom ? chosenEffort : cur.effort || null;

  const close = React.useCallback(() => setOpen(false), []);
  const ref = useDismiss<HTMLDivElement>(open, close);
  // Placed against the window. Inside a composer the panel lines up with the composer, as the
  // stylesheet already does; on a narrow window the stylesheet's bottom sheet takes over.
  useFloating(
    open,
    () => {
      const root = ref.current;
      if (!root) return [null, null];
      const composer = root.closest<HTMLElement>('.rr-composer');
      const trigger = root.querySelector<HTMLElement>(':scope > .rr-model__trigger');
      return [composer || trigger, root.querySelector<HTMLElement>(':scope > .rr-model__panel')];
    },
    {
      side: props.placement === 'top' ? 'top' : 'bottom',
      align: props.align === 'end' ? 'end' : 'start',
      gap: props.placement === 'top' ? 12 : 8,
      fitHeight: true,
      skipBelow: 560,
    },
  );
  const titleId = useStableId('rr-model');

  function choose(k: ModelPick): void {
    if (away(k)) return;
    if (props.value === undefined) setValueHeld(k.id);
    if (props.effort === undefined) setEffortHeld(null);
    if (props.onChange) props.onChange(k, { profession: prof, task, taskMode });
    setOpen(false);
  }
  // A level on the pinned model's scale. A level that is itself a place in the list selects that place.
  function setEffort(l: EffortLevel): void {
    const other = l.pick && l.pick !== cur.id ? picks.filter((k) => k.id === l.pick)[0] : null;
    if (other && !away(other)) {
      if (props.value === undefined) setValueHeld(other.id);
      if (props.effort === undefined) setEffortHeld(null);
      if (props.onChange) props.onChange(other, { profession: prof, task, taskMode });
      return;
    }
    const next = l.level == null || l.level === (cur.effort || {}).level ? null : l.level;
    if (props.effort === undefined) setEffortHeld(next);
    if (props.onEffortChange) props.onEffortChange(next == null ? null : l, cur);
  }
  function chooseAuto(): void {
    if (props.value === undefined) setValueHeld(null);
    if (props.effort === undefined) setEffortHeld(null);
    if (props.onChange) props.onChange(null, { profession: prof, task, taskMode });
    setOpen(false);
  }
  function setTask(id: string): void {
    if (props.task === undefined) setTaskHeld(id);
    if (props.onTaskChange) props.onTaskChange(id, prof);
  }

  function price(k: ModelPick): React.ReactNode {
    if (k.monthly == null) return null;
    let amt = shown === base ? k.monthly : k.monthly * rates[shown];
    const step = CURRENCY_STEP[shown];
    const small = shown === base && amt < 1;
    amt = step ? Math.max(step, Math.round(amt / step) * step) : small ? amt : Math.round(amt);
    return React.createElement('span', { className: 'rr-model__price', key: 'p' }, [
      React.createElement(Money, {
        key: 'm',
        amount: amt,
        currency: shown,
        locale,
        decimals: small ? undefined : false,
      }),
      React.createElement('span', { key: 'u', className: 'rr-model__per' }, props.perLabel || '/mo'),
    ]);
  }

  const src = props.source || {};
  const meta = [src.name, src.edition].filter(Boolean).join(', ');
  const hereShort = here ? here.replace(/^Redrob /, '') : '';
  const tune = tunable
    ? React.createElement(EffortTune, {
        key: 'e',
        className: 'rr-model__tune',
        pick: cur,
        place: picks.indexOf(cur) + 1 || undefined,
        chosen: effortSet,
        onSelect: setEffort,
        per: props.perLabel,
        note: props.effortNote,
        price: (m: number) => guidePrice(m, shown, base, rates, locale, 'rr-effort__price'),
        title: `for ${cur.short || cur.model} on ${cur.harness}`,
        labels: { effort: props.effortLabel, ranked: props.rankedLabel, reset: props.resetEffortLabel },
      })
    : null;

  const panel = open
    ? React.createElement(
        'div',
        { key: 'p', className: 'rr-model__panel', role: 'dialog', 'aria-labelledby': titleId },
        [
          React.createElement('div', { key: 'q', className: 'rr-model__ask' }, [
            React.createElement(Select, {
              key: 'p',
              size: 'sm',
              label: props.professionLabel || 'I work as',
              value: prof.id,
              options: professions.map((p) => ({
                value: p.id,
                label: p.disabled ? `${p.label} (soon)` : (p.label as string),
                disabled: !!p.disabled,
              })),
              onChange: (event: unknown) => {
                const target = (event as { target: { value: string } }).target;
                const next = professions.filter((p) => p.id === target.value)[0];
                setProfId(target.value);
                if (next && next.tasks && next.tasks[0]) setTask(auto ? 'auto' : next.tasks[0].id);
              },
            }),
            React.createElement(Select, {
              key: 't',
              size: 'sm',
              label: props.taskLabel || 'I want to',
              value: auto ? taskMode : task.id,
              options: (auto
                ? [{ value: 'auto', label: props.autoTaskLabel || 'Match each message (Redrob Auto)' }]
                : []
              ).concat(tasks.map((t) => ({ value: t.id, label: t.label as string }))),
              onChange: (event: unknown) => {
                const target = (event as { target: { value: string } }).target;
                setTask(target.value);
              },
            }),
          ]),
          isAuto
            ? React.createElement('div', { key: 'a', className: 'rr-model__auto' }, [
                React.createElement(
                  'span',
                  { key: 'i', className: 'rr-model__autoicon', 'aria-hidden': 'true' },
                  icons.sparkle({ width: 18, height: 18 }),
                ),
                React.createElement('span', { key: 't' }, [
                  React.createElement('b', { key: 'b' }, props.autoLabel || 'Redrob Auto'),
                  React.createElement(
                    'small',
                    { key: 's' },
                    taskMode === 'auto'
                      ? props.autoText ||
                          `Reads each message once you send it, and gives it to the highest place below that runs ${
                            here ? `in ${hereShort}` : 'here'
                          }. One chat can use several AIs, and every answer says which it used. Choose one below to use it instead.`
                      : props.autoTaskText ||
                          `Always for this task in this chat: the highest place below that runs ${
                            here ? `in ${hereShort}` : 'here'
                          }, following the ranking when it changes each month.`,
                  ),
                ]),
              ])
            : null,
          React.createElement('div', { key: 'h', className: 'rr-model__head' }, [
            React.createElement(
              'p',
              { key: 't', id: titleId, className: 'rr-model__title' },
              task.title || `Top ${picks.length} \u00b7 ${prof.label || ''} \u00b7 ${task.label || ''}`,
            ),
            meta || task.usage
              ? React.createElement(
                  'p',
                  { key: 'm', className: 'rr-model__meta' },
                  [
                    isAuto && taskMode === 'auto'
                      ? props.matchedLabel || 'Your last message was matched to this task.'
                      : null,
                    meta,
                    src.note,
                    task.usage,
                  ]
                    .filter(Boolean)
                    .join(' · '),
                )
              : null,
          ]),
          React.createElement(
            'div',
            { key: 'l', className: 'rr-model__list', role: 'listbox', 'aria-labelledby': titleId },
            picks.map((k, i) => {
              const on = !!current && k.id === current.id;
              const off = away(k);
              return React.createElement(
                'button',
                {
                  type: 'button',
                  key: k.id,
                  role: 'option',
                  'aria-selected': String(on),
                  'aria-disabled': off ? 'true' : undefined,
                  disabled: off,
                  className: cx('rr-model__item', off && 'rr-model__item--away'),
                  onClick: () => choose(k),
                },
                [
                  React.createElement('span', { key: 'r', className: 'rr-model__rank' }, String(i + 1)),
                  React.createElement('span', { key: 'b', className: 'rr-model__body' }, [
                    React.createElement('span', { key: 'n', className: 'rr-model__name' }, [
                      React.createElement('span', { key: 'm' }, k.model),
                      React.createElement('span', { key: 'o', className: 'rr-model__on' }, `on ${k.harness}`),
                      isAuto && autoPick && k.id === autoPick.id
                        ? React.createElement('span', { key: 'a', className: 'rr-model__autotag' }, [
                            React.createElement(
                              'span',
                              { key: 'i', 'aria-hidden': 'true' },
                              icons.sparkle({ width: 11, height: 11 }),
                            ),
                            props.autoPickLabel || 'Redrob Auto\u2019s pick',
                          ])
                        : null,
                      on
                        ? React.createElement(
                            'span',
                            { key: 'c', className: 'rr-model__check', 'aria-label': 'Selected' },
                            icons.check({ width: 14, height: 14 }),
                          )
                        : null,
                    ]),
                    on && custom && chosenEffort
                      ? React.createElement('span', { key: 'e', className: 'rr-model__effortrow' }, [
                          React.createElement(EffortMeter, { key: 'm', effort: k.effort }),
                          React.createElement(
                            'span',
                            { key: 'y', className: 'rr-model__yours' },
                            `${props.yoursLabel || 'you set'} ${chosenEffort.label}`,
                          ),
                        ])
                      : React.createElement(EffortMeter, { key: 'e', effort: k.effort }),
                    k.why || off
                      ? React.createElement('span', { key: 'w', className: 'rr-model__why' }, [
                          off ? props.awayLabel || `Not in ${hereShort}. ` : null,
                          k.why,
                        ])
                      : null,
                  ]),
                  price(k),
                ],
              );
            }),
          ),
          tune,
          here || (auto && current)
            ? React.createElement('div', { key: 'n', className: 'rr-model__foot' }, [
                auto && current
                  ? React.createElement(
                      'button',
                      { key: 'b', type: 'button', className: 'rr-model__back', onClick: chooseAuto },
                      props.backLabel || 'Back to Redrob Auto',
                    )
                  : null,
                here && !current
                  ? React.createElement(
                      'span',
                      { key: 'x' },
                      props.awayNote ||
                        'Grayed out: ranked, but runs in another app. Choose one that runs here to use it for this chat.',
                    )
                  : null,
              ])
            : null,
          props.onOpenGuide || props.guideHref
            ? React.createElement(
                'a',
                {
                  key: 'g',
                  className: 'rr-model__guide',
                  href: props.guideHref || '#',
                  onClick: props.onOpenGuide
                    ? (event: React.MouseEvent) => {
                        event.preventDefault();
                        setOpen(false);
                        if (props.onOpenGuide) props.onOpenGuide(task, prof);
                      }
                    : undefined,
                },
                [
                  props.guideLabel || 'Compare them in the Model Guide',
                  React.createElement(
                    'span',
                    { key: 'i', 'aria-hidden': 'true' },
                    icons.arrowRight({ width: 14, height: 14 }),
                  ),
                ],
              )
            : null,
          props.basis
            ? React.createElement('details', { key: 'f', className: 'rr-model__basis' }, [
                React.createElement('summary', { key: 's' }, props.basisLabel || 'How this is ranked and priced'),
                React.createElement('div', { key: 'b' }, props.basis),
              ])
            : null,
        ],
      )
    : null;

  return React.createElement(
    'div',
    {
      className: cx('rr-model', props.className),
      ref,
      'data-placement': props.placement || 'bottom',
      'data-align': props.align || 'start',
    },
    [
      React.createElement(
        'button',
        {
          type: 'button',
          key: 't',
          className: 'rr-model__trigger',
          'aria-haspopup': 'dialog',
          'aria-expanded': String(open),
          'aria-label': `${props.label || 'Model'}: ${
            isAuto
              ? (props.autoLabel || 'Redrob Auto') + (taskMode !== 'auto' ? `, ${task.label}` : '')
              : (cur.model || '') +
                (eff
                  ? `, ${eff.label} effort${custom ? `, ${props.yoursLabel || 'you set'} it` : ''}`
                  : '') +
                (cur.harness ? `, on ${cur.harness}` : '')
          }`,
          onClick: () => setOpen(!open),
        },
        [
          isAuto
            ? React.createElement(
                'span',
                { key: 'i', className: 'rr-model__trig-auto', 'aria-hidden': 'true' },
                icons.sparkle({ width: 15, height: 15 }),
              )
            : null,
          React.createElement(
            'span',
            { key: 'n', className: 'rr-model__trig-name' },
            isAuto ? props.autoLabel || 'Redrob Auto' : cur.short || cur.model,
          ),
          isAuto
            ? taskMode !== 'auto'
              ? React.createElement('span', { key: 'e', className: 'rr-model__trig-effort' }, task.label)
              : null
            : eff
              ? React.createElement('span', { key: 'e', className: 'rr-model__trig-effort' }, eff.label)
              : null,
          React.createElement(
            'span',
            { key: 'c', className: 'rr-model__trig-caret' },
            icons.chevronDown({ width: 14, height: 14 }),
          ),
        ],
      ),
      panel,
    ],
  );
}

export default ModelPicker;
