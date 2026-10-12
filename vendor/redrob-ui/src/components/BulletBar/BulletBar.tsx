import * as React from 'react';
import { cx } from '../../internal/cx';
import { pct, at } from '../../internal/insight';

export interface BulletBarProps {
  value?: number | null;
  /** The goal. Drawn as a band up to it and a tick at it. */
  target: number;
  /** A comparison, e.g. the company figure. A thinner tick. */
  compare?: number | null;
  compareLabel?: string;
  /** "Now" by default. */
  valueLabel?: string;
  /** "target" by default. */
  targetLabel?: string;
  max?: number;
  format?: (v: number | null | undefined) => string;
  className?: string;
}

/**
 * A bullet graph: where a figure is against its goal, and optionally against a comparison, in the space of
 * a table cell. For a habit with a target ("Check, target 85%") rather than a figure that only goes up.
 *
 * The full reading ("Now 72% · target 85% · Company 78%") is the accessible name, so the ticks are never the
 * only way to tell the three apart.
 */
export function BulletBar(props: BulletBarProps): React.ReactElement {
  const max = props.max != null ? props.max : 100;
  const fmt = props.format || pct;
  const hasComp = props.compare != null;
  const text =
    `${props.valueLabel || 'Now'} ${fmt(props.value)} · ${props.targetLabel || 'target'} ${fmt(props.target)}` +
    (hasComp ? ` · ${props.compareLabel || 'Company'} ${fmt(props.compare)}` : '');
  return React.createElement(
    'div',
    { className: cx('rr-bullet', props.className), role: 'img', 'aria-label': text, title: text },
    [
      React.createElement('span', { key: 'b', className: 'rr-bullet__band', style: { width: at(props.target, max) } }),
      props.value != null
        ? React.createElement('span', { key: 'v', className: 'rr-bullet__value', style: { width: at(props.value, max) } })
        : null,
      hasComp
        ? React.createElement('span', { key: 'c', className: 'rr-bullet__compare', style: { left: at(props.compare as number, max) } })
        : null,
      React.createElement('span', { key: 't', className: 'rr-bullet__target', style: { left: at(props.target, max) } }),
    ],
  );
}

export default BulletBar;
