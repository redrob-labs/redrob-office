import * as React from 'react';
import { cx } from '../../internal/cx';
import { pct, MixStep } from '../../internal/insight';

export interface MixBarProps {
  /** One share 0-100 per step, in step order. `null` or 0 draws no segment. */
  mix?: Array<number | null>;
  /** The ordinal steps, shallowest first, at most six. Their names make the accessible text. */
  steps?: MixStep[];
  /** Whose mix this is - "Your team" - prefixed to the accessible text. */
  label?: string;
  /** A 8px strip with no numbers, for a table row. */
  thin?: boolean;
  /** Segments at or above this share print their number. 9 by default: below it the digits do not fit. */
  showFrom?: number;
  className?: string;
}

/**
 * One 100% bar of an ordinal mix - how a body of work splits across steps that have an order, such as
 * the six modes of AI use from Look up to Orchestrate.
 *
 * The colours are the ordinal ramp (`--ordinal-0..5`), light to deep, never categorical series colours: the
 * steps are ordered, and a palette of unrelated hues would hide that order. The full text equivalent ("Look
 * up 20%, Learn 15%, ...") is the accessible name and the tooltip, so the bar never carries a figure that
 * only colour can tell.
 */
export function MixBar(props: MixBarProps): React.ReactElement {
  const mix = props.mix || [];
  const steps = props.steps || [];
  const from = props.showFrom != null ? props.showFrom : 9;
  const text = steps.map((s, i) => `${s.name} ${pct(mix[i])}`).join(', ');
  const name = props.label ? `${props.label}: ${text}` : text;
  return React.createElement(
    'div',
    {
      className: cx('rr-mix', props.thin && 'rr-mix--thin', props.className),
      role: 'img',
      'aria-label': name,
      title: name,
    },
    mix.map((v, i) =>
      v && v > 0
        ? React.createElement(
            'span',
            { key: i, className: `rr-mix__seg rr-mix__seg--${Math.min(i, 5)}`, style: { flexGrow: v } },
            !props.thin && v >= from ? String(Math.round(v)) : null,
          )
        : null,
    ),
  );
}

export default MixBar;
