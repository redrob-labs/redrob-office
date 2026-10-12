import { pad2, TIME_ZONES } from './datetime';

/** What each run state is called. One vocabulary, so a roster and a schedule say the same words. */
export const RUN_LABEL: Record<string, string> = {
  queued: 'Queued',
  running: 'Running',
  blocked: 'Waiting on you',
  done: 'Done',
  failed: 'Failed',
  stopped: 'Stopped',
};

export const SCOPE_ICON: Record<string, string> = {
  files: 'file',
  apps: 'link',
  web: 'globe',
  computer: 'tool',
  memory: 'passport',
};

/** Spelled out, because "read" and "write" are a developer's words for somebody else's data. */
export const SCOPE_MODE: Record<string, string> = {
  read: 'Can read',
  write: 'Can read and write',
  none: 'No access',
};

export const ACCESS: Record<string, string> = { read: 'Can read', write: 'Can read and write' };

export const CHANGE_WORD: Record<string, string> = {
  changed: 'Changed',
  added: 'Added',
  removed: 'Removed',
};

/** Four, in order, then the sunken surface for what is left. */
export const CTX_COLORS = [
  'var(--action-primary)',
  'var(--accent-sky-3)',
  'var(--accent-teal-3)',
  'var(--gray-4)',
];

/** Monday first, Sunday last - the week as most of the world writes it. */
export const WEEKDAYS: Array<[string, string, string]> = [
  ['1', 'Mon', 'Monday'],
  ['2', 'Tue', 'Tuesday'],
  ['3', 'Wed', 'Wednesday'],
  ['4', 'Thu', 'Thursday'],
  ['5', 'Fri', 'Friday'],
  ['6', 'Sat', 'Saturday'],
  ['0', 'Sun', 'Sunday'],
];

export interface ScheduleValue {
  mode?: 'once' | 'repeat' | 'event';
  date?: string;
  start?: string;
  time?: string;
  zone?: string;
  freq?: 'daily' | 'weekdays' | 'weekly' | 'monthly';
  days?: string[];
  dom?: string;
}

export function isoDay(d: Date): string {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

export function shortDay(d: Date): string {
  return `${d.toLocaleDateString('en-US', { weekday: 'short' })} ${d.getDate()} ${d.toLocaleDateString(
    'en-US',
    { month: 'short' },
  )}`;
}

export function zoneCity(tz?: string, zones?: Array<[string, string]>): string {
  const z = (zones || TIME_ZONES).filter((x) => x[0] === tz)[0];
  return z ? z[1] : (tz as string);
}

export function andList(a: string[]): string {
  return a.length < 2 ? a.join('') : `${a.slice(0, -1).join(', ')} and ${a[a.length - 1]}`;
}

/**
 * The next time this schedule will actually fire, or null.
 *
 * Walks forward day by day for up to 400 days rather than computing it. A calendar has enough exceptions -
 * month lengths, the last day of February - that walking is both shorter and right, and 400 days covers every
 * pattern the picker can express.
 *
 * Returns null for a one-off whose time has passed, which is what lets the picker say so instead of showing a
 * schedule that will never run.
 */
export function nextScheduledRun(w: ScheduleValue, now?: Date): Date | null {
  const at = now || new Date();
  const t = String(w.time || '09:00').split(':');
  const hh = Number(t[0]);
  const mm = Number(t[1]);
  const start = new Date(`${w.mode === 'once' ? w.date : w.start}T00:00:00`);
  if (isNaN(start.getTime())) return null;

  for (let i = 0; i < 400; i++) {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    d.setHours(hh, mm, 0, 0);
    if (d <= at) {
      if (w.mode === 'once') return null;
      continue;
    }
    if (w.mode === 'once') return d;
    const dow = d.getDay();
    const last = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
    if (
      w.freq === 'daily' ||
      (w.freq === 'weekdays' && dow > 0 && dow < 6) ||
      (w.freq === 'weekly' && (w.days || []).indexOf(String(dow)) >= 0) ||
      (w.freq === 'monthly' && (w.dom === 'last' ? d.getDate() === last : d.getDate() === Number(w.dom)))
    ) {
      return d;
    }
  }
  return null;
}

/**
 * The schedule as one sentence, including the zone by city and the next run.
 *
 * A schedule shown only as controls is a schedule nobody can check before saving. The sentence names the zone as
 * a city, because "Asia/Seoul time" is a database key and "Seoul time" is what somebody can confirm.
 */
export function describeSchedule(
  w: ScheduleValue,
  opts: { where?: string; now?: Date; zones?: Array<[string, string]> } = {},
): string {
  if (w.mode === 'event') {
    return `Runs each time a new file arrives in ${opts.where || 'the project'}.`;
  }
  const zone = `${zoneCity(w.zone, opts.zones)} time`;
  const now = opts.now || new Date();
  const n = nextScheduledRun(w, now);

  if (w.mode === 'once') {
    return n
      ? `Runs once, on ${shortDay(n)} at ${w.time} ${zone}.`
      : 'That time has passed. Choose a later one.';
  }

  const names = WEEKDAYS.filter((d) => (w.days || []).indexOf(d[0]) >= 0).map((d) => d[2]);
  const how = {
    daily: 'Every day',
    weekdays: 'Every weekday',
    weekly: names.length ? `Every ${andList(names)}` : 'Choose at least one day',
    monthly: w.dom === 'last' ? 'On the last day of each month' : `On day ${w.dom} of each month`,
  }[w.freq as string];

  return `${how} at ${w.time} ${zone}.${
    n ? ` Next run ${isoDay(n) === isoDay(now) ? 'today' : shortDay(n)}.` : ''
  }`;
}
