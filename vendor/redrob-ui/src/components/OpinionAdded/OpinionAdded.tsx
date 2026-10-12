import * as React from 'react';
import { cx } from '../../internal/cx';
import { icons } from '../../icons';

export interface OpinionAddedProps {
  /** Which model added it. Named, not hidden behind "a second model". */
  by?: string;
  label?: React.ReactNode;
  className?: string;
  children?: React.ReactNode;
}

/**
 * @deprecated Use Opinion with `kind="added"`. Kept for 1.x.
 *
 * Something a second opinion added that the first answer had missed.
 *
 * Marked as an addition rather than blended into the answer. A crosscheck that silently improves the text
 * removes the reader's chance to weigh where a claim came from, which is the only reason to run one.
 */
export function OpinionAdded(props: OpinionAddedProps): React.ReactElement {
  return React.createElement('div', { className: cx('rr-opadd', props.className) }, [
    React.createElement('p', { key: 'h', className: 'rr-opadd__head' }, [
      React.createElement('span', { key: 'i', 'aria-hidden': 'true' }, icons.plus({ width: 13, height: 13 })),
      props.label || `The answer missed this${props.by ? ` (${props.by})` : ''}`,
    ]),
    React.createElement('div', { key: 'b', className: 'rr-opadd__body' }, props.children),
  ]);
}

export default OpinionAdded;
