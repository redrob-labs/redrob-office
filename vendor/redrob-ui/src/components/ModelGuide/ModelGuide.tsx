import * as React from 'react';
import { cx } from '../../internal/cx';
import { useStableId } from '../../internal/ids';
import { docLocale } from '../../internal/datetime';
import { currencyFor, Effort, EffortLevel, EffortMeter, EffortNoteContext } from '../../internal/model';
import { EffortTune } from '../../internal/effort';
import { GUIDE_DIMS, GuideScore, GuideWeights, guidePrice, guideTotal } from '../../internal/guide';
import { GlanceHead, GlanceLabels, GlanceStrip, GuideMap, GuideMapLabels, guideGlance } from '../../internal/guide-glance';
import {
  GuideSampleLabels,
  GuideScorecard,
  GuideTaskCard,
  RunFacts,
  Scorecard,
  TaskCard,
  scoreOf,
  scoreText,
} from '../../internal/guide-sample';
import { icons } from '../../icons';
import { Badge } from '../Badge/Badge';
import { Button } from '../Button/Button';
import { Select } from '../Select/Select';

/** Where a figure comes from: run by the ranker, stated by the vendor, computed from those, or extrapolated. */
export type GuideKind = 'measured' | 'published' | 'derived' | 'estimate';

/** One model in a pick that runs more than one model in sequence, e.g. analysis then translation. */
export interface GuideStep {
  model: string;
  effort?: Effort;
  /** What this step does, e.g. "Legal analysis" or "Korean drafting". */
  role?: React.ReactNode;
}

/** One cited figure behind a pick. */
export interface GuideSource {
  label: React.ReactNode;
  value?: React.ReactNode;
  kind?: GuideKind;
  url?: string;
  /** When the figure was read, e.g. 2026-10-06. */
  date?: string;
}

/** A tool the task needs and whether this pick's harness has it. */
export interface GuideTool {
  label: React.ReactNode;
  /** Planned for the harness, not shipped yet. */
  soon?: boolean;
  /** The harness has no such tool. */
  missing?: boolean;
}

export interface GuidePick {
  id: string;
  model?: string;
  /** Two or more models in sequence. The name reads "A → B"; `model` is then optional. */
  steps?: GuideStep[];
  harness?: string;
  /** Kind of the ranking itself: `estimate` when any score behind it was extrapolated. */
  kind?: GuideKind;
  /** Kind of `monthly`, and the range it may fall in. */
  monthlyKind?: GuideKind;
  monthlyRange?: [number, number];
  /** The harness runs this pick only once a planned tool ships. */
  comingSoon?: boolean;
  tools?: GuideTool[];
  sources?: GuideSource[];
  /** Short caveats beside the name, e.g. "Data policy unverified". */
  flags?: React.ReactNode[];
  /** The effort it was ranked at. */
  effort?: Effort;
  /** Every level a reader can try on it, the ranked one included. With two or more, the detail shows the effort control. */
  efforts?: EffortLevel[];
  why?: React.ReactNode;
  monthly?: number;
  score?: GuideScore;
  /** The raw measurement behind each dimension, keyed the same way as the score. */
  measured?: Record<string, React.ReactNode>;
  /** Label/value pairs: context window, cut-off, where it runs. */
  facts?: Array<[React.ReactNode, React.ReactNode]>;
  /** What the graders said. */
  note?: React.ReactNode;
  /** One real run: the prompt, the output, and whether it is illustrative. */
  sample?: {
    prompt?: React.ReactNode;
    output?: React.ReactNode;
    more?: React.ReactNode;
    illustrative?: boolean;
    /**
     * The task as a reader needs it. With a card the sample reads card, scorecard, answer (folded), run; the
     * exact prompt moves inside the card. Without one it renders as before.
     */
    card?: GuideTaskCard;
    /** How this answer did against the task's checklist. Its score also shows on the pick's row. */
    scorecard?: GuideScorecard;
    /** What the run took: model, level, time, cost, date. */
    run?: Array<[React.ReactNode, React.ReactNode]>;
  };
  runHref?: string;
  /**
   * Why this pick cannot be used from here right now, e.g. "Not on Redrob yet". The use action is disabled
   * and this line shown beside it, rather than a button that does nothing.
   */
  unavailable?: React.ReactNode;
  /**
   * A reference point, not a pick on offer: the same ranking run on someone else's product, shown so a reader
   * can compare. It is greyed, carries no rank of its own and takes no slot in the top `limit`, and its detail
   * has no "use" action, because choosing it here would not run it there.
   */
  benchmark?: boolean;
}

export interface GuideTask {
  id: string;
  label?: string;
  title?: string;
  usage?: string;
  basis?: string;
  prompt?: React.ReactNode;
  formula?: string;
  weights?: GuideWeights;
  emptyText?: React.ReactNode;
  picks?: GuidePick[];
  /** The top five per working language, keyed like `languages`. Falls back to `picks`. */
  picksByLanguage?: Record<string, GuidePick[]>;
  /**
   * The top five when the reader needs a particular deliverable, keyed by output (as in `outputs`) and then by
   * working language. A task offers exactly the outputs keyed here; any other output reads as "anything", so a
   * task that makes no slides never shows a slide ranking borrowed from another. An output keyed with no
   * ranking for the working language falls back to the task's own ranking rather than an empty state.
   */
  picksByOutput?: Record<string, Record<string, GuidePick[]>>;
}

export interface GuideProfession {
  id: string;
  label?: string;
  disabled?: boolean;
  tasks?: GuideTask[];
}

