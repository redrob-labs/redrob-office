import * as React from 'react';
import { cx } from '../../internal/cx';
import { icons } from '../../icons';

export interface CustomerStoryProps {
  customer?: React.ReactNode;
  sector?: React.ReactNode;
  logo?: React.ReactNode;
  /** The number the story is about. */
  figure?: React.ReactNode;
  figureLabel?: React.ReactNode;
  /** What the figure is measured over. */
  period?: React.ReactNode;
  /** A `Quote`. At most one per page. */
  quote?: React.ReactNode;
  href?: string;
  moreLabel?: React.ReactNode;
  className?: string;
  children?: React.ReactNode;
}

/**
 * A customer result: who, the number, and what it is measured over.
 *
 * The figure carries the story, not the quote. That cap - one quote per page - is load-bearing rather than
 * stylistic: an employer often will not consent to being named, and a candidate's words are personal data about the
 * person the system made a decision about. A page built on quotes needs consent this product cannot assume.
 *
 * `period` is separate from the figure so a result cannot be stated without saying over what.
 */
export function CustomerStory(props: CustomerStoryProps): React.ReactElement {
  return React.createElement('article', { className: cx('rr-story', props.className) }, [
    React.createElement('div', { className: 'rr-story__head', key: 'h' }, [
      props.logo ? React.createElement('span', { className: 'rr-story__logo', key: 'l' }, props.logo) : null,
      React.createElement('span', { className: 'rr-story__who', key: 'w' }, [
        React.createElement('span', { className: 'rr-story__customer', key: 'c' }, props.customer),
        props.sector
          ? React.createElement('span', { className: 'rr-story__sector', key: 's' }, props.sector)
          : null,
      ]),
    ]),
    React.createElement('div', { className: 'rr-story__figure', key: 'f' }, [
      React.createElement('span', { className: 'rr-story__value', key: 'v' }, props.figure),
      React.createElement('span', { className: 'rr-story__label', key: 'l' }, props.figureLabel),
    ]),
    props.period ? React.createElement('p', { className: 'rr-story__period', key: 'p' }, props.period) : null,
    props.children ? React.createElement('div', { className: 'rr-story__body', key: 'b' }, props.children) : null,
    props.quote ? React.createElement('div', { className: 'rr-story__quote', key: 'q' }, props.quote) : null,
    props.href
      ? React.createElement('a', { className: 'rr-story__more', key: 'm', href: props.href }, [
          React.createElement('span', { key: 't' }, props.moreLabel || 'Read the whole story'),
          React.createElement(
            'span',
            { key: 'i', className: 'rr-story__moreIcon' },
            icons.arrowRight({ width: 15, height: 15 }),
          ),
        ])
      : null,
  ]);
}

export default CustomerStory;
