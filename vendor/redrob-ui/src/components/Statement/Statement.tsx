import * as React from 'react';
import { cx } from '../../internal/cx';
import { SectionMark } from '../SectionMark/SectionMark';

export interface StatementProps {
  /** Language of the sentence. Drives the voice face: Newsreader for Latin, Nanum Myeongjo for Korean. */
  lang?: string;
  /** Size step. 1 is the larger. */
  level?: 1 | 2;
  /** A `SectionMark` above the sentence, naming what this is about. */
  mark?: React.ReactNode;
  /** A supporting line under the sentence, in the lede size. */
  lede?: React.ReactNode;
  /** Lets the sentence run to a wider measure. For a single short line. */
  wide?: boolean;
  className?: string;
  children?: React.ReactNode;
}

/**
 * The one spoken sentence on a surface, set in the voice face.
 *
 * One per surface, and never a heading: the voice faces are for something the brand says, so a second
 * one on the same page turns a statement into a typeface choice.
 *
 * `lang` is not optional in practice. Pretendard carries no Hangul, so a Korean sentence without it
 * falls back to whatever the browser picks and the page silently loses the voice it was set in.
 */
export function Statement(props: StatementProps): React.ReactElement {
  const lang = props.lang || 'en';
  const level = props.level === 2 ? 'rr-voice-2' : 'rr-voice-1';

  return React.createElement(
    'div',
    {
      className: cx('rr-statement', props.wide && 'rr-statement--wide', props.className),
      lang,
    },
    [
      props.mark
        ? React.createElement(
            'div',
            { className: 'rr-statement__mark', key: 'm' },
            React.createElement(SectionMark, { label: props.mark }),
          )
        : null,
      React.createElement('p', { className: level, key: 's' }, props.children),
      props.lede
        ? React.createElement('p', { className: 'rr-voice-lede rr-statement__lede', key: 'l' }, props.lede)
        : null,
    ],
  );
}

export default Statement;
