import * as React from 'react';

/**
 * Which currency a reader of this language is most likely to think in.
 *
 * A price is easier to judge in the money somebody earns. This is a guess from language, so it is a default
 * the consumer can replace - not a claim about where anybody lives.
 */
export const LANG_CURRENCY: Record<string, string> = {
  ko: 'KRW',
  hi: 'INR',
  'en-IN': 'INR',
  bn: 'INR',
  ja: 'JPY',
  'zh-Hans': 'CNY',
  es: 'EUR',
  fr: 'EUR',
  pt: 'BRL',
};

/**
 * Rounding step per currency.
 *
 * A converted price of ₩13,247 implies a precision the exchange rate does not have. Rounding to the hundred
 * says "about this much", which is the truth.
 */
export const CURRENCY_STEP: Record<string, number> = { KRW: 100, INR: 10, JPY: 10 };

export function currencyFor(locale?: string, map?: Record<string, string>): string {
  const table = map || LANG_CURRENCY;
  if (!locale) return 'USD';
  return table[locale] || table[String(locale).split('-')[0]] || 'USD';
}

export interface Effort {
  label?: string;
  level?: number;
  of?: number;
}

/** One level a person can set on a pick: only the levels its app runs, on the maker's scale. */
export interface EffortLevel extends Effort {
  /** A month of the task at this level, in `currency` (USD). */
  monthly?: number;
  /** Its place on this task when the Router ranked it too; absent means not ranked. */
  place?: number;
  /** The id of a pick in the same list that is this level, so choosing it selects that place. */
  pick?: string;
}
/** What EffortTune says about the level chosen, for a custom `effortNote`. */
export interface EffortNoteContext {
  level: EffortLevel;
  ranked: EffortLevel;
  custom: boolean;
  place?: number;
  times?: number | null;
  price: React.ReactNode;
  per: string;
}
/**
 * How hard a model is set to think, on its maker's own scale.
 *
 * The title says whose scale it is, because "3 of 3" means nothing across makers - one vendor's high is another's
 * middle, and a bare meter invites a comparison that is not valid.
 */
export function EffortMeter(props: { effort?: Effort; unit?: string }): React.ReactElement {
  const e = props.effort || {};
  const of = e.of || 3;
  const bars: React.ReactNode[] = [];
  for (let i = 1; i <= of; i++) {
    bars.push(React.createElement('span', { key: i, className: i <= (e.level || 0) ? 'is-on' : null }));
  }
  return React.createElement(
    'span',
    {
      className: 'rr-model__effort',
      title: e.label ? `${e.label}, ${e.level} of ${of} on this maker\u2019s scale` : null,
    },
    [
      React.createElement('span', { key: 'm', className: 'rr-model__steps', 'aria-hidden': 'true' }, bars),
      React.createElement('span', { key: 'l' }, props.unit === '' ? e.label : `${e.label} ${props.unit || 'effort'}`),
    ],
  );
}
