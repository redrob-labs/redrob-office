import * as React from 'react';
import { cx } from '../../internal/cx';

export interface EmptyStateProps {
  /** An icon or an `Illustration`. An Object drawing, not a construction. */
  icon?: React.ReactNode;
  title?: React.ReactNode;
  /** Why it is empty, and what would fill it. */
  description?: React.ReactNode;
  /** The one thing to do about it. */
  action?: React.ReactNode;
  compact?: boolean;
  /** A wash behind it. `brand` for a first-run state worth making an occasion of. */
  wash?: boolean | 'brand';
  className?: string;
}

/**
 * Nothing here, and what to do about it.
 *
 * Three different situations wear this component and they need different words: nothing created yet (say how
 * to start), a filter that matched nothing (say what to relax), and something that failed (say what broke).
 * "No data" covers all three and helps in none of them.
 *
 * The title is an `h3`, so the state takes part in the page's heading outline rather than being a styled div
 * a screen reader walks past.
 */
export function EmptyState(props: EmptyStateProps): React.ReactElement {
  return React.createElement(
    'div',
    {
      className: cx(
        'rr-empty',
        props.compact && 'rr-empty--compact',
        props.wash && 'rr-wash rr-grain',
        props.wash === 'brand' && 'rr-wash--brand',
        props.className,
      ),
    },
    [
      props.icon ? React.createElement('span', { className: 'rr-empty__icon', key: 'i' }, props.icon) : null,
      React.createElement('h3', { className: 'rr-empty__title', key: 't' }, props.title),
      props.description
        ? React.createElement('p', { className: 'rr-empty__desc', key: 'd' }, props.description)
        : null,
      props.action
        ? React.createElement('div', { className: 'rr-empty__actions', key: 'a' }, props.action)
        : null,
    ],
  );
}

export default EmptyState;
