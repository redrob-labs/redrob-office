import * as React from 'react';
import { cx } from '../../internal/cx';
import { useStableId } from '../../internal/ids';
import { useFloating } from '../../internal/useFloating';

export interface TooltipProps {
  /** The text. Short - a tooltip is a label, not documentation. */
  content?: React.ReactNode;
  placement?: 'top' | 'bottom' | 'left' | 'right';
  /** Forces it visible. For a screenshot or a walkthrough, not for normal use. */
  open?: boolean;
  /** `false` when the child is already focusable, so focus is not taken twice. */
  focusable?: boolean;
  className?: string;
  children?: React.ReactNode;
}

/**
 * A short label on hover or focus.
 *
 * Never the only place something is said. A tooltip is unavailable on touch, invisible in print and gone
 * from a screenshot, so anything a person needs belongs in the interface itself. Good for the name of an
 * icon-only control, bad for an explanation.
 *
 * The wrapper takes a `tabIndex` by default so a keyboard user can reach the tip at all - hover-only would
 * put it out of reach. Pass `focusable={false}` when the child is already a button, or Tab lands twice on
 * the same thing.
 *
 * `aria-describedby` rather than `aria-label`, so the tip supplements the control's name instead of
 * replacing it.
 */
export function Tooltip(props: TooltipProps): React.ReactElement {
  const placement = props.placement || 'top';
  const id = useStableId('rr-tip');
  const root = React.useRef<HTMLSpanElement | null>(null);
  const [hot, setHot] = React.useState(false);
  // The bubble still shows on :hover and :focus-within in CSS; this only places it against the window
  // while it shows, so a tip on a control at the edge of a clipped panel is not cut off.
  useFloating(
    hot || !!props.open,
    () => [
      root.current && root.current.querySelector<HTMLElement>(':scope > span:first-child'),
      root.current && root.current.querySelector<HTMLElement>(':scope > .rr-tooltip__bubble'),
    ],
    { side: placement, align: 'center' },
  );

  return React.createElement(
    'span',
    {
      className: cx('rr-tooltip', props.open && 'rr-tooltip--open', props.className),
      ref: root,
      onMouseEnter: () => setHot(true),
      onMouseLeave: () => setHot(false),
      onFocus: () => setHot(true),
      onBlur: () => setHot(false),
    },
    [
      React.createElement(
        'span',
        {
          key: 'c',
          'aria-describedby': id,
          tabIndex: props.focusable === false ? undefined : 0,
          style: { display: 'inline-flex' },
        },
        props.children,
      ),
      React.createElement(
        'span',
        {
          className: `rr-tooltip__bubble rr-tooltip__bubble--${placement}`,
          role: 'tooltip',
          id,
          key: 'b',
        },
        props.content,
      ),
    ],
  );
}

export default Tooltip;
