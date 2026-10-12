import * as React from 'react';
import { cx } from '../../internal/cx';
import { CheckHead } from '../../internal/check';
import { FACT_VERDICTS, FactVerdict } from '../../internal/safeguards';
import { icons } from '../../icons';
import { Badge, BadgeProps } from '../Badge/Badge';
import { Button } from '../Button/Button';
import { Evidence } from '../Evidence/Evidence';
import { Finding, FindingProps } from '../Finding/Finding';
import { OpinionAdded } from '../OpinionAdded/OpinionAdded';
export type { FactVerdict } from '../../internal/safeguards';
export interface FactClaim {
  id?: string;
  verdict: FactVerdict;
  claim: React.ReactNode;
  source?: React.ReactNode;
  passage?: React.ReactNode;
  quote?: string;
  note?: React.ReactNode;
}
export interface FactCheckReportProps {
  /** The AI that ran the check. */
  by?: React.ReactNode;
  took?: React.ReactNode;
  summary?: React.ReactNode;
  claims?: FactClaim[];
  reasoning?: FindingProps[];
  missed?: Array<{ by?: string; label?: React.ReactNode; text: React.ReactNode }>;
  fixed?: boolean;
  onFix?: () => void;
  onClose?: () => void;
  defaultOpen?: string | null;
  verdicts?: Partial<Record<FactVerdict, [NonNullable<BadgeProps['tone']> | string, React.ReactNode]>>;
  title?: React.ReactNode;
  label?: string;
  fixLabel?: string;
  fixHint?: React.ReactNode;
  claimLabel?: string;
  sourcesLabel?: string;
  reasoningLabel?: string;
  missedLabel?: string;
  missedItemLabel?: string;
  closeLabel?: string;
  className?: string;
}

const BADGE_TONES = ['neutral', 'brand', 'info', 'success', 'warning', 'danger'] as const;
function badgeTone(tone: string): BadgeProps['tone'] {
  return BADGE_TONES.filter((t) => t === tone)[0] || 'neutral';
}

/**
 * What Fact check found, in three parts: every cited source opened and judged, the reasoning read step by step,
 * and what the answer missed. Named for the AI that ran it.
 *
 * Each source opens in place to the passage it was checked against, so a verdict of "Not in that source" can be
 * verified by the reader rather than taken on trust. What the answer missed is added after it and marked as
 * the checker's, never merged in.
 *
 * Fixing rewrites only the sentences flagged above, and says so beside the button.
 */
export function FactCheckReport(props: FactCheckReportProps): React.ReactElement {
  const claims = props.claims || [];
  const verdicts = { ...FACT_VERDICTS, ...(props.verdicts || {}) };
  const [open, setOpen] = React.useState<string | null>(props.defaultOpen !== undefined ? props.defaultOpen : null);
  const meta = [props.by, props.took].filter(Boolean).join(' · ');
  const reasoning = props.reasoning || [];
  const missed = props.missed || [];
  return React.createElement(
    'section',
    { className: cx('rr-check rr-factcheck', props.className), 'aria-label': props.label || 'Fact check' },
    [
      React.createElement(CheckHead, {
        key: 'h',
        icon: icons.scan({ width: 16, height: 16 }),
        name: props.title || 'Fact check',
        meta,
        onClose: props.onClose,
        closeLabel: props.closeLabel,
      }),
      props.summary ? React.createElement('p', { key: 's', className: 'rr-check__sum' }, props.summary) : null,
      claims.length
        ? React.createElement('p', { key: 'k1', className: 'rr-check__key' }, props.sourcesLabel || 'Sources')
        : null,
      claims.length
        ? React.createElement(
            'ul',
            { key: 'c', className: 'rr-factcheck__claims' },
            claims.map((c, i) => {
              const id = c.id || String(i);
              const v = verdicts[c.verdict] || verdicts.holds;
              const isOpen = open === id;
              const pid = `rr-fc-${id}`;
              return React.createElement('li', { key: id }, [
                React.createElement(
                  'button',
                  {
                    key: 'b',
                    type: 'button',
                    className: 'rr-factcheck__claim',
                    'aria-expanded': String(isOpen),
                    'aria-controls': pid,
                    onClick: () => setOpen(isOpen ? null : id),
                  },
                  [
                    React.createElement(
                      'span',
                      { key: 'v', className: 'rr-factcheck__verdict' },
                      React.createElement(Badge, { tone: badgeTone(v[0]), dot: true, size: 'sm' }, v[1]),
                    ),
                    React.createElement('span', { key: 't', className: 'rr-factcheck__text' }, c.claim),
                    React.createElement(
                      'span',
                      { key: 'c', className: 'rr-factcheck__chev', 'aria-hidden': 'true' },
                      (isOpen ? icons.chevronUp : icons.chevronDown)({ width: 14, height: 14 }),
                    ),
                  ],
                ),
                isOpen
                  ? React.createElement('div', { key: 'e', id: pid, className: 'rr-factcheck__ev' }, [
                      c.passage
                        ? React.createElement(Evidence, {
                            key: 'ev',
                            claimLabel: props.claimLabel || 'The answer says',
                            claim: c.claim,
                            passage: c.passage,
                            quote: c.quote,
                            source: c.source,
                          })
                        : null,
                      c.note ? React.createElement('p', { key: 'n', className: 'rr-factcheck__note' }, c.note) : null,
                    ])
                  : null,
              ]);
            }),
          )
        : null,
      reasoning.length
        ? React.createElement('p', { key: 'k2', className: 'rr-check__key' }, props.reasoningLabel || 'Reasoning')
        : null,
      reasoning.map((f, i) => {
        // Once fixed, every finding not dismissed reads as accepted: the rewrite took it.
        const state: FindingProps['state'] = props.fixed && f.state !== 'dismissed' ? 'accepted' : f.state;
        return React.createElement(Finding, { key: `f${i}`, ...f, state });
      }),
      missed.length
        ? React.createElement('p', { key: 'k3', className: 'rr-check__key' }, props.missedLabel || 'Missed')
        : null,
      missed.map((m, i) =>
        React.createElement(
          OpinionAdded,
          {
            key: `m${i}`,
            by: m.by || (typeof props.by === 'string' ? props.by : undefined),
            label: m.label || props.missedItemLabel,
          },
          m.text,
        ),
      ),
      !props.fixed && props.onFix
        ? React.createElement('div', { key: 'a', className: 'rr-check__act' }, [
            React.createElement(
              Button,
              { key: 'b', variant: 'primary', onClick: props.onFix },
              props.fixLabel || 'Fix the answer',
            ),
            React.createElement(
              'span',
              { key: 's', className: 'rr-check__hint' },
              props.fixHint || 'Rewrites only the sentences flagged above.',
            ),
          ])
        : null,
    ],
  );
}
export default FactCheckReport;
