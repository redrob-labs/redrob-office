import * as React from 'react';
import { ProtectionStatus } from '../ProtectionStatus/ProtectionStatus';
export interface StatusCardProps {
  /** `safe` on, `warn` off or degraded, `brand` a feature in force, `plain` neutral. */
  tone?: 'safe' | 'warn' | 'brand' | 'plain';
  icon?: React.ReactNode;
  title?: React.ReactNode;
  /** Element for the title, when the card opens a section. */
  as?: keyof React.JSX.IntrinsicElements;
  size?: 'md' | 'lg';
  /** Text beside a live dot: what is running right now. */
  live?: string;
  className?: string;
  children?: React.ReactNode;
}
/**
 * @deprecated Renamed `ProtectionStatus` in the October 2026 delivery. Same markup; this forwards to it.
 */
export function StatusCard(props: StatusCardProps): React.ReactElement {
  return React.createElement(ProtectionStatus, { ...props, title: props.title });
}
export default StatusCard;