export interface ModelGuideProps {
  professions?: GuideProfession[];
  limit?: number;
  locale?: string;
  currency?: string;
  rates?: Record<string, number>;
  currencyByLang?: Record<string, string>;
  source?: { name?: string; edition?: string; note?: string };
  weights?: GuideWeights;
  /** `advanced` shows the scores, the weights and the arithmetic. */
  mode?: 'simple' | 'advanced';
  defaultMode?: 'simple' | 'advanced';
  /** Controlled, so a ModelPicker can open the guide on its own task. */
  profession?: string;
  task?: string;
  defaultProfession?: string;
  defaultTask?: string;
  title?: React.ReactNode;
  lede?: React.ReactNode;
  /** How the testing works. Opened by default in advanced mode. */
  method?: React.ReactNode;
  modeLabel?: string;
  simpleLabel?: React.ReactNode;
  advancedLabel?: React.ReactNode;
  professionLabel?: string;
  taskLabel?: string;
  perLabel?: string;
  topLabel?: React.ReactNode;
  promptLabel?: React.ReactNode;
  outputLabel?: string;
  illustrativeLabel?: React.ReactNode;
  calcLabel?: React.ReactNode;
  noteLabel?: string;
  useLabel?: React.ReactNode;
  runLabel?: React.ReactNode;
  methodLabel?: React.ReactNode;
  emptyTitle?: React.ReactNode;
  emptyText?: React.ReactNode;
  className?: string;
  onTaskChange?: (taskId: string | null, professionId: string) => void;
  onModeChange?: (mode: 'simple' | 'advanced') => void;
  /** `effort` is the level the reader tried on the pick, or `null` for the ranked one. */
  onUse?: (
    pick: GuidePick,
    context: { profession: GuideProfession; task: GuideTask; effort: EffortLevel | null },
  ) => void;
  /** "Try another effort" in the detail; `effortHint` is the line beside it. */
  effortLabel?: string;
  effortHint?: string;
  rankedLabel?: string;
  resetEffortLabel?: string;
  effortNote?: (context: EffortNoteContext) => React.ReactNode;
  /** The language the work is done in, which re-ranks the picks. Shown as a third select when two or more. */
  languages?: Array<{ value: string; label: string }>;
  language?: string;
  defaultLanguage?: string;
  onLanguageChange?: (language: string) => void;
  languageLabel?: string;
  /**
   * What the work has to produce (documents, presentations, graphics...), which re-ranks the picks. Shown as a
   * select when given, listing "anything" and then only the outputs the current task has a ranking for. Named
   * `deliverable*` because `outputLabel` already labels a pick's sample output.
   */
  outputs?: Array<{ value: string; label: string }>;
  /** Controlled output; `''` is "anything". */
  output?: string;
  defaultOutput?: string;
  onOutputChange?: (output: string) => void;
  deliverableLabel?: string;
  /** The first option, which ranks for the task as a whole. */
  anyOutputLabel?: string;
  /** The badge on a `benchmark` pick, and the line its detail shows in place of the "use" action. */
  benchmarkLabel?: React.ReactNode;
  benchmarkNote?: React.ReactNode;
  kindLabels?: Partial<Record<GuideKind, string>>;
  comingSoonLabel?: React.ReactNode;
  /** Beside a tool the harness has no equivalent for. Sits with `comingSoonLabel`, not hardcoded. */
  missingLabel?: React.ReactNode;
  toolsLabel?: React.ReactNode;
  sourcesLabel?: React.ReactNode;
  /** "Likely between" before the monthly range. */
  rangeLabel?: string;
  /** Where a pick runs, e.g. `(h) => \`on ${h}\`` (the default). */
  harnessLabel?: (harness: string) => React.ReactNode;
  /** The detail's rank line, e.g. `(place, task) => \`#${place} for ${task}\`` (the default). */
  rankLabel?: (place: number, task: string) => React.ReactNode;
  /** The word after an effort level, `effort` by default; `''` shows the level alone. */
  effortUnit?: string;
  /**
   * What each row shows under its name. `effort` (the default) is the effort meter. `glance` is the
   * comparison strip: quality, reliability, speed and value as five-step meters against the best pick on this
   * task, under one set of column heads, with "Tied with #1" where the 95% intervals overlap and "Best value"
   * on the most quality per dollar. With `glance` the effort is written out in the detail instead of metered,
   * because a maker's own scale says little next to another maker's.
   */
  summary?: 'effort' | 'glance';
  /** Column heads, accessible names and tooltips for the strip. English by default. */
  glanceLabels?: GlanceLabels;
  tiedLabel?: React.ReactNode;
  bestValueLabel?: React.ReactNode;
  /** Before the written-out effort in the detail with `summary="glance"`, `Thinking` by default. */
  thinkingLabel?: string;
  /** Headings and words for a sample with a task card and scorecard. English by default. */
  sampleLabels?: GuideSampleLabels;
  /** In advanced mode, a quality-against-price chart above the list. Each dot opens its pick. */
  map?: boolean;
  mapLabels?: GuideMapLabels;
}

const KIND_LABEL: Record<GuideKind, string> = {
  measured: 'Measured',
  published: 'Published',
  derived: 'Derived',
  estimate: 'Estimate',
};
const KIND_TONE: Record<GuideKind, 'success' | 'info' | 'neutral' | 'warning'> = {
  measured: 'success',
  published: 'info',
  derived: 'neutral',
  estimate: 'warning',
};

