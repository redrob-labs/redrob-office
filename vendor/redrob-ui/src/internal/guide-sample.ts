import * as React from 'react';
import { cx } from './cx';

/**
 * One real run of a task, shown as a reader needs it: what the model was given and asked (the task card), how
 * the answer did against a checklist (the scorecard), the answer itself folded away, and what the run took.
 * A scorecard is a result for one answer, so it is only ever shown beside that answer.
 */

export interface GuideTaskCard {
  /** One sentence: the situation and the ask. */
  brief: React.ReactNode;
  /** Each input the model was given. */
  given?: React.ReactNode[];
  /** Each deliverable it was asked for, in the prompt's order. */
  asked?: React.ReactNode[];
  /** The length and format asked for. */
  limit?: React.ReactNode;
  /** The kinds of difficulty, never the answer. */
  hard?: React.ReactNode;
  /** A line under "given", e.g. that everything was in the message. */
  note?: React.ReactNode;
}

export type GuideVerdict = 'pass' | 'partial' | 'miss';

export interface GuideScorecard {
  lines: Array<{ check: React.ReactNode; verdict: GuideVerdict; quote?: React.ReactNode }>;
  /** How the lines were graded, e.g. "Graded by two models from different labs". */
  note?: React.ReactNode;
}

export interface GuideSampleLabels {
  task?: string;
  given?: string;
  asked?: string;
  hard?: string;
  prompt?: string;
  scorecard?: string;
  /** "4 of 6", with the partial count when there is one. */
  score?: (passed: number, of: number, partial: number) => string;
  verdicts?: Partial<Record<GuideVerdict, string>>;
  fullAnswer?: string;
  run?: string;
}

const MARK: Record<GuideVerdict, string> = { pass: '\u2713', partial: '\u25D0', miss: '\u2717' };
const VERDICT: Record<GuideVerdict, string> = { pass: 'Passed', partial: 'Partly', miss: 'Missed' };

export function scoreOf(card: GuideScorecard): { passed: number; partial: number; of: number } {
  return {
    passed: card.lines.filter((l) => l.verdict === 'pass').length,
    partial: card.lines.filter((l) => l.verdict === 'partial').length,
    of: card.lines.length,
  };
}

export function scoreText(card: GuideScorecard, labels: GuideSampleLabels): string {
  const s = scoreOf(card);
  if (labels.score) return labels.score(s.passed, s.of, s.partial);
  return `${s.passed} of ${s.of}${s.partial ? `, ${s.partial} partly` : ''}`;
}

function list(key: string, label: string, items: React.ReactNode[] | undefined, ordered?: boolean): React.ReactNode {
  if (!items || !items.length) return null;
  return React.createElement('div', { key, className: 'rr-guide__cardpart' }, [
    React.createElement('p', { key: 'l', className: 'rr-guide__label' }, label),
    React.createElement(
      ordered ? 'ol' : 'ul',
      { key: 'u', className: 'rr-guide__cardlist' },
      items.map((item, i) => React.createElement('li', { key: i }, item)),
    ),
  ]);
}

/** The task as a reader needs it, with the exact prompt one click away. */
export function TaskCard(props: { card: GuideTaskCard; prompt?: React.ReactNode; labels: GuideSampleLabels }): React.ReactElement {
  const { card, labels } = props;
  return React.createElement('div', { className: 'rr-guide__card' }, [
    React.createElement('p', { key: 'l', className: 'rr-guide__label' }, labels.task || 'The task'),
    React.createElement('p', { key: 'b', className: 'rr-guide__brief' }, card.brief),
    list('g', labels.given || 'What the model was given', card.given),
    card.note ? React.createElement('p', { key: 'n', className: 'rr-guide__cardnote' }, card.note) : null,
    list('a', labels.asked || 'What it was asked to deliver', card.asked, true),
    card.limit ? React.createElement('p', { key: 'm', className: 'rr-guide__cardnote' }, card.limit) : null,
    card.hard
      ? React.createElement('p', { key: 'h', className: 'rr-guide__hard' }, [
          React.createElement('b', { key: 'b' }, `${labels.hard || 'What makes it hard'}: `),
          card.hard,
        ])
      : null,
    props.prompt
      ? React.createElement('details', { key: 'p', className: 'rr-guide__exact' }, [
          React.createElement('summary', { key: 's' }, labels.prompt || 'See the exact prompt'),
          React.createElement('div', { key: 'b', className: 'rr-guide__prompt' }, props.prompt),
        ])
      : null,
  ]);
}

/** Each check, its verdict in words and a mark, and the passage of the answer that earned it. */
export function Scorecard(props: { card: GuideScorecard; labels: GuideSampleLabels }): React.ReactElement {
  const { card, labels } = props;
  const words = { ...VERDICT, ...(labels.verdicts || {}) };
  return React.createElement('div', { className: 'rr-guide__scorecard' }, [
    React.createElement('p', { key: 'h', className: 'rr-guide__scorehead' }, [
      React.createElement('span', { key: 'l' }, labels.scorecard || 'Scorecard'),
      React.createElement('b', { key: 's' }, scoreText(card, labels)),
    ]),
    React.createElement(
      'ul',
      { key: 'u', className: 'rr-guide__checks' },
      card.lines.map((line, i) =>
        React.createElement('li', { key: i, className: cx('rr-guide__check', `is-${line.verdict}`) }, [
          React.createElement('span', { key: 'm', className: 'rr-guide__mark', 'aria-hidden': 'true' }, MARK[line.verdict]),
          React.createElement('span', { key: 'b', className: 'rr-guide__checkbody' }, [
            React.createElement('span', { key: 'v', className: 'rr-visually-hidden' }, `${words[line.verdict]}: `),
            line.check,
            line.quote ? React.createElement('q', { key: 'q', className: 'rr-guide__quote' }, line.quote) : null,
          ]),
        ]),
      ),
    ),
    card.note ? React.createElement('p', { key: 'n', className: 'rr-guide__cardnote' }, card.note) : null,
  ]);
}

/** What the run took, as label and value pairs: model, level, time, cost, date. */
export function RunFacts(props: { facts: Array<[React.ReactNode, React.ReactNode]>; label?: string }): React.ReactElement {
  return React.createElement('div', { className: 'rr-guide__run' }, [
    React.createElement('p', { key: 'l', className: 'rr-guide__label' }, props.label || 'This run'),
    React.createElement(
      'dl',
      { key: 'd', className: 'rr-guide__runfacts' },
      props.facts.map((f, i) =>
        React.createElement('div', { key: i }, [
          React.createElement('dt', { key: 't' }, f[0]),
          React.createElement('dd', { key: 'd' }, f[1]),
        ]),
      ),
    ),
  ]);
}
