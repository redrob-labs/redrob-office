import * as React from 'react';
import { icons } from '../icons';
import { IconButton } from '../components/IconButton/IconButton';

/**
 * The head of a Cross-check result: its icon, its name, who ran it and how long it took, and a close button.
 * Shared by FactCheckReport and ChallengeReport, so the two read as parts of one check.
 */
export function CheckHead(props: {
  icon: React.ReactNode;
  name: React.ReactNode;
  meta?: React.ReactNode;
  onClose?: () => void;
  closeLabel?: string;
}): React.ReactElement {
  return React.createElement('div', { className: 'rr-check__h' }, [
    React.createElement('span', { key: 'i', className: 'rr-check__icon', 'aria-hidden': 'true' }, props.icon),
    React.createElement('p', { key: 'b', className: 'rr-check__name' }, props.name),
    props.meta ? React.createElement('span', { key: 's', className: 'rr-check__meta' }, props.meta) : null,
    props.onClose
      ? React.createElement(
          IconButton,
          { key: 'x', size: 'sm', label: props.closeLabel || 'Close', onClick: props.onClose },
          icons.close({ width: 14, height: 14 }),
        )
      : null,
  ]);
}
