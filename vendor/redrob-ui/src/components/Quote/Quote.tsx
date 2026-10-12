import * as React from 'react';
import { cx } from '../../internal/cx';

export interface QuoteProps {
  /** Language of the quotation, so it sets in the right voice face. */
  lang?: string;
  /** Who said it. Omit it and there is no attribution line at all. */
  cite?: React.ReactNode;
  /** Their role or company, under the name. */
  role?: React.ReactNode;
  /** `false` drops the rule beside the quotation, for a quote already inside a bordered panel. */
  rule?: boolean;
  className?: string;
  children?: React.ReactNode;
}

/**
 * Somebody else's words, attributed.
 *
 * A `figure` with a real `blockquote` and `figcaption`, not styled paragraphs: the attribution is
 * structurally tied to the quotation, which is what lets a reader in a screen reader tell where the
 * quote ends and who said it.
 *
 * The margins are zeroed inline because a `figure` and a `blockquote` both arrive with browser
 * margins that would fight the layout this sits in.
 */
export function Quote(props: QuoteProps): React.ReactElement {
  const lang = props.lang || 'en';

  return React.createElement(
    'figure',
    {
      className: cx('rr-quote', props.rule === false && 'rr-quote--plain', props.className),
      lang,
      style: { margin: 0 },
    },
    [
      React.createElement(
        'blockquote',
        { className: 'rr-voice-quote', key: 'q', style: { margin: 0 } },
        props.children,
      ),
      props.cite
        ? React.createElement('figcaption', { className: 'rr-quote__cite', key: 'c' }, [
            React.createElement('span', { key: 'n' }, props.cite),
            props.role
              ? React.createElement('span', { className: 'rr-quote__role', key: 'r' }, props.role)
              : null,
          ])
        : null,
    ],
  );
}

export default Quote;
