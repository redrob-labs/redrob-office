import * as React from 'react';
import { AccessList } from '../AccessList/AccessList';

export interface Scope {
  kind?: 'files' | 'apps' | 'web' | 'computer' | 'memory';
  label?: string;
  mode?: 'read' | 'write' | 'none';
}

export interface ScopeBadgeProps {
  scopes?: Scope[];
  label?: string;
  className?: string;
}

/**
 * @deprecated Renamed `AccessList` in the October 2026 delivery. Same markup; this forwards to it.
 */
export function ScopeBadge(props: ScopeBadgeProps): React.ReactElement {
  return React.createElement(AccessList, {
    ...props,
    scopes: (props.scopes || []).map((s) => ({ ...s, label: s.label || '' })),
  });
}

export default ScopeBadge;
