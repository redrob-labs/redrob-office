import * as React from 'react';
import { cx } from '../../internal/cx';
import { markPassage } from '../../internal/evidence';
import { icons } from '../../icons';

export interface EvidenceProps {
  /** What this passage is put forward as proving. */
  claim?: React.ReactNode;
  claimLabel?: React.ReactNode;
  /** The surrounding text. The quote is highlighted inside it. */
  passage?: React.ReactNode;
  /** The part actually relied on. */
  quote?: string;
  source?: React.ReactNode;
  href?: string;
  meta?: React.ReactNode;
  actions?: React.ReactNode;
  className?: string;
}

/**
 * A quotation put forward as proof of something, with its source.
 *
 * `passage` is the surrounding text and `quote` marks the part relied on, which is what lets a reader see whether
 * the quote survives its context. A quote with the context stripped is the oldest way to misrepresent a source.
 *
 * Nothing is drawn when neither is present. A caller passing only `quote` used to get an empty bordered box; now
 * the quote stands on its own.
 */
export function Evidence(props: EvidenceProps): React.ReactElement {
  return React.createElement('figure', { className: cx('rr-evidence', props.className) }, [
    props.claim
      ? React.createElement('div', { className: 'rr-evidence__claim', key: 'c' }, [
          React.createElement(
            'span',
            { className: 'rr-evidence__claimLabel', key: 'l' },
            props.claimLabel || 'Put forward as proof of',
          ),
          React.createElement('span', { className: 'rr-evidence__claimText', key: 't' }, props.claim),
        ])
      : null,
    props.passage || props.quote
      ? React.createElement(
          'blockquote',
          { className: 'rr-evidence__passage', key: 'p' },
          props.passage ? markPassage(props.passage, props.quote) : props.quote,
        )
      : null,
    React.createElement('figcaption', { className: 'rr-evidence__foot', key: 'f' }, [
      React.createElement(
        'span',
        { className: 'rr-evidence__icon', key: 'i' },
        icons.highlight({ width: 15, height: 15 }),
      ),
      props.href
        ? React.createElement(
            'a',
            {
              className: 'rr-evidence__source',
              key: 's',
              href: props.href,
              target: '_blank',
              rel: 'noreferrer',
            },
            [
              React.createElement('span', { key: 'n' }, props.source),
              React.createElement(
                'span',
                { className: 'rr-evidence__ext', key: 'e' },
                icons.external({ width: 13, height: 13 }),
              ),
            ],
          )
        : React.createElement('span', { className: 'rr-evidence__source', key: 's' }, props.source),
      props.meta ? React.createElement('span', { className: 'rr-evidence__meta', key: 'm' }, props.meta) : null,
      props.actions
        ? React.createElement('span', { className: 'rr-evidence__actions', key: 'a' }, props.actions)
        : null,
    ]),
  ]);
}

export default Evidence;
