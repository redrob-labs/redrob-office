/**
 * The five-field cron line, read at minute resolution.
 *
 * A saved flow can carry a schedule, and a schedule people already know how to
 * write is `0 9 * * 1-5`. Nothing here interprets seconds or the vendor
 * extensions (`@daily`, `L`, `#`): a trigger fires on a minute or it does not,
 * and the scheduler asks about the current minute rather than computing a next
 * date, so a missed tick is a missed minute instead of a silent stall.
 */

export interface CronFields {
  minute: Set<number>;
  hour: Set<number>;
  dayOfMonth: Set<number>;
  month: Set<number>;
  dayOfWeek: Set<number>;
  /** True when the field was `*`, which changes how day matching combines. */
  everyDayOfMonth: boolean;
  everyDayOfWeek: boolean;
}

interface Range {
  min: number;
  max: number;
}

const RANGES: Record<keyof Omit<CronFields, "everyDayOfMonth" | "everyDayOfWeek">, Range> = {
  minute: { min: 0, max: 59 },
  hour: { min: 0, max: 23 },
  dayOfMonth: { min: 1, max: 31 },
  month: { min: 1, max: 12 },
  dayOfWeek: { min: 0, max: 6 },
};

function parseField(raw: string, range: Range): Set<number> | null {
  const values = new Set<number>();
  for (const part of raw.split(",")) {
    const piece = part.trim();
    if (!piece) return null;
    const [spec, stepText] = piece.split("/");
    const step = stepText === undefined ? 1 : Number(stepText);
    if (!Number.isInteger(step) || step < 1) return null;

    let from: number;
    let to: number;
    if (spec === "*") {
      from = range.min;
      to = range.max;
    } else if (spec?.includes("-")) {
      const [a, b] = spec.split("-");
      from = Number(a);
      to = Number(b);
    } else {
      from = Number(spec);
      to = from;
      // `5/10` on its own means "from 5 to the end of the field, every 10".
      if (stepText !== undefined) to = range.max;
    }
    if (!Number.isInteger(from) || !Number.isInteger(to)) return null;
    if (from < range.min || to > range.max || from > to) return null;
    for (let value = from; value <= to; value += step) values.add(value);
  }
  return values.size > 0 ? values : null;
}

/** The fields of a cron line, or null when the line is not one. */
export function parseCron(expression: string): CronFields | null {
  const fields = expression.trim().split(/\s+/);
  if (fields.length !== 5) return null;
  const [minute, hour, dayOfMonth, month, dayOfWeek] = fields as [
    string,
    string,
    string,
    string,
    string,
  ];

  const parsed = {
    minute: parseField(minute, RANGES.minute),
    hour: parseField(hour, RANGES.hour),
    dayOfMonth: parseField(dayOfMonth, RANGES.dayOfMonth),
    month: parseField(month, RANGES.month),
    // Sunday is written both 0 and 7. Both mean the same day.
    dayOfWeek: parseField(dayOfWeek.replace(/\b7\b/g, "0"), RANGES.dayOfWeek),
  };
  if (
    !parsed.minute ||
    !parsed.hour ||
    !parsed.dayOfMonth ||
    !parsed.month ||
    !parsed.dayOfWeek
  ) {
    return null;
  }
  return {
    minute: parsed.minute,
    hour: parsed.hour,
    dayOfMonth: parsed.dayOfMonth,
    month: parsed.month,
    dayOfWeek: parsed.dayOfWeek,
    everyDayOfMonth: dayOfMonth.trim() === "*",
    everyDayOfWeek: dayOfWeek.trim() === "*",
  };
}

/**
 * Whether a cron line covers the minute this date falls in.
 *
 * The day rule is cron's, not arithmetic's: when both day fields are
 * restricted, either one matching is enough — `0 0 1 * 1` is the first of the
 * month *and* every Monday, not the first of the month when it is a Monday.
 */
export function cronMatches(expression: string, date: Date): boolean {
  const cron = parseCron(expression);
  if (!cron) return false;
  if (!cron.minute.has(date.getMinutes())) return false;
  if (!cron.hour.has(date.getHours())) return false;
  if (!cron.month.has(date.getMonth() + 1)) return false;

  const dayOfMonth = cron.dayOfMonth.has(date.getDate());
  const dayOfWeek = cron.dayOfWeek.has(date.getDay());
  if (cron.everyDayOfMonth && cron.everyDayOfWeek) return true;
  if (cron.everyDayOfMonth) return dayOfWeek;
  if (cron.everyDayOfWeek) return dayOfMonth;
  return dayOfMonth || dayOfWeek;
}
