import * as React from 'react';
import { cx } from '../../internal/cx';

export interface StoryFact {
  label?: React.ReactNode;
  value?: React.ReactNode;
  /** What this figure is measured over. */
  period?: React.ReactNode;
}

export interface StoryHeaderProps {
  customer?: React.ReactNode;
  sector?: React.ReactNode;
  logo?: React.ReactNode;
  /** The story's claim, as the page's `h1`. */
  claim?: React.ReactNode;
  /** The lead fact first - it takes the display cut. */
  facts?: StoryFact[];
  className?: string;
}

/**
 * The top of a customer story: who it is about, the claim, and the figures behind it.
 *
 * The FIRST fact takes the display cut and nothing else does. That is one line per surface, set once, and at 52px it
 * clears the face's 42px floor with room. The figures 0 4 6 8 9 are among the glyphs the cut opens, so the number
 * the story is about carries the mark - the rest stay in Pretendard.
 *
 * A real `dl`, so each figure keeps its label structurally rather than by proximity.
 */
export function StoryHeader(props: StoryHeaderProps): React.ReactElement {
  const facts = props.facts || [];

  return React.createElement('header', { className: cx('rr-storyhead', props.className) }, [
    React.createElement('div', { className: 'rr-storyhead__who', key: 'w' }, [
      props.logo ? React.createElement('span', { className: 'rr-storyhead__logo', key: 'l' }, props.logo) : null,
      React.createElement('span', { className: 'rr-storyhead__customer', key: 'c' }, props.customer),
      props.sector
        ? React.createElement('span', { className: 'rr-storyhead__sector', key: 's' }, props.sector)
        : null,
    ]),
    React.createElement('h1', { className: 'rr-storyhead__claim', key: 'h' }, props.claim),
    facts.length
      ? React.createElement(
          'dl',
          { className: 'rr-storyhead__facts', key: 'f' },
          facts.map((f, i) =>
            React.createElement('div', { key: i, className: 'rr-storyhead__fact' }, [
              React.createElement('dt', { key: 'l' }, f.label),
              React.createElement('dd', { key: 'v' }, [
                React.createElement(
                  'span',
                  { className: cx('rr-storyhead__value', i === 0 && 'rr-rake'), key: 'v' },
                  f.value,
                ),
                f.period
                  ? React.createElement('span', { className: 'rr-storyhead__period', key: 'p' }, f.period)
                  : null,
              ]),
            ]),
          ),
        )
      : null,
  ]);
}

export default StoryHeader;