/**
 * The full comparison behind the ranking: what each model was asked, what it wrote, and how it scored.
 *
 * Two modes. Simple gives the order and a reason. Advanced shows the four dimension scores, the weights, the
 * arithmetic and the confidence interval - everything needed to disagree with the ranking. A ranking that
 * cannot be disagreed with is marketing, which is why the advanced view is a real view and not a footnote.
 *
 * Every pick carries one real run: the prompt, the whole output in its own scrolling region, and a marker when
 * the sample is illustrative rather than a verbatim capture. The output box is focusable so a keyboard can
 * scroll it.
 *
 * A task with no picks says "Not ranked yet" and when it will be, rather than rendering an empty list that
 * looks like a loading failure.
 */
export function ModelGuide(props: ModelGuideProps): React.ReactElement {
  const professions = props.professions || [];
  const limit = props.limit || 5;
  const locale = props.locale || docLocale();
  const base = props.currency || 'USD';
  const rates = props.rates || {};
  const onHarness = (h?: string): React.ReactNode => (props.harnessLabel && h ? props.harnessLabel(h) : `on ${h}`);
  let shown = currencyFor(
    props.locale || (typeof document !== 'undefined' && document.documentElement.lang) || locale,
    props.currencyByLang,
  );
  if (shown !== base && rates[shown] == null) shown = base;
  const src = props.source || {};

  const firstProf = professions.filter((p) => !p.disabled)[0] || ({} as GuideProfession);
  const [profHeld, setProfHeld] = React.useState<string | undefined>(props.defaultProfession || firstProf.id);
  const profId = props.profession !== undefined ? props.profession : profHeld;
  const prof = professions.filter((p) => p.id === profId)[0] || firstProf;
  const tasks = prof.tasks || [];
  const [taskHeld, setTaskHeld] = React.useState<string | null | undefined>(
    props.defaultTask || (tasks[0] && tasks[0].id),
  );
  const taskId = props.task !== undefined ? props.task : taskHeld;
  const task = tasks.filter((t) => t.id === taskId)[0] || tasks[0] || ({} as GuideTask);
  const langs = props.languages || [];
  const [langHeld, setLangHeld] = React.useState<string | undefined>(
    props.defaultLanguage || (langs[0] && langs[0].value),
  );
  const lang = props.language !== undefined ? props.language : langHeld;
  const byLang = task.picksByLanguage && lang ? task.picksByLanguage[lang] : undefined;
  const outs = props.outputs || [];
  const [outHeld, setOutHeld] = React.useState<string>(props.defaultOutput || '');
  const outWanted = props.output !== undefined ? props.output : outHeld;
  const byOutput = task.picksByOutput || {};
  // Only the outputs this task is ranked for. One it is not ranked for reads as "anything" rather than
  // persisting across a task change, so switching from slides to a task without slides never shows an
  // empty list or a ranking for a deliverable the task does not make.
  const offered = outs.filter((o) => byOutput[o.value]);
  const out = offered.some((o) => o.value === outWanted) ? outWanted : '';
  const outPool = out ? byOutput[out] : undefined;
  const byOut = outPool ? (lang ? outPool[lang] : outPool[Object.keys(outPool)[0]]) : undefined;
  // A language that is keyed but holds no ranking yet falls back as an absent key does. Truthiness
  // would not: `[]` is truthy, so "ranked for Korean, not yet for Hindi" would render the empty
  // state instead of the language-neutral picks.
  const ranked = (byOut && byOut.length ? byOut : byLang && byLang.length ? byLang : task.picks) || [];
  // The cut counts ranked picks only. A benchmark sits beside the pick it is compared with and is
  // kept while the ranked count is within `limit`, so it never pushes the fifth pick off the list.
  const picks: GuidePick[] = [];
  const rankOf: Record<string, number | null> = {};
  let placed = 0;
  for (const k of ranked) {
    if (k.benchmark) {
      picks.push(k);
      rankOf[k.id] = null;
      continue;
    }
    if (placed >= limit) break;
    placed += 1;
    picks.push(k);
    rankOf[k.id] = placed;
  }

  const [modeHeld, setModeHeld] = React.useState<'simple' | 'advanced'>(props.defaultMode || 'simple');
  const mode = props.mode !== undefined ? props.mode : modeHeld;
  const [pickId, setPickId] = React.useState<string | null>(null);
  const current = picks.filter((k) => k.id === pickId)[0] || picks.filter((k) => !k.benchmark)[0] || picks[0];
  // A level the reader tries on the open pick, or null for the ranked one; reset when the pick changes.
  const [tried, setTried] = React.useState<{ id: string | null; level: number | null }>({ id: null, level: null });
  const tryLevel = current && tried.id === current.id ? tried.level : null;
  function tryEffort(l: EffortLevel): void {
    const other = l.pick && current && l.pick !== current.id ? picks.filter((k) => k.id === l.pick)[0] : null;
    if (other) {
      setPickId(other.id);
      setTried({ id: null, level: null });
      return;
    }
    setTried({
      id: current.id,
      level: l.level == null || l.level === (current.effort || {}).level ? null : l.level,
    });
  }
  const w: GuideWeights =
    task.weights || props.weights || { quality: 0.55, reliability: 0.25, speed: 0.05, cost: 0.15 };
  const headId = useStableId('rr-guide');
  const adv = mode === 'advanced';
  const glance = props.summary === 'glance' ? guideGlance(picks, w) : null;
  const glanceLabels = props.glanceLabels || {};

  /** The effort as a meter, or with `summary="glance"` as words: "Thinking: High". */
  function effortMark(e: Effort | undefined, key: string): React.ReactElement | null {
    if (!glance) return React.createElement(EffortMeter, { key, effort: e, unit: props.effortUnit });
    if (!e || !e.label) return null;
    return React.createElement('span', { key, className: 'rr-guide__thinking' }, `${props.thinkingLabel || 'Thinking'}: ${e.label}`);
  }

  function glanceTags(k: GuidePick): React.ReactElement | null {
    const card = k.sample && k.sample.scorecard;
    const tied = glance && !k.benchmark && glance.tied[k.id];
    const value = glance && !k.benchmark && glance.bestValue === k.id;
    if (!tied && !value && !card) return null;
    const s = card ? scoreOf(card) : null;
    return React.createElement('span', { key: 'g', className: 'rr-guide__glancetags' }, [
      card && s
        ? React.createElement(
            Badge,
            { key: 's', tone: s.passed === s.of ? 'success' : 'neutral', size: 'sm' },
            `${(props.sampleLabels || {}).scorecard || 'Scorecard'} ${scoreText(card, props.sampleLabels || {})}`,
          )
        : null,
      tied ? React.createElement(Badge, { key: 't', tone: 'neutral', size: 'sm' }, props.tiedLabel || 'Tied with #1') : null,
      value ? React.createElement(Badge, { key: 'v', tone: 'success', size: 'sm' }, props.bestValueLabel || 'Best value') : null,
    ]);
  }

  function choose(pid: string, tid: string | null): void {
    if (props.profession === undefined) setProfHeld(pid);
    if (props.task === undefined) setTaskHeld(tid);
    setPickId(null);
    if (props.onTaskChange) props.onTaskChange(tid, pid);
  }

  function chooseLang(l: string): void {
    if (props.language === undefined) setLangHeld(l);
    setPickId(null);
    if (props.onLanguageChange) props.onLanguageChange(l);
  }

  function chooseOutput(o: string): void {
    if (props.output === undefined) setOutHeld(o);
    setPickId(null);
    if (props.onOutputChange) props.onOutputChange(o);
  }

  function benchBadge(k: GuidePick, key: string): React.ReactElement | null {
    return k.benchmark
      ? React.createElement(Badge, { key, tone: 'neutral', size: 'sm' }, props.benchmarkLabel || 'Benchmark')
      : null;
  }

  /** "A → B" for a pick that runs models in sequence; the model's own name otherwise. */
  function pickName(k: GuidePick): string | undefined {
    // Length, not length > 1: `steps` makes `model` optional, so a one-step pick would otherwise
    // render an empty name here and in the output pane's aria-label.
    return k.steps && k.steps.length ? k.steps.map((st) => st.model).join(' \u2192 ') : k.model;
  }

  function kindBadge(kind: GuideKind | undefined, key: string): React.ReactElement | null {
    if (!kind) return null;
    const label = (props.kindLabels && props.kindLabels[kind]) || KIND_LABEL[kind];
    return React.createElement(Badge, { key, tone: KIND_TONE[kind], size: 'sm' }, label);
  }

  function soonBadge(k: GuidePick, key: string): React.ReactElement | null {
    return k.comingSoon
      ? React.createElement(Badge, { key, tone: 'info', size: 'sm' }, props.comingSoonLabel || 'Coming soon')
      : null;
  }

  function evidence(k: GuidePick): React.ReactNode[] {
    const out: React.ReactNode[] = [];
    if (k.steps && k.steps.length > 1) {
      out.push(
        React.createElement(
          'ol',
          { key: 'steps', className: 'rr-guide__steps' },
          k.steps.map((st, j) =>
            React.createElement('li', { key: j }, [
              React.createElement('span', { key: 'm', className: 'rr-guide__stepname' }, st.model),
              st.role ? React.createElement('span', { key: 'r', className: 'rr-guide__steprole' }, st.role) : null,
              st.effort ? effortMark(st.effort, 'e') : null,
            ]),
          ),
        ),
      );
    }
    if (k.tools && k.tools.length) {
      out.push(
        React.createElement('div', { key: 'tools', className: 'rr-guide__tools' }, [
          React.createElement('p', { key: 'l', className: 'rr-guide__label' }, props.toolsLabel || 'Tools it uses'),
          React.createElement(
            'ul',
            { key: 'u', className: 'rr-guide__tags' },
            k.tools.map((t, j) =>
              React.createElement(
                'li',
                { key: j, className: cx('rr-guide__tag', t.soon && 'is-soon', t.missing && 'is-missing') },
                [
                  t.label,
                  t.soon
                    ? React.createElement('span', { key: 's' }, ` \u00b7 ${props.comingSoonLabel || 'Coming soon'}`)
                    : null,
                  t.missing
                    ? React.createElement('span', { key: 'x' }, ` \u00b7 ${props.missingLabel || 'not available'}`)
                    : null,
                ],
              ),
            ),
          ),
        ]),
      );
    }
    return out;
  }

  function sources(k: GuidePick): React.ReactElement | null {
    if (!k.sources || !k.sources.length) return null;
    return React.createElement('details', { key: 'src', className: 'rr-guide__sources' }, [
      React.createElement('summary', { key: 's' }, [
        props.sourcesLabel || 'Sources',
        React.createElement('span', { key: 'n', className: 'rr-guide__srcn' }, ` (${k.sources.length})`),
      ]),
      React.createElement(
        'ul',
        { key: 'u' },
        k.sources.map((src, j) =>
          React.createElement('li', { key: j }, [
            kindBadge(src.kind, 'k'),
            React.createElement(
              'span',
              { key: 'l', className: 'rr-guide__srcl' },
              src.url
                ? React.createElement('a', { href: src.url, target: '_blank', rel: 'noopener noreferrer' }, src.label)
                : src.label,
            ),
            src.value != null ? React.createElement('span', { key: 'v', className: 'rr-guide__srcv' }, src.value) : null,
            src.date ? React.createElement('span', { key: 'd', className: 'rr-guide__srcd' }, src.date) : null,
          ]),
        ),
      ),
    ]);
  }

  function setMode(m: 'simple' | 'advanced'): void {
    if (props.mode === undefined) setModeHeld(m);
    if (props.onModeChange) props.onModeChange(m);
  }

  function modeSwitch(): React.ReactElement {
    return React.createElement(
      'div',
      // Returned into a children array, so it carries its own key.
      { key: 'mode', className: 'rr-guide__mode', role: 'radiogroup', 'aria-label': props.modeLabel || 'View' },
      (
        [
          ['simple', props.simpleLabel || 'Simple'],
          ['advanced', props.advancedLabel || 'Advanced'],
        ] as Array<['simple' | 'advanced', React.ReactNode]>
      ).map((m) =>
        React.createElement(
          'button',
          {
            key: m[0],
            type: 'button',
            role: 'radio',
            'aria-checked': String(mode === m[0]),
            className: 'rr-guide__modeopt',
            onClick: () => setMode(m[0]),
          },
          m[1],
        ),
      ),
    );
  }

  function row(k: GuidePick): React.ReactElement {
    const on = current && k.id === current.id;
    const total = guideTotal(k, w);
    const rank = rankOf[k.id];
    return React.createElement(
      'li',
      { key: k.id },
      React.createElement(
        'button',
        {
          type: 'button',
          className: cx('rr-guide__row', k.benchmark && 'is-benchmark'),
          'aria-pressed': String(on),
          onClick: () => setPickId(k.id),
        },
        [
          // A benchmark has no place of its own; a dash keeps the column aligned without implying one.
          rank != null
            ? React.createElement('span', { key: 'r', className: 'rr-model__rank' }, String(rank))
            : React.createElement('span', { key: 'r', className: 'rr-model__rank', 'aria-hidden': 'true' }, '\u2013'),
          React.createElement('span', { key: 'b', className: 'rr-model__body' }, [
            React.createElement('span', { key: 'n', className: 'rr-model__name' }, [
              React.createElement('span', { key: 'm' }, pickName(k)),
              React.createElement('span', { key: 'o', className: 'rr-model__on' }, onHarness(k.harness)),
              soonBadge(k, 'c'),
              benchBadge(k, 'bm'),
            ]),
            glance
              ? React.createElement(GlanceStrip, { key: 'e', pick: k, glance, labels: glanceLabels })
              : React.createElement(EffortMeter, { key: 'e', effort: k.effort, unit: props.effortUnit }),
            glanceTags(k),
            !adv && k.why ? React.createElement('span', { key: 'w', className: 'rr-model__why' }, k.why) : null,
            adv && k.score
              ? React.createElement(
                  'span',
                  { key: 's', className: 'rr-guide__bar', 'aria-hidden': 'true' },
                  GUIDE_DIMS.map((d) =>
                    React.createElement('span', {
                      key: d.key,
                      className: `rr-guide__seg rr-guide__seg--${d.key}`,
                      style: {
                        width: `${(w[d.key] || 0) * ((k.score as Record<string, number>)[d.key] || 0)}%`,
                      },
                    }),
                  ),
                )
              : null,
          ]),
          React.createElement('span', { key: 'p', className: 'rr-guide__rowend' }, [
            adv && total != null
              ? React.createElement('span', { key: 's', className: 'rr-guide__score' }, [
                  React.createElement('b', { key: 'v' }, total.toFixed(1)),
                  k.score && k.score.ci
                    ? React.createElement('span', { key: 'c' }, ` ±${k.score.ci.toFixed(1)}`)
                    : null,
                ])
              : React.createElement('span', { key: 'm', className: 'rr-model__price' }, [
                  guidePrice(k.monthly, shown, base, rates, locale),
                  React.createElement('span', { key: 'u', className: 'rr-model__per' }, props.perLabel || '/mo'),
                ]),
            adv
              ? React.createElement('span', { key: 'x', className: 'rr-guide__small' }, [
                  guidePrice(k.monthly, shown, base, rates, locale),
                  React.createElement('span', { key: 'u' }, props.perLabel || '/mo'),
                ])
              : null,
          ]),
        ],
      ),
    );
  }

  function breakdown(k: GuidePick): React.ReactElement {
    const total = guideTotal(k, w);
    const s = (k.score || {}) as Record<string, number>;
    const m = k.measured || {};
    const body: React.ReactNode[] = GUIDE_DIMS.map((d) =>
      React.createElement('tr', { key: d.key }, [
        React.createElement('th', { key: 'a', scope: 'row' }, [
          React.createElement('span', { key: 'k', className: `rr-guide__key rr-guide__seg--${d.key}` }),
          d.label,
        ]),
        React.createElement('td', { key: 'b' }, m[d.key] || '-'),
        React.createElement(
          'td',
          { key: 'c', className: 'rr-guide__num' },
          s[d.key] != null ? s[d.key].toFixed(1) : '-',
        ),
        React.createElement('td', { key: 'd', className: 'rr-guide__num' }, `× ${(w[d.key] || 0).toFixed(2)}`),
        React.createElement(
          'td',
          { key: 'e', className: 'rr-guide__num' },
          ((w[d.key] || 0) * (s[d.key] || 0)).toFixed(1),
        ),
      ]),
    );
    body.push(
      React.createElement('tr', { key: 't', className: 'rr-guide__totalrow' }, [
        React.createElement('th', { key: 'a', scope: 'row' }, 'Score'),
        React.createElement('td', { key: 'b' }, s.ci ? `95% interval ±${s.ci.toFixed(1)}` : ''),
        React.createElement('td', { key: 'c' }),
        React.createElement('td', { key: 'd' }),
        React.createElement(
          'td',
          { key: 'e', className: 'rr-guide__num' },
          total != null ? total.toFixed(1) : '-',
        ),
      ]),
    );
    return React.createElement('div', { key: 'calc', className: 'rr-guide__calc' }, [
      React.createElement(
        'p',
        { key: 'h', className: 'rr-guide__label' },
        props.calcLabel || 'How this score was calculated',
      ),
      React.createElement(
        'div',
        { key: 't', className: 'rr-guide__tablewrap' },
        React.createElement('table', { className: 'rr-guide__table' }, [
          React.createElement(
            'thead',
            { key: 'h' },
            React.createElement(
              'tr',
              null,
              ['Dimension', 'Measured', 'Score', 'Weight', 'Points'].map((c, i) =>
                React.createElement(
                  'th',
                  { key: i, scope: 'col', className: i > 1 ? 'rr-guide__num' : null },
                  c,
                ),
              ),
            ),
          ),
          React.createElement('tbody', { key: 'b' }, body),
        ]),
      ),
      task.formula
        ? React.createElement(
            'p',
            { key: 'f', className: 'rr-guide__formula' },
            React.createElement('code', null, task.formula),
          )
        : null,
      React.createElement(
        'dl',
        { key: 'd', className: 'rr-guide__facts' },
        (k.facts || []).map((f, i) =>
          React.createElement('div', { key: i }, [
            React.createElement('dt', { key: 't' }, f[0]),
            React.createElement('dd', { key: 'd' }, f[1]),
          ]),
        ),
      ),
      k.note
        ? React.createElement('p', { key: 'n', className: 'rr-guide__note' }, [
            React.createElement('b', { key: 'b' }, `${props.noteLabel || 'Graders’ note'} `),
            k.note,
          ])
        : null,
    ]);
  }

  function detail(k: GuidePick | undefined): React.ReactElement | null {
    if (!k) return null;
    const sample = k.sample || {};
    const rank = rankOf[k.id];
    // Returned into the grid's children array beside the list, so it needs a key of its own.
    return React.createElement('div', { key: 'detail', className: 'rr-guide__detail', 'aria-live': 'polite' }, [
      React.createElement('div', { key: 'h', className: 'rr-guide__dhead' }, [
        React.createElement('div', { key: 'a' }, [
          React.createElement('p', { key: 'r', className: 'rr-guide__rank' }, [
            rank != null
              ? props.rankLabel
                ? props.rankLabel(rank, task.label || '')
                : `#${rank} for ${(task.label || '').toLowerCase()}`
              : props.benchmarkLabel || 'Benchmark',
            rank === 1
              ? React.createElement(
                  Badge,
                  { key: 'b', tone: 'brand', size: 'sm' },
                  props.topLabel || 'Best pick',
                )
              : null,
          ]),
          React.createElement('h3', { key: 'n', className: 'rr-guide__dname' }, [
            pickName(k),
            React.createElement('span', { key: 'o' }, [' ', onHarness(k.harness)]),
          ]),
          effortMark(k.effort, 'e'),
          k.kind || k.comingSoon || (k.flags && k.flags.length)
            ? React.createElement('p', { key: 'k', className: 'rr-guide__badges' }, [
                kindBadge(k.kind, 'k'),
                soonBadge(k, 'c'),
                ...(k.flags || []).map((f, j) =>
                  React.createElement(Badge, { key: `f${j}`, tone: 'neutral', size: 'sm' }, f),
                ),
              ])
            : null,
        ]),
        React.createElement('div', { key: 'p', className: 'rr-guide__cost' }, [
          // A pick carrying only `monthlyRange` has no single figure, so the unit is suppressed with
          // it; printing "/mo" alone reads as a missing number.
          k.monthly != null
            ? React.createElement('span', { key: 'v', className: 'rr-guide__costv' }, [
                guidePrice(k.monthly, shown, base, rates, locale),
                React.createElement('span', { key: 'u', className: 'rr-model__per' }, props.perLabel || '/mo'),
              ])
            : null,
          task.usage
            ? React.createElement('span', { key: 'u', className: 'rr-guide__costu' }, task.usage)
            : null,
          k.monthlyRange
            ? React.createElement('span', { key: 'r', className: 'rr-guide__costr' }, [
                `${props.rangeLabel || 'Likely between'} `,
                React.createElement(
                  'span',
                  { key: 'a' },
                  guidePrice(k.monthlyRange[0], shown, base, rates, locale),
                ),
                ' \u2013 ',
                React.createElement(
                  'span',
                  { key: 'b' },
                  guidePrice(k.monthlyRange[1], shown, base, rates, locale),
                ),
              ])
            : null,
          k.monthlyKind ? kindBadge(k.monthlyKind, 'mk') : null,
        ]),
      ]),
      k.why ? React.createElement('p', { key: 'w', className: 'rr-guide__why' }, k.why) : null,
      ...evidence(k),
      // Trying another effort prices a pick for use here; a benchmark is not on offer here.
      !k.benchmark && k.efforts && k.efforts.length > 1
        ? React.createElement(EffortTune, {
            key: 'e',
            className: 'rr-guide__tune',
            pick: k,
            place: rank || 1,
            chosen: tryLevel,
            onSelect: tryEffort,
            per: props.perLabel,
            note: props.effortNote,
            labels: {
              effort: props.effortLabel || 'Try another effort',
              ranked: props.rankedLabel,
              reset: props.resetEffortLabel,
            },
            price: (m: number) => guidePrice(m, shown, base, rates, locale, 'rr-effort__price'),
            title: props.effortHint || 'The sample below was written at the ranked effort.',
          })
        : null,
      // A run with a task card: what it was given and asked, how it did, the answer folded, what it took.
      sample.card
        ? React.createElement('div', { key: 's', className: 'rr-guide__sample rr-guide__sample--card' }, [
            React.createElement(TaskCard, { key: 'c', card: sample.card, prompt: task.prompt || sample.prompt, labels: props.sampleLabels || {} }),
            sample.scorecard
              ? React.createElement(Scorecard, { key: 's', card: sample.scorecard, labels: props.sampleLabels || {} })
              : null,
            sample.output != null
              ? React.createElement('details', { key: 'a', className: 'rr-guide__answer' }, [
                  React.createElement('summary', { key: 's' }, (props.sampleLabels || {}).fullAnswer || 'Read the full answer'),
                  React.createElement(
                    'div',
                    {
                      key: 't',
                      className: cx('rr-guide__output', typeof sample.output !== 'string' && 'rr-guide__output--rich'),
                      tabIndex: 0,
                      role: 'region',
                      'aria-label': `${props.outputLabel || 'What it wrote'}: ${pickName(k)}`,
                    },
                    sample.output,
                  ),
                ])
              : null,
            sample.run && sample.run.length
              ? React.createElement(RunFacts, { key: 'r', facts: sample.run, label: (props.sampleLabels || {}).run })
              : null,
            sample.more ? React.createElement('p', { key: 'm', className: 'rr-guide__cut' }, sample.more) : null,
          ])
        : // No run to show (a guide ranked from published benchmarks): no empty prompt and output boxes.
          !(task.prompt || sample.prompt || sample.output) ? null : React.createElement('div', { key: 's', className: 'rr-guide__sample' }, [
        React.createElement('div', { key: 'q', className: 'rr-guide__turn' }, [
          React.createElement(
            'p',
            { key: 'l', className: 'rr-guide__label' },
            props.promptLabel || 'What it was asked',
          ),
          React.createElement(
            'blockquote',
            { key: 't', className: 'rr-guide__prompt' },
            task.prompt || sample.prompt,
          ),
        ]),
        React.createElement('div', { key: 'a', className: 'rr-guide__turn' }, [
          React.createElement('p', { key: 'l', className: 'rr-guide__label' }, [
            props.outputLabel || 'What it wrote',
            sample.illustrative
              ? React.createElement(
                  'span',
                  { key: 'i', className: 'rr-guide__illus' },
                  props.illustrativeLabel || 'Sample output, illustrative',
                )
              : null,
          ]),
          React.createElement(
            'div',
            {
              key: 't',
              // Rendered markup (a consumer's markdown, say) sets its own line breaks; only plain text keeps
              // its newlines as written.
              className: cx('rr-guide__output', sample.output != null && typeof sample.output !== 'string' && 'rr-guide__output--rich'),
              tabIndex: 0,
              role: 'region',
              'aria-label': `${props.outputLabel || 'What it wrote'}: ${pickName(k)}`,
            },
            sample.output,
          ),
          sample.more ? React.createElement('p', { key: 'm', className: 'rr-guide__cut' }, sample.more) : null,
        ]),
      ]),
      adv ? breakdown(k) : null,
      sources(k),
      React.createElement('div', { key: 'c', className: 'rr-guide__actions' }, [
        k.benchmark
          ? React.createElement(
              'p',
              { key: 'b', className: 'rr-guide__benchnote' },
              props.benchmarkNote || 'Shown for comparison. It runs on its own product, not from here.',
            )
          : React.createElement(
          Button,
          {
            key: 'b',
            variant: 'primary',
            disabled: k.unavailable ? true : undefined,
            onClick: () => {
              const lv = tryLevel != null && k.efforts ? k.efforts.filter((l) => l.level === tryLevel)[0] : null;
              if (props.onUse) props.onUse(k, { profession: prof, task, effort: lv || null });
            },
          },
          props.useLabel || 'Use this in the chat',
        ),
        !k.benchmark && k.unavailable
          ? React.createElement('p', { key: 'u', className: 'rr-guide__unavail' }, k.unavailable)
          : null,
        k.runHref
          ? React.createElement('a', { key: 'a', className: 'rr-guide__runlink', href: k.runHref }, [
              props.runLabel || 'See the full run',
              React.createElement(
                'span',
                { key: 'i', 'aria-hidden': 'true' },
                icons.arrowRight({ width: 14, height: 14 }),
              ),
            ])
          : null,
      ]),
    ]);
  }

  /** A monthly price as plain text, for places a Money element cannot go (SVG text, accessible names). */
  function priceText(m: number): string {
    const amt = shown === base ? m : m * rates[shown];
    return new Intl.NumberFormat(locale, { style: 'currency', currency: shown, maximumFractionDigits: 0 }).format(amt);
  }

  /**
   * The ranked list. Bare, as the reference has it, unless the strip or the chart is on: those need a column
   * to sit in, with the strip's heads and the chart above the rows.
   */
  function list(): React.ReactElement {
    const ol = React.createElement(
      'ol',
      { key: 'l', className: 'rr-guide__list', 'aria-label': task.title || task.label },
      picks.map((k) => row(k)),
    );
    const showMap = adv && props.map;
    if (!glance && !showMap) return ol;
    return React.createElement('div', { key: 'l', className: 'rr-guide__col' }, [
      showMap
        ? React.createElement(GuideMap, {
            key: 'm',
            picks: picks.map((k) => ({ id: k.id, name: pickName(k) || k.id, score: k.score, monthly: k.monthly, benchmark: k.benchmark })),
            rankOf,
            current: current && current.id,
            onSelect: (id: string) => setPickId(id),
            price: priceText,
            labels: props.mapLabels || {},
          })
        : null,
      glance ? React.createElement(GlanceHead, { key: 'h', labels: glanceLabels }) : null,
      ol,
    ]);
  }

  const meta = [src.name, src.edition, src.note].filter(Boolean).join(' · ');

  return React.createElement(
    'section',
    { className: cx('rr-guide', adv && 'rr-guide--advanced', props.className), 'aria-labelledby': headId },
    [
      React.createElement('div', { key: 'top', className: 'rr-guide__top' }, [
        React.createElement('div', { key: 'a' }, [
          React.createElement(
            'h2',
            { key: 't', id: headId, className: 'rr-guide__title' },
            props.title || 'Model Guide',
          ),
          props.lede ? React.createElement('p', { key: 'l', className: 'rr-guide__lede' }, props.lede) : null,
        ]),
        modeSwitch(),
      ]),
      React.createElement('div', {
        key: 'ask',
        className: cx('rr-guide__ask', langs.length > 1 && 'rr-guide__ask--lang', outs.length > 0 && 'rr-guide__ask--out'),
      }, [
        React.createElement(Select, {
          key: 'p',
          size: 'sm',
          label: props.professionLabel || 'I work as',
          value: prof.id,
          options: professions.map((p) => ({
            value: p.id,
            label: p.label as string,
            disabled: !!p.disabled,
          })),
          onChange: (event: unknown) => {
            const target = (event as { target: { value: string } }).target;
            const next = professions.filter((p) => p.id === target.value)[0];
            choose(target.value, next && next.tasks && next.tasks[0] ? next.tasks[0].id : null);
          },
        }),
        React.createElement(Select, {
          key: 't',
          size: 'sm',
          label: props.taskLabel || 'I want to',
          value: task.id,
          options: tasks.map((t) => ({ value: t.id, label: t.label as string })),
          onChange: (event: unknown) => {
            const target = (event as { target: { value: string } }).target;
            choose(prof.id, target.value);
          },
        }),
        outs.length > 0
          ? React.createElement(Select, {
              key: 'o',
              size: 'sm',
              label: props.deliverableLabel || 'I need',
              value: out,
              // Disabled rather than hidden when the task is ranked for no particular output, so the row
              // keeps its shape from task to task.
              disabled: offered.length === 0,
              options: [{ value: '', label: props.anyOutputLabel || 'Anything' }].concat(
                offered.map((o) => ({ value: o.value, label: o.label })),
              ),
              onChange: (event: unknown) => chooseOutput((event as { target: { value: string } }).target.value),
            })
          : null,
        langs.length > 1
          ? React.createElement(Select, {
              key: 'g',
              size: 'sm',
              label: props.languageLabel || 'In',
              value: lang,
              options: langs.map((l) => ({ value: l.value, label: l.label })),
              onChange: (event: unknown) => chooseLang((event as { target: { value: string } }).target.value),
            })
          : null,
      ]),
      React.createElement('div', { key: 'head', className: 'rr-guide__head' }, [
        React.createElement(
          'p',
          { key: 't', className: 'rr-guide__rtitle' },
          task.title || `Top ${limit} · ${prof.label || ''} · ${task.label || ''}`,
        ),
        React.createElement(
          'p',
          { key: 'm', className: 'rr-guide__meta' },
          [meta, task.basis].filter(Boolean).join(' · '),
        ),
      ]),
      picks.length
        ? React.createElement('div', { key: 'grid', className: 'rr-guide__grid' }, [
            list(),
            detail(current),
          ])
        : React.createElement('div', { key: 'e', className: 'rr-guide__empty' }, [
            React.createElement(
              'p',
              { key: 't', className: 'rr-guide__emptyt' },
              props.emptyTitle || 'Not ranked yet',
            ),
            React.createElement(
              'p',
              { key: 'd' },
              task.emptyText ||
                props.emptyText ||
                'This task is being tested. Its top five publish with the next monthly edition.',
            ),
          ]),
      props.method
        ? React.createElement('details', { key: 'm', className: 'rr-guide__method', open: adv || undefined }, [
            React.createElement('summary', { key: 's' }, props.methodLabel || 'How Redrob tests and ranks'),
            React.createElement('div', { key: 'b' }, props.method),
          ])
        : null,
    ],
  );
}

export default ModelGuide;
