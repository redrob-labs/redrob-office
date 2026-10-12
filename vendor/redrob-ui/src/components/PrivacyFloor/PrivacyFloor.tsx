import * as React from 'react';
import { cx } from '../../internal/cx';
import { icons } from '../../icons';

export interface PrivacyFloorProps {
  /** The smallest group a figure is shown for. */
  minGroup?: number;
  /** Replaces the default "Groups of 3 or more", e.g. a translation. */
  children?: React.ReactNode;
  className?: string;
}

/**
 * The lock and "Groups of 3 or more" beside a view of other people's work: the promise that no figure on
 * the screen describes fewer people than that. Put it where the scope is named, not in a footer.
 */
export function PrivacyFloor(props: PrivacyFloorProps): React.ReactElement {
  const n = props.minGroup != null ? props.minGroup : 3;
  return React.createElement('span', { className: cx('rr-privacyfloor', props.className) }, [
    icons.lock({ key: 'i', className: 'rr-privacyfloor__icon' }),
    React.createElement('span', { key: 't' }, props.children != null ? props.children : `Groups of ${n} or more`),
  ]);
}

export default PrivacyFloor;
