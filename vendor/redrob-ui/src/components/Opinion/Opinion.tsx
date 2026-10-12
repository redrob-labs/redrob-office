import * as React from 'react';
import { Disputed, DisputedProps, DisputedView } from '../Disputed/Disputed';
import { OpinionAdded, OpinionAddedProps } from '../OpinionAdded/OpinionAdded';
/**
 * What Fact check found, inside an answer. `kind="differs"` (default) marks a sentence another AI reads
 * differently, opened in place, and takes the DisputedProps fields; `kind="added"` is what it thinks the answer
 * missed, set after the answer, and takes `by` and `label`.
 */
export interface OpinionProps extends Omit<DisputedProps, 'views'>, OpinionAddedProps {
  kind?: 'differs' | 'added';
  views?: DisputedView[];
}
/**
 * What Fact check found, inside an answer.
 *
 * `differs` marks a sentence another AI reads differently and opens what each checker said in place, built of
 * phrasing elements so it can sit inside the answer's paragraph. `added` is what it thinks the answer missed:
 * set after the answer, never merged into it, and marked with whose it is.
 */
export function Opinion(props: OpinionProps): React.ReactElement {
  return props.kind === 'added' ? React.createElement(OpinionAdded, props) : React.createElement(Disputed, props);
}
export default Opinion;
