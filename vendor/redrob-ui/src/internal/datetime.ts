/**
 * Locale, date and time-zone helpers.
 *
 * Everything here goes through `Intl` rather than a table of English names, and every call is wrapped:
 * a runtime with a trimmed ICU build throws on an unknown locale, and a date field that throws is
 * worse than one that falls back to an ISO string.
 */

/** Which day a week starts on, by locale. 0 is Sunday. */
const WEEK_START: Record<string, number> = {
  'en-GB': 1,
  de: 1,
  fr: 1,
  ko: 0,
  'en-US': 0,
  'en-IN': 0,
  hi: 0,
};

/** The page's language, which is the right default for anything formatted for a reader. */
export function docLocale(): string {
  if (typeof document === 'undefined') return 'en';
  const el = document.documentElement;
  return (el && el.lang) || 'en';
}

export function weekStartFor(locale: string): number {
  if (WEEK_START[locale] != null) return WEEK_START[locale];
  const base = String(locale || 'en').split('-')[0];
  return WEEK_START[base] != null ? WEEK_START[base] : 0;
}

/** `YYYY-MM-DD`, local time. The wire format for a date with no time in it. */
export function ymd(d: Date): string {
  return `${d.getFullYear()}-${`0${d.getMonth() + 1}`.slice(-2)}-${`0${d.getDate()}`.slice(-2)}`;
}

/** Accepts a Date or `YYYY-MM-DD`. Anything else is not a date, and returning null says so. */
export function parseDate(v: string | Date | null | undefined): Date | null {
  if (!v) return null;
  if (v instanceof Date) return v;
  const parts = String(v).split('-');
  if (parts.length !== 3) return null;
  return new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]));
}

export function monthNames(locale: string, style: 'long' | 'short'): string[] {
  const out: string[] = [];
  try {
    const f = new Intl.DateTimeFormat(locale, { month: style, timeZone: 'UTC' });
    for (let m = 0; m < 12; m++) out.push(f.format(new Date(Date.UTC(2020, m, 15))));
  } catch {
    let names = [
      'January',
      'February',
      'March',
      'April',
      'May',
      'June',
      'July',
      'August',
      'September',
      'October',
      'November',
      'December',
    ];
    if (style === 'short') names = names.map((x) => x.slice(0, 3));
    return names;
  }
  return out;
}

/** A month from what somebody typed: a number, a full name, or an abbreviation. 1-12, or null. */
export function parseMonth(text: string | undefined, locale: string): number | null {
  const t = String(text || '')
    .trim()
    .toLowerCase();
  if (!t) return null;
  if (/^\d{1,2}$/.test(t)) {
    const n = parseInt(t, 10);
    return n >= 1 && n <= 12 ? n : null;
  }
  const long = monthNames(locale, 'long');
  const short = monthNames(locale, 'short');
  for (let i = 0; i < 12; i++) {
    const L = long[i].toLowerCase();
    const S = short[i].toLowerCase().replace('.', '');
    if (L === t || S === t || L.indexOf(t) === 0) return i + 1;
  }
  return null;
}

export function weekdayNames(
  locale: string,
  style: 'narrow' | 'short' | 'long',
  weekStart: number,
): string[] {
  const out: string[] = [];
  try {
    const f = new Intl.DateTimeFormat(locale, { weekday: style, timeZone: 'UTC' });
    // 2021-08-01 was a Sunday, so the offset arithmetic below lands on the right day names.
    for (let i = 0; i < 7; i++) out.push(f.format(new Date(Date.UTC(2021, 7, 1 + ((weekStart + i) % 7)))));
  } catch {
    return ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
  }
  return out;
}

export function pad2(n: number): string {
  return (n < 10 ? '0' : '') + n;
}

