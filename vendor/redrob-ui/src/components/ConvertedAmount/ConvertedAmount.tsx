import * as React from 'react';
import { cx } from '../../internal/cx';
import { docLocale } from '../../internal/datetime';
import { Money } from '../Money/Money';

export interface ConvertedAmountProps {
  amount: number;
  currency: string;
  /** The same money in another currency. */
  converted?: { amount?: number; currency?: string };
  /** How many of the target currency one unit of `currency` buys. */
  rate?: number;
  /** Which rate this is, by name. "ECB reference rate", "Open Exchange Rates". */
  benchmark?: React.ReactNode;
  /** The spread over the benchmark, as a fraction: 0.015 is 1.5%. */
  markup?: number;
  /** When the rate was measured. */
  at?: React.ReactNode;
  note?: React.ReactNode;
  locale?: string;
  decimals?: boolean;
  className?: string;
}

/**
 * The same money in two currencies, and everything needed to check the conversion.
 *
 * The rate, the named benchmark, the markup and the measurement date all appear together. A converted
 * figure without them cannot be verified by the person paying it, and an unverifiable price is where a
 * quiet spread lives. This is the component that refuses to hide one.
 *
 * The rate is formatted to six significant digits rather than a fixed number of decimals: a won-to-dollar
 * rate is 0.000722, and four decimal places would round it to 0.0007 - a 3% error printed as precision.
 *
 * The converted amount uses `display: 'code'`, so a dollar figure beside a won figure reads USD rather
 * than a bare `$` that could be one of a dozen dollars.
 */
export function ConvertedAmount(props: ConvertedAmountProps): React.ReactElement {
  const locale = props.locale || docLocale();
  const conv = props.converted || {};
  const rateLine: React.ReactNode[] = [];

  if (props.rate != null) {
    const one = new Intl.NumberFormat(locale, { maximumSignificantDigits: 6 }).format(props.rate);
    rateLine.push(`1 ${props.currency} = ${one} ${conv.currency}`);
  }
  if (props.benchmark) rateLine.push(props.benchmark);
  if (props.markup != null) {
    const pct = new Intl.NumberFormat(locale, { style: 'percent', maximumFractionDigits: 2 }).format(
      props.markup,
    );
    rateLine.push(`${pct} over it`);
  }
  if (props.at) rateLine.push(props.at);

  return React.createElement('div', { className: cx('rr-fx', props.className) }, [
    React.createElement(
      'span',
      { className: 'rr-fx__local', key: 'a' },
      React.createElement(Money, {
        amount: props.amount,
        currency: props.currency,
        locale,
        decimals: props.decimals,
      }),
    ),
    conv.amount != null
      ? React.createElement('span', { className: 'rr-fx__conv', key: 'b' }, [
          React.createElement('span', { key: 'e', className: 'rr-fx__eq', 'aria-hidden': 'true' }, '='),
          React.createElement(Money, {
            key: 'm',
            amount: conv.amount,
            currency: conv.currency as string,
            locale,
            display: 'code',
            decimals: props.decimals,
          }),
        ])
      : null,
    rateLine.length
      ? React.createElement('p', { className: 'rr-fx__rate', key: 'c' }, rateLine.join(' · '))
      : null,
    props.note ? React.createElement('p', { className: 'rr-fx__note', key: 'd' }, props.note) : null,
  ]);
}

export default ConvertedAmount;
