import * as React from 'react';
import { cx } from '../../internal/cx';

export interface FeatureRowProps {
  /** Position in the sequence. Odd indices mirror, so successive rows alternate. */
  index?: number;
  mark?: React.ReactNode;
  title?: React.ReactNode;
  /** Short bullets. Each gets a tick. */
  points?: React.ReactNode[];
  action?: React.ReactNode;
  /** A `Figure`, usually. This row owns the bleed of its own media slot. */
  media?: React.ReactNode;
  /** Runs the media off the page edge. */
  bleed?: boolean;
  className?: string;
  children?: React.ReactNode;
}

/**
 * One subject, with its picture: title, a paragraph, a few points, one action.
 *
 * ONE subject, not an array. An array becomes a three-up grid the first time somebody passes three items, and that
 * grid is the tell `50-not-generated.md` names. Alternation comes from `index` rather than a `flip` prop, so a
 * sequence of rows alternates because of where each sits rather than because somebody remembered.
 *
 * There is no alignment prop here either: the media side is decided by position.
 */
export function FeatureRow(props: FeatureRowProps): React.ReactElement {
  const flip = (props.index || 0) % 2 === 1;

  return React.createElement(
    'div',
    {
      className: cx(
        'rr-feature',
        flip && 'rr-feature--flip',
        props.bleed && 'rr-feature--bleed',
        props.className,
      ),
    },
    [
      React.createElement('div', { className: 'rr-feature__body', key: 'b' }, [
        props.mark ? React.createElement('div', { className: 'rr-feature__mark', key: 'm' }, props.mark) : null,
        React.createElement('h3', { className: 'rr-feature__title', key: 't' }, props.title),
        props.children
          ? React.createElement('div', { className: 'rr-feature__text', key: 'x' }, props.children)
          : null,
        props.points && props.points.length
          ? React.createElement(
              'ul',
              { className: 'rr-feature__points', key: 'p' },
              props.points.map((p, i) =>
                React.createElement('li', { key: i }, [
                  React.createElement('span', {
                    className: 'rr-feature__tick',
                    key: 'i',
                    'aria-hidden': 'true',
                  }),
                  React.createElement('span', { key: 't' }, p),
                ]),
              ),
            )
          : null,
        props.action ? React.createElement('div', { className: 'rr-feature__action', key: 'a' }, props.action) : null,
      ]),
      props.media ? React.createElement('div', { className: 'rr-feature__media', key: 'm' }, props.media) : null,
    ],
  );
}

export default FeatureRow;
