import * as React from 'react';
import { cx } from '../../internal/cx';
import { icons } from '../../icons';

export interface DeltaProps {
  /** The change. Rounded to a whole number before it is shown or judged. */
  value?: number | null;
  /** Whether up is good. `false` for figures like rework; `null` when neither direction is better. */
  up?: boolean | null;
  /** Unit after the number: " pts", "%", " h". Nothing by default. */
  suffix?: string;
  /** A unit for exactly one, e.g. " pt" beside " pts". */
  suffixOne?: string;
  className?: string;
}

/**
 * A signed change with an arrow, coloured by whether it moved the good way: "+3 pts" beside a figure in a
 * table or a tile.
 *
 * The arrow carries the direction as well as the colour. A move the bad way is the warning colour, not
 * danger: a figure falling is a reason to look, not a failure. A change that rounds to zero is flat, and a
 * missing one renders nothing rather than "+0".
 */
export function Delta(props: DeltaProps): React.ReactElement | null {
  if (props.value == null || Number.isNaN(props.value)) return null;
  const r = Math.round(props.value);
  const up = props.up === undefined ? true : props.up;
  const tone = r === 0 || up === null ? 'flat' : r > 0 === up ? 'good' : 'bad';
  const unit = Math.abs(r) === 1 && props.suffixOne != null ? props.suffixOne : props.suffix || '';
  const sign = r > 0 ? '+' : r < 0 ? '\u2212' : '';
  const glyph = r > 0 ? icons.arrowUp : r < 0 ? icons.arrowDown : icons.arrowRight;
  return React.createElement('span', { className: cx('rr-delta', `rr-delta--${tone}`, props.className) }, [
    glyph({ key: 'i', className: 'rr-delta__icon' }),
    React.createElement('span', { key: 'v' }, `${sign}${Math.abs(r)}${unit}`),
  ]);
}

export default Delta;
