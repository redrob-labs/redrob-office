import * as React from 'react';
import { cx } from '../../internal/cx';

export interface Milestone {
  year: string | number;
  text?: React.ReactNode;
}

export interface MilestonesProps {
  items?: Milestone[];
  lang?: string;
  label?: string;
  className?: string;
}

/**
 * The company's own dates, in order.
 *
 * An ordered list with a real `time` element on each year, so the sequence and the dates survive without the
 * stylesheet. The last item is marked as the present rather than the list ending in nothing.
 *
 * Renders null when empty, instead of an empty rail with a tick and no content.
 */
export function Milestones(props: MilestonesProps): React.ReactElement | null {
  const items = props.items || [];
  if (!items.length) return null;

  return React.createElement(
    'ol',
    {
      className: cx('rr-miles', props.className),
      lang: props.lang || 'en',
      'aria-label': props.label || 'Milestones',
      style: { '--rr-miles-n': items.length } as React.CSSProperties,
    },
    items.map((m, i) =>
      React.createElement(
        'li',
        {
          key: `${m.year}-${i}`,
          className: cx('rr-miles__item', i === items.length - 1 && 'rr-miles__item--now'),
        },
        [
          React.createElement(
            'span',
            { className: 'rr-miles__mark', key: 'k', 'aria-hidden': 'true' },
            React.createElement('span', { className: 'rr-tick' }),
          ),
          React.createElement(
            'p',
            { className: 'rr-miles__year', key: 'y' },
            React.createElement('time', { dateTime: String(m.year) }, m.year),
          ),
          React.createElement('p', { className: 'rr-miles__text', key: 't' }, m.text),
        ],
      ),
    ),
  );
}

export default Milestones;
