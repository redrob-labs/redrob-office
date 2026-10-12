import { docLocale, parseMonth } from './datetime';

/**
 * The tables and helpers behind the Borders components - the seven places where an interface decides
 * who gets to use it.
 *
 * Every default here is Seoul, Noida, New York, in that order, because that is where the company is.
 * A country that is not in a table is not refused: the component falls back to a form that accepts
 * whatever is true, which is the whole point of the group.
 */

/**
 * Address fields, in the order each country writes them.
 *
 * Korea runs postal code first and largest-to-smallest; India and the US run smallest-to-largest. A
 * single "address line 1 / city / state / zip" form is a US form, and asking a Korean address to fit it
 * either loses a part or puts it in the wrong box.
 */
export const ADDRESS_SCHEMA: Record<
  string,
  { fields: string[]; labels: Record<string, string> }
> = {
  KR: {
    fields: ['postal', 'level1', 'level2', 'line1', 'line2'],
    labels: {
      postal: 'Postal code',
      level1: 'Province or metropolitan city',
      level2: 'City, county or district',
      line1: 'Road name and building number',
      line2: 'Floor, unit, anything else',
    },
  },
  IN: {
    fields: ['line1', 'line2', 'level2', 'level1', 'postal'],
    labels: {
      line1: 'House or building',
      line2: 'Street, area or landmark',
      level2: 'City or town',
      level1: 'State',
      postal: 'PIN code',
    },
  },
  US: {
    fields: ['line1', 'line2', 'level2', 'level1', 'postal'],
    labels: {
      line1: 'Street address',
      line2: 'Apartment, suite, floor',
      level2: 'City',
      level1: 'State',
      postal: 'ZIP code',
    },
  },
};

/** The browser's own autofill names, so a saved address fills in. */
export const ADDRESS_AUTOCOMPLETE: Record<string, string> = {
  line1: 'address-line1',
  line2: 'address-line2',
  level2: 'address-level2',
  level1: 'address-level1',
  postal: 'postal-code',
};

/**
 * Accepted and then tidied, never refused. Spaces, case and punctuation in a postcode are how people
 * actually write them, and rejecting the input teaches nothing.
 */
export function tidyPostal(s: string): string {
  return String(s || '')
    .toUpperCase()
    .replace(/[^\w]/g, '');
}

export const DIAL: Record<string, string> = { KR: '82', IN: '91', US: '1' };

/**
 * A phone number in the one format that is unambiguous anywhere: `+<country><subscriber>`.
 *
 * The trunk zero never travels. A Seoul number written 010-1234-5678 at home is +821012345678 abroad,
 * and keeping the zero produces a number that cannot be dialled from outside Korea.
 */
export function toE164(country: string, local: string): string {
  const cc = DIAL[country];
  let digits = String(local || '').replace(/\D/g, '');
  if (!cc) return digits ? `+${digits}` : '';
  if (digits.charAt(0) === '0') digits = digits.slice(1);
  return digits ? `+${cc}${digits}` : '';
}

export interface DatePartsValue {
  day?: string | number;
  month?: string | number;
  year?: string | number;
}

/**
 * Three typed parts to one `YYYY-MM-DD`, or null when they are not a real date.
 *
 * Checks the day against the actual month, so 31 February is rejected rather than silently rolled into
 * March. Exported because a consumer validating its own form needs the same answer this uses.
 */
export function dateParts(v: DatePartsValue, locale?: string): string | null {
  const value = v || {};
  const m = parseMonth(value.month as string, locale || docLocale());
  const d = parseInt(String(value.day), 10);
  const y = parseInt(String(value.year), 10);
  if (!m || !d || !y || d < 1 || d > 31) return null;
  if (d > new Date(y, m, 0).getDate()) return null;
  return `${String(y).padStart(4, '0')}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

/** The reader's own zone, so a timestamp reads in the time they live in. */
export function viewerZone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone;
  } catch {
    return 'UTC';
  }
}

export interface MoneyPartOptions {
  /** `2.8Cr`, `28M`, `2,840만` - the locale's own short form. */
  compact?: boolean;
  /** `currencyDisplay`. Left alone by default; see below. */
  display?: 'symbol' | 'narrowSymbol' | 'code' | 'name';
  /** `false` drops `.00` from a whole amount. Does not round. */
  decimals?: boolean;
}

/**
 * An amount broken into the locale's own parts, so the currency mark can be styled apart from the digits.
 *
 * Three decisions worth keeping:
 *
 * `useGrouping: 'always'` with compact, because compact suppresses grouping by default and ko-KR runs
 * four digits before its unit: 2,840만, not 2840만. It changes nothing for en-IN 2.8Cr or en-US 28M.
 *
 * `decimals: false` sets both fraction digits to zero. It does not round the amount - it stops Intl
 * drawing `.00` on a whole one. A currency with no minor unit, like the won, already has none.
 *
 * `currencyDisplay` is left alone unless asked. Passed `narrowSymbol` it would render USD as a bare `$`
 * to a Korean reader, undoing the disambiguation CLDR does for free: ko-KR renders USD as US$, and that
 * is correct.
 */
export function moneyParts(
  amount: number,
  currency: string,
  locale: string,
  opts: MoneyPartOptions = {},
): Intl.NumberFormatPart[] | null {
  const o: Intl.NumberFormatOptions = { style: 'currency', currency };
  if (opts.compact) {
    o.notation = 'compact';
    (o as { useGrouping?: string }).useGrouping = 'always';
  }
  if (opts.decimals === false) {
    o.minimumFractionDigits = 0;
    o.maximumFractionDigits = 0;
  }
  if (opts.display) o.currencyDisplay = opts.display;
  try {
    return new Intl.NumberFormat(locale, o).formatToParts(amount);
  } catch {
    return null;
  }
}
