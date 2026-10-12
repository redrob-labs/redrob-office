import * as React from 'react';
import { cx } from '../../internal/cx';
import { CheckHead } from '../../internal/check';
import { CHALLENGE_KINDS } from '../../internal/safeguards';
import { icons } from '../../icons';
import { Badge, BadgeProps } from '../Badge/Badge';
import { Button } from '../Button/Button';
import { Streaming } from '../Streaming/Streaming';
export interface ChallengeReportProps {
  /** The conclusion under challenge, in the answer's words. */
  claim?: React.ReactNode;
  sides?: { for?: React.ReactNode; against?: React.ReactNode; judge?: React.ReactNode };
  rounds?: Array<{ for: React.ReactNode; against: React.ReactNode }>;
  state?: 'running' | 'done';
  /** Rounds shown so far while running. */
  shown?: number;
  of?: number;
  took?: React.ReactNode;
  verdict?: Array<{ kind: 'broke' | 'held' | 'changed' | string; text: React.ReactNode }>;
  unsettled?: React.ReactNode;
  applied?: boolean;
  onApply?: () => void;
  onRerun?: () => void;
  onClose?: () => void;
  onStop?: () => void;
  title?: React.ReactNode;
  label?: string;
  claimLabel?: string;
  forLabel?: string;
  againstLabel?: string;
  judgeLabel?: string;
  roundLabel?: string;
  verdictLabel?: string;
  unsettledLabel?: string;
  applyLabel?: string;
  appliedLabel?: string;
  rerunLabel?: string;
  runningLabel?: string;
  progressLabel?: string;
  kindLabels?: Record<string, string>;
  className?: string;
}
/**
 * The answer's conclusion under pressure: one AI argues for it, one against, for a few rounds, and a third says
 * what held up.
 *
 * Each side is named, and the rounds are shown in full rather than summarised, so a reader can see how a point
 * broke instead of being told that it did. What nobody settled is said plainly, for a person to decide: a check
 * that always reaches a verdict is a check pretending to know more than it does.
 *
 * While running, the rounds arrive one at a time under a Streaming line that can stop it.
 */
export function ChallengeReport(props: ChallengeReportProps): React.ReactElement {
  const rounds = props.rounds || [];
  const running = props.state === 'running';
  const shown = props.shown != null ? Math.min(props.shown, rounds.length) : rounds.length;
  const sides = props.sides || {};
  const meta = running
    ? props.progressLabel ||
      `Round ${Math.min(shown + 1, rounds.length || 1)} of ${props.of || rounds.length || 3}`
    : props.took;
  const kinds: Record<string, string> = { ...CHALLENGE_KINDS, ...(props.kindLabels || {}) };
  function side(tone: BadgeProps['tone'], label: string, who: React.ReactNode): React.ReactNode {
    return who
      ? React.createElement('span', { key: label }, [
          React.createElement(Badge, { key: 'b', tone, size: 'sm' }, label),
          ' ',
          who,
        ])
      : null;
  }
  const forLabel = props.forLabel || 'For';
  const againstLabel = props.againstLabel || 'Against';
  return React.createElement(
    'section',
    { className: cx('rr-check rr-challenge', props.className), 'aria-label': props.label || 'Challenge' },
    [
      React.createElement(CheckHead, {
        key: 'h',
        icon: icons.scales({ width: 16, height: 16 }),
        name: props.title || 'Challenge',
        meta,
        onClose: props.onClose,
      }),
      props.claim
        ? React.createElement('div', { key: 'c', className: 'rr-challenge__claim' }, [
            React.createElement(
              'p',
              { key: 'k', className: 'rr-check__key' },
              props.claimLabel || 'The conclusion under challenge',
            ),
            React.createElement('p', { key: 'b', className: 'rr-challenge__motion' }, props.claim),
          ])
        : null,
      React.createElement('p', { key: 's', className: 'rr-challenge__sides' }, [
        side('info', forLabel, sides.for),
        side('warning', againstLabel, sides.against),
        side('neutral', props.judgeLabel || 'Judge', sides.judge),
      ]),
      shown
        ? React.createElement(
            'ol',
            { key: 'r', className: 'rr-challenge__rounds' },
            rounds.slice(0, shown).map((r, i) =>
              React.createElement('li', { key: i }, [
                React.createElement(
                  'span',
                  { key: 'n', className: 'rr-challenge__n' },
                  `${props.roundLabel || 'Round'} ${i + 1}`,
                ),
                React.createElement('div', { key: 'f', className: 'rr-challenge__side rr-challenge__side--for' }, [
                  React.createElement('span', { key: 'l', className: 'rr-visually-hidden' }, `${forLabel}: `),
                  r.for,
                ]),
                React.createElement(
                  'div',
                  { key: 'a', className: 'rr-challenge__side rr-challenge__side--against' },
                  [React.createElement('span', { key: 'l', className: 'rr-visually-hidden' }, `${againstLabel}: `), r.against],
                ),
              ]),
            ),
          )
        : null,
      running
        ? React.createElement(Streaming, {
            key: 'st',
            state: 'thinking',
            label:
              props.runningLabel ||
              (shown < rounds.length
                ? `Round ${shown + 1}: both sides are writing`
                : 'The judge is weighing the rounds'),
            onStop: props.onStop || props.onClose,
          })
        : null,
      !running && props.verdict
        ? React.createElement('div', { key: 'v', className: 'rr-challenge__verdict' }, [
            React.createElement('p', { key: 't', className: 'rr-challenge__vt' }, props.verdictLabel || 'What held up'),
            React.createElement(
              'ul',
              { key: 'l' },
              props.verdict.map((v, i) =>
                React.createElement('li', { key: i }, [
                  React.createElement('b', { key: 'b' }, `${kinds[v.kind] || v.kind}: `),
                  v.text,
                ]),
              ),
            ),
            props.unsettled
              ? React.createElement('p', { key: 'u', className: 'rr-challenge__open' }, [
                  React.createElement('b', { key: 'b' }, `${props.unsettledLabel || 'Not settled'}: `),
                  props.unsettled,
                ])
              : null,
          ])
        : null,
      !running && (props.onApply || props.applied)
        ? React.createElement(
            'div',
            { key: 'a', className: 'rr-check__act' },
            props.applied
              ? [
                  React.createElement('span', { key: 's', className: 'rr-check__done' }, [
                    React.createElement(
                      React.Fragment,
                      { key: 'i' },
                      icons.check({ width: 14, height: 14, 'aria-hidden': 'true' }),
                    ),
                    props.appliedLabel || 'Added to the answer',
                  ]),
                ]
              : [
                  React.createElement(
                    Button,
                    { key: 'p', variant: 'primary', onClick: props.onApply },
                    props.applyLabel || 'Add this to the answer',
                  ),
                  props.onRerun
                    ? React.createElement(
                        Button,
                        { key: 'n', variant: 'ghost', onClick: props.onRerun },
                        props.rerunLabel || 'Run it again',
                      )
                    : null,
                ],
          )
        : null,
    ],
  );
}
export default ChallengeReport;
