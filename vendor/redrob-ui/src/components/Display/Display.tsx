import * as React from 'react';
import { cx } from '../../internal/cx';

export interface DisplayProps {
  /** Size step. 1 is the largest. */
  level?: 1 | 2 | 3;
  /** The element. `p` by default: display type is usually a line, not a document heading. */
  as?: keyof React.JSX.IntrinsicElements;
  /** Required when the line is not in the page's language - Korean display sets at 96%. */
  lang?: string;
  id?: string;
  className?: string;
  children?: React.ReactNode;
}

/**
 * One line set in Redrob Rake Display.
 *
 * One per surface. The face has twenty opened glyphs of ninety-one and a 42px floor, so it is a
 * statement, not a heading style - it is never the wordmark and never a paragraph.
 *
 * `as` defaults to `p` rather than a heading tag deliberately: a display line is usually the same
 * sentence a heading nearby already carries, and two competing `h1`s is worse than none.
 */
export function Display(props: DisplayProps): React.ReactElement {
  const level = props.level === 3 ? 3 : props.level === 2 ? 2 : 1;
  const Tag = (props.as || 'p') as string;

  return React.createElement(
    Tag,
    {
      className: cx('rr-rake', `rr-rake--${level}`, props.className),
      lang: props.lang,
      id: props.id,
    },
    props.children,
  );
}

export default Display;
