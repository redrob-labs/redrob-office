import * as React from 'react';
import { cx } from '../../internal/cx';

export interface LogoRowLogo {
  name?: string;
  src?: string;
  alt?: string;
  href?: string;
  /** A measured optical correction for this mark. Not a ranking. */
  scale?: number | string;
}

export interface LogoRowProps {
  logos?: LogoRowLogo[];
  /** The number the row is evidence for: "Used by 40 teams". */
  claim?: React.ReactNode;
  /** The period the claim is measured over. */
  period?: React.ReactNode;
  label?: string;
  note?: React.ReactNode;
  className?: string;
}

/**
 * Customer and partner marks, with the claim they are evidence for.
 *
 * The claim and the period it is measured against are what make this a statement rather than decoration. A row of
 * marks with no number is the third beat of the tell `50-not-generated.md` names, and it invites a reader to infer
 * a scale nobody stated.
 *
 * `scale` is a measured optical correction per mark, not a ranking: a compact symbol reads smaller than a long
 * wordmark at the same height (`15-optical.md`). Using it to make a favoured logo bigger would be a lie about
 * relative size.
 */
export function LogoRow(props: LogoRowProps): React.ReactElement {
  const logos = props.logos || [];

  return React.createElement('div', { className: cx('rr-logorow', props.className) }, [
    props.claim
      ? React.createElement('p', { className: 'rr-logorow__claim', key: 'c' }, [
          React.createElement('span', { key: 't' }, props.claim),
          props.period
            ? React.createElement('span', { className: 'rr-logorow__period', key: 'p' }, props.period)
            : null,
        ])
      : null,
    React.createElement(
      'ul',
      {
        className: 'rr-logorow__marks',
        key: 'm',
        'aria-label': props.label || 'Customers and partners',
      },
      logos.map((l, i) => {
        const img = React.createElement('img', {
          src: l.src,
          alt: l.alt || l.name || '',
          loading: 'lazy',
          decoding: 'async',
          style: l.scale ? ({ '--logo-scale': l.scale } as React.CSSProperties) : undefined,
        });
        return React.createElement(
          'li',
          { key: l.name || i, className: 'rr-logorow__mark' },
          l.href ? React.createElement('a', { href: l.href, rel: 'noreferrer' }, img) : img,
        );
      }),
    ),
    props.note ? React.createElement('p', { className: 'rr-logorow__note', key: 'n' }, props.note) : null,
  ]);
}

export default LogoRow;
