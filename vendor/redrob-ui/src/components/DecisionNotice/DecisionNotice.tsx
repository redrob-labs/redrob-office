import * as React from 'react';
import { cx } from '../../internal/cx';
import { noticeList } from '../../internal/evidence';
import { icons } from '../../icons';

export interface DecisionNoticeProps {
  title?: React.ReactNode;
  /** The decision itself, stated plainly. */
  decision?: React.ReactNode;
  /** What was taken into account. */
  used?: React.ReactNode[];
  usedLabel?: React.ReactNode;
  /** What was deliberately NOT taken into account. */
  notUsed?: React.ReactNode[];
  notUsedLabel?: React.ReactNode;
  /** Who reviewed it, and when. */
  humanReview?: React.ReactNode;
  /** What the person can request: an explanation, a correction, a review. */
  rights?: React.ReactNode[];
  rightsLabel?: React.ReactNode;
  auditHref?: string;
  auditLabel?: React.ReactNode;
  contact?: React.ReactNode;
  tone?: 'default' | 'quiet';
  className?: string;
}

/**
 * How a decision about a person was reached, and what they can do about it.
 *
 * `notUsed` sits beside `used` deliberately. Naming what was excluded - age, photograph, name, school - is what
 * makes the exclusion checkable, and it is the half that a notice written to look compliant always leaves out.
 *
 * `humanReview` and `rights` are separate fields rather than free prose, so a notice cannot be assembled without
 * confronting whether a person reviewed it and what recourse exists.
 *
 * `auditHref` points at an independent audit of the tool, not at the company's own description of it.
 */
export function DecisionNotice(props: DecisionNoticeProps): React.ReactElement {
  return React.createElement(
    'section',
    {
      className: cx('rr-notice', props.tone === 'quiet' && 'rr-notice--quiet', props.className),
      'aria-label': (props.title as string) || 'How this decision was made',
    },
    [
      React.createElement('div', { className: 'rr-notice__head', key: 'h' }, [
        React.createElement(
          'span',
          { className: 'rr-notice__icon', key: 'i' },
          icons.scales({ width: 17, height: 17 }),
        ),
        React.createElement(
          'span',
          { className: 'rr-notice__title', key: 't' },
          props.title || 'How this decision was made',
        ),
      ]),
      props.decision
        ? React.createElement('p', { className: 'rr-notice__decision', key: 'd' }, props.decision)
        : null,
      props.used || props.notUsed
        ? React.createElement('div', { className: 'rr-notice__cols', key: 'c' }, [
            noticeList(props.usedLabel || 'What it looked at', props.used, 'rr-notice__items--used', 'u'),
            noticeList(
              props.notUsedLabel || 'What it did not look at',
              props.notUsed,
              'rr-notice__items--not',
              'n',
            ),
          ])
        : null,
      props.humanReview
        ? React.createElement('p', { className: 'rr-notice__human', key: 'r' }, [
            React.createElement(
              'span',
              { className: 'rr-notice__humanIcon', key: 'i' },
              icons.user({ width: 14, height: 14 }),
            ),
            React.createElement('span', { key: 't' }, props.humanReview),
          ])
        : null,
      props.rights && props.rights.length
        ? React.createElement('div', { className: 'rr-notice__rights', key: 'g' }, [
            React.createElement(
              'span',
              { className: 'rr-notice__colTitle', key: 't' },
              props.rightsLabel || 'What you can ask for',
            ),
            React.createElement(
              'ul',
              { className: 'rr-notice__items', key: 'l' },
              props.rights.map((x, i) => React.createElement('li', { key: i }, x)),
            ),
          ])
        : null,
      props.auditHref || props.contact
        ? React.createElement('div', { className: 'rr-notice__foot', key: 'f' }, [
            props.auditHref
              ? React.createElement(
                  'a',
                  {
                    className: 'rr-notice__link',
                    key: 'a',
                    href: props.auditHref,
                    target: '_blank',
                    rel: 'noreferrer',
                  },
                  [
                    React.createElement(
                      'span',
                      { key: 't' },
                      props.auditLabel || 'Read the independent audit of this tool',
                    ),
                    React.createElement(
                      'span',
                      { className: 'rr-notice__ext', key: 'e' },
                      icons.external({ width: 13, height: 13 }),
                    ),
                  ],
                )
              : null,
            props.contact
              ? React.createElement('span', { className: 'rr-notice__contact', key: 'c' }, props.contact)
              : null,
          ])
        : null,
    ],
  );
}

export default DecisionNotice;