/** Words, not a 24-hour number, because "18:00" tells a reader less than "In the evening". */
export function partOfDay(hh: number): string {
  return hh < 5
    ? 'At night'
    : hh < 12
      ? 'In the morning'
      : hh < 17
        ? 'In the afternoon'
        : hh < 21
          ? 'In the evening'
          : 'At night';
}

/** `GMT+9`, as the platform reports it for that zone at that moment - so DST is already applied. */
export function tzOffset(tz: string, at?: Date): string {
  try {
    const part = new Intl.DateTimeFormat('en-US', { timeZone: tz, timeZoneName: 'shortOffset' })
      .formatToParts(at || new Date())
      .filter((x) => x.type === 'timeZoneName')[0];
    return part ? part.value : '';
  } catch {
    return '';
  }
}

/** The same offset in minutes, for arithmetic. */
export function tzMinutes(tz: string, at?: Date): number {
  const m = /GMT([+-])(\d{1,2})(?::(\d{2}))?/.exec(tzOffset(tz, at));
  return m ? (m[1] === '-' ? -1 : 1) * (Number(m[2]) * 60 + Number(m[3] || 0)) : 0;
}

/** Redrob's own offices, for the "and what time is it there" line under a time. */
export const OFFICES: Array<[string, string]> = [
  ['Asia/Seoul', 'Seoul'],
  ['Asia/Kolkata', 'Noida'],
  ['America/New_York', 'New York'],
];

/**
 * Cities rather than zone names, because nobody knows which zone they are in but everybody knows
 * which city they are near. Ordered east to west from Seoul, the company's own zone first.
 */
export const TIME_ZONES: Array<[string, string]> = [
  ['Asia/Seoul', 'Seoul'],
  ['Asia/Tokyo', 'Tokyo'],
  ['Asia/Shanghai', 'Beijing and Shanghai'],
  ['Asia/Hong_Kong', 'Hong Kong'],
  ['Asia/Taipei', 'Taipei'],
  ['Asia/Singapore', 'Singapore'],
  ['Asia/Jakarta', 'Jakarta'],
  ['Asia/Bangkok', 'Bangkok'],
  ['Asia/Ho_Chi_Minh', 'Ho Chi Minh City'],
  ['Asia/Manila', 'Manila'],
  ['Asia/Kolkata', 'India (Delhi, Noida, Mumbai)'],
  ['Asia/Dhaka', 'Dhaka'],
  ['Asia/Karachi', 'Karachi'],
  ['Asia/Dubai', 'Dubai'],
  ['Asia/Riyadh', 'Riyadh'],
  ['Europe/Istanbul', 'Istanbul'],
  ['Europe/Moscow', 'Moscow'],
  ['Europe/Berlin', 'Berlin'],
  ['Europe/Paris', 'Paris'],
  ['Europe/Amsterdam', 'Amsterdam'],
  ['Europe/London', 'London'],
  ['Africa/Lagos', 'Lagos'],
  ['Africa/Nairobi', 'Nairobi'],
  ['Africa/Johannesburg', 'Johannesburg'],
  ['America/Sao_Paulo', 'São Paulo'],
  ['America/Mexico_City', 'Mexico City'],
  ['America/New_York', 'New York'],
  ['America/Toronto', 'Toronto'],
  ['America/Chicago', 'Chicago'],
  ['America/Denver', 'Denver'],
  ['America/Los_Angeles', 'Los Angeles and San Francisco'],
  ['America/Anchorage', 'Anchorage'],
  ['Pacific/Honolulu', 'Honolulu'],
  ['Australia/Sydney', 'Sydney'],
  ['Australia/Melbourne', 'Melbourne'],
  ['Australia/Perth', 'Perth'],
  ['Pacific/Auckland', 'Auckland'],
  ['UTC', 'Coordinated Universal Time (UTC)'],
];

/** Bytes a person can read. One decimal at MB, none below: nobody needs 1.3 KB to two places. */
export function formatBytes(n: number | null | undefined): string {
  if (n == null) return '';
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}
