import * as React from 'react';
import { cx } from '../../internal/cx';
import { docLocale } from '../../internal/datetime';
import { viewerZone } from '../../internal/borders';

export interface TimestampProps {
  /** The moment. A Date, or anything `new Date()` accepts. */
  at: Date | string | number;
  /** Zone to show it in. Defaults to the reader's own. */
  zone?: string;
  /** A second reading in the zone the event happened in, when that differs. */
  originZone?: string;
  locale?: string;
  /** How much to show. `date` drops the clock entirely. */
  precision?: 'date' | 'minute' | 'second';
  zoneStyle?: 'short' | 'long' | 'shortOffset' | 'longOffset';
  /** Show "3 hours ago" on the face. The absolute value stays in the tooltip. */
  relative?: boolean;
  className?: string;
}

/**
 * A moment in time, in the reader's zone, with the zone said out loud.
 *
 * A bare "14:00" is only unambiguous to whoever wrote it. The zone is printed, not assumed, and
 * `originZone` shows the same moment where it happened - which is what a person in Noida reading a
 * Seoul deadline actually needs.
 *
 * `relative` changes the face, never the record: the `datetime` attribute stays an ISO string and the
 * absolute reading stays in the `title`. "3 hours ago" is friendly and useless in a screenshot, so it
 * never replaces the exact value, it only covers it.
 *
 * An unparseable value renders as itself rather than "Invalid Date", because the raw string is at least
 * a clue about where the bad data came from.
 */
export function Timestamp(props: TimestampProps): React.ReactElement {
  const locale = props.locale || docLocale();
  const d = props.at instanceof Date ? props.at : new Date(props.at);
  if (isNaN(d.getTime())) {
    return React.createElement('span', { className: 'rr-time' }, String(props.at));
  }
  const zone = props.zone || viewerZone();
  const precision = props.precision || 'minute';

  function fmt(tz: string, withZone: boolean): string {
    const o: Intl.DateTimeFormatOptions = {
      timeZone: tz,
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    };
    if (precision !== 'date') {
      o.hour = 'numeric';
      o.minute = '2-digit';
    }
    if (precision === 'second') o.second = '2-digit';
    if (withZone && precision !== 'date') o.timeZoneName = props.zoneStyle || 'short';
    try {
      return new Intl.DateTimeFormat(locale, o).format(d);
    } catch {
      return d.toISOString();
    }
  }

  const absolute = fmt(zone, true);
  let text = absolute;

  if (props.relative) {
    const secs = Math.round((d.getTime() - Date.now()) / 1000);
    const units: Array<[Intl.RelativeTimeFormatUnit, number]> = [
      ['year', 31536000],
      ['month', 2592000],
      ['week', 604800],
      ['day', 86400],
      ['hour', 3600],
      ['minute', 60],
      ['second', 1],
    ];
    try {
      const rtf = new Intl.RelativeTimeFormat(locale, { numeric: 'auto' });
      for (let i = 0; i < units.length; i++) {
        if (Math.abs(secs) >= units[i][1] || units[i][0] === 'second') {
          text = rtf.format(Math.round(secs / units[i][1]), units[i][0]);
          break;
        }
      }
    } catch {
      // Keep the absolute reading. A runtime without RelativeTimeFormat still gets a usable time.
    }
  }

  const kids: React.ReactNode[] = [React.createElement('span', { key: 't' }, text)];
  if (props.originZone && props.originZone !== zone) {
    kids.push(
      React.createElement('span', { key: 'o', className: 'rr-time__origin' }, fmt(props.originZone, true)),
    );
  }

  return React.createElement(
    'time',
    {
      className: cx('rr-time', props.className),
      dateTime: d.toISOString(),
      title: props.originZone ? `${absolute} · ${fmt(props.originZone, true)}` : absolute,
    },
    kids,
  );
}

export default Timestamp;
