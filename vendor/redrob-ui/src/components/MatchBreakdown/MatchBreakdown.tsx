import * as React from 'react';
import { cx } from '../../internal/cx';
import { MET_ICON, MET_LABEL } from '../../internal/evidence';
import { icons, IconName } from '../../icons';

export interface MatchItem {
  id?: string | number;
  label?: React.ReactNode;
  state?: 'met' | 'partly' | 'missing' | 'unknown';
  /** What in the sources supports this. */
  evidence?: React.ReactNode;
  /** Shown when there is no evidence either way. */
  noEvidence?: React.ReactNode;
}

export interface MatchBreakdownProps {
  items?: MatchItem[];
  name?: React.ReactNode;
  sub?: React.ReactNode;
  /** Overrides the derived "Meets n of m". */
  verdict?: React.ReactNode;
  className?: string;
  /** Opens the evidence. Without it the evidence is text, not a link. */
  onOpen?: (item: MatchItem, index: number) => void;
}

/**
 * How one candidate measures against each condition, with what the judgement rests on.
 *
 * `unknown` reads "No evidence either way" and is EXCLUDED from the denominator. Absence of evidence is not
 * evidence of absence: counting a gap as a failure turns a missing document into a mark against a person, and
 * that is the exact harm this component exists to prevent.
 *
 * Every row carries its evidence or states that nothing in the sources speaks to it. A verdict with no visible
 * basis cannot be challenged by whoever it is about.
 */
export function MatchBreakdown(props: MatchBreakdownProps): React.ReactElement {
  const items = props.items || [];
  const met = items.filter((i) => i.state === 'met').length;
  const counted = items.filter((i) => i.state !== 'unknown').length || items.length;

  return React.createElement('div', { className: cx('rr-match', props.className) }, [
    props.name
      ? React.createElement('div', { className: 'rr-match__head', key: 'h' }, [
          React.createElement('span', { className: 'rr-match__body', key: 'b' }, [
            React.createElement('span', { className: 'rr-match__name', key: 'n' }, props.name),
            props.sub ? React.createElement('span', { className: 'rr-match__sub', key: 's' }, props.sub) : null,
          ]),
          React.createElement(
            'span',
            { className: 'rr-match__verdict', key: 'v' },
            props.verdict || `Meets ${met} of ${counted}`,
          ),
        ])
      : null,
    React.createElement(
      'ul',
      { className: 'rr-match__list', key: 'l' },
      items.map((it, i) => {
        const state = it.state || 'unknown';
        return React.createElement(
          'li',
          { className: cx('rr-match__row', `rr-match__row--${state}`), key: it.id || i },
          [
            React.createElement(
              'span',
              { className: cx('rr-match__icon', `rr-match__icon--${state}`), key: 'i', title: MET_LABEL[state] },
              icons[MET_ICON[state] as IconName]({ width: 16, height: 16 }),
            ),
            React.createElement('span', { className: 'rr-match__cell', key: 'c' }, [
              React.createElement('span', { className: 'rr-match__label', key: 'l' }, it.label),
              it.evidence
                ? props.onOpen
                  ? React.createElement(
                      'button',
                      {
                        type: 'button',
                        className: 'rr-match__evidence rr-match__evidence--link',
                        key: 'e',
                        onClick: () => props.onOpen && props.onOpen(it, i),
                      },
                      it.evidence,
                    )
                  : React.createElement('span', { className: 'rr-match__evidence', key: 'e' }, it.evidence)
                : React.createElement(
                    'span',
                    { className: 'rr-match__evidence rr-match__evidence--none', key: 'e' },
                    it.noEvidence || 'Nothing in the sources speaks to this',
                  ),
              React.createElement('span', { className: 'rr-match__sr', key: 'v' }, MET_LABEL[state]),
            ]),
          ],
        );
      }),
    ),
  ]);
}

export default MatchBreakdown;
