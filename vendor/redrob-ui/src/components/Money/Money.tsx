import * as React from 'react';
import { cx } from '../../internal/cx';
import { docLocale } from '../../internal/datetime';
import { moneyParts } from '../../internal/borders';

export interface MoneyProps {
  amount: number;
  /** ISO 4217, e.g. `KRW`, `INR`, `USD`. */
  currency: string;
  /** Defaults to the page's `lang`, which is the reader's convention, not the money's. */
  locale?: string;
  /** The locale's own short form: `2.8Cr`, `28M`, `2,840만`. */
  compact?: boolean;
  /** How to draw the currency. Leave it alone unless you know why. */
  display?: 'symbol' | 'narrowSymbol' | 'code' | 'name';
  /** `false` drops `.00` from a whole amount, for a headline figure. Does not round. */
  decimals?: boolean;
  /** Native tooltip, for an exact figure behind a compact one. */
  title?: string;
  className?: string;
}

/**
 * An amount of money, in the reader's own convention.
 *
 * Everything here is `Intl`, and that is the point: crore grouping for en-IN, no decimals on the won,
 * and US$ rather than a bare $ for a dollar shown to a Korean reader. A hand-rolled formatter gets one
 * of those wrong, and the one it gets wrong is somebody's currency.
 *
 * The currency mark is its own span so it can be set apart from the digits typographically without
 * anyone parsing the formatted string back apart.
 *
 * When `Intl` cannot format the pair at all it falls back to "amount currency" rather than rendering
 * nothing: an unformatted number is readable, a missing one is a bug nobody sees.
 */
export function Money(props: MoneyProps): React.ReactElement {
  const locale = props.locale || docLocale();
  const parts = moneyParts(props.amount, props.currency, locale, {
    compact: props.compact,
    display: props.display,
    decimals: props.decimals,
  });

  if (!parts) {
    return React.createElement(
      'span',
      { className: cx('rr-money', props.className) },
      `${String(props.amount)} ${props.currency}`,
    );
  }

  const kids = parts.map((p, i) =>
    React.createElement(
      'span',
      { key: i, className: p.type === 'currency' ? 'rr-money__sym' : null },
      p.value,
    ),
  );

  return React.createElement(
    'span',
    {
      className: cx('rr-money', props.className),
      lang: props.locale || undefined,
      title: props.title,
    },
    kids,
  );
}

export default Money;
