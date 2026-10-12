import * as React from 'react';
import { cx } from '../../internal/cx';
import { heatBand } from '../../internal/insight';

export interface HeatCellProps {
  /** Difference from the baseline, in points. `null`: there is no baseline to compare with. */
  diff?: number | null;
  /** Whether higher is better. `false` flips the shading; `null` shades nothing. */
  up?: boolean | null;
  /** What the cell says - the value, and the difference. It must carry both: colour is never the only signal. */
  children?: React.ReactNode;
  title?: string;
  className?: string;
}

/**
 * A table cell shaded by how far its figure sits from a baseline, for a compare grid (teams by measures).
 *
 * Within 3 points is noise and is not shaded. Beyond it, three steps of the brand blue for the good
 * direction and three of orange for the bad one - orange rather than red, because a team behind its peers
 * is something to help with, not an error. Renders a `td`; place it in a `tr`.
 */
export function HeatCell(props: HeatCellProps): React.ReactElement {
  const b = heatBand(props.diff, props.up === undefined ? true : props.up);
  return React.createElement(
    'td',
    {
      className: cx('rr-heat', `rr-heat--${b.tone}`, b.level ? `rr-heat--${b.tone}-${b.level}` : null, props.className),
      title: props.title,
    },
    props.children,
  );
}

export default HeatCell;
