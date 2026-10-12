import * as React from 'react';
import { CURRENCY_STEP } from './model';
import { Money } from '../components/Money/Money';

/**
 * The four dimensions every model is scored on, and what each one measures.
 *
 * Four, fixed, with the measurement named. A ranking whose dimensions are unnamed cannot be argued with, and a
 * ranking nobody can argue with is marketing.
 */
export const GUIDE_DIMS = [
  { key: 'quality', label: 'Quality', hint: 'Graded against the task rubric' },
  { key: 'reliability', label: 'Reliability', hint: 'Runs that passed the rubric bar' },
  { key: 'speed', label: 'Speed', hint: 'Median time per task, against the fastest' },
  { key: 'cost', label: 'Cost', hint: 'Monthly cost, against the cheapest' },
] as const;

export interface GuideScore {
  quality?: number;
  reliability?: number;
  speed?: number;
  cost?: number;
  /** 95% interval on the total. Printed beside it, so the score is never a bare number. */
  ci?: number;
}

export type GuideWeights = Partial<Record<(typeof GUIDE_DIMS)[number]['key'], number>>;

/** Weighted total, to one decimal. Returns null when there is no score, rather than a misleading 0. */
export function guideTotal(k: { score?: GuideScore }, w: GuideWeights): number | null {
  if (!k.score) return null;
  let t = 0;
  GUIDE_DIMS.forEach((d) => {
    t += (w[d.key] || 0) * ((k.score as Record<string, number>)[d.key] || 0);
  });
  return Math.round(t * 10) / 10;
}

/** A monthly price in the reader's currency, rounded to that currency's step. */
export function guidePrice(
  monthly: number | undefined,
  shown: string,
  base: string,
  rates: Record<string, number>,
  locale: string,
  cls?: string,
): React.ReactElement | null {
  if (monthly == null) return null;
  let amt = shown === base ? monthly : monthly * rates[shown];
  const step = CURRENCY_STEP[shown];
  const small = shown === base && amt < 1;
  amt = step ? Math.max(step, Math.round(amt / step) * step) : small ? amt : Math.round(amt);
  return React.createElement(Money, {
    // Every caller drops this into a children ARRAY beside a unit label, so the element needs a key
    // of its own: without one React warns in the consumer's console and cannot match the amount
    // across renders, which is how a re-render loses the node instead of updating it. The key is
    // fixed rather than derived because there is only ever one of these per array.
    key: 'amount',
    amount: amt,
    currency: shown,
    locale,
    decimals: small ? undefined : false,
    className: cls,
  });
}
