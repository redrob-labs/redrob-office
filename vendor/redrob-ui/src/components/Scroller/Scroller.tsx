import * as React from 'react';
import { cx } from '../../internal/cx';

export interface ScrollerProps {
  axis?: 'x' | 'y';
  /** `thin` for a dense panel. */
  size?: 'default' | 'thin';
  tone?: 'default' | 'inverse';
  /** `auto` reserves gutter space only when a scrollbar is actually there. */
  gutter?: 'auto' | 'stable';
  /** `false` removes the fade at the scrollable edges. */
  fade?: boolean;
  fadeSize?: number | string;
  /** Colour the fade blends into. Set it when the scroller sits on a non-default ground. */
  background?: string;
  maxHeight?: number | string;
  height?: number | string;
  /** Names the region. Without it there is no `region` role, because an unnamed one is noise. */
  label?: string;
  /** `false` drops the tabindex. Only for a scroller whose content is already reachable. */
  focusable?: boolean;
  className?: string;
  style?: React.CSSProperties;
  children?: React.ReactNode;
  onScroll?: (event: React.UIEvent<HTMLDivElement>) => void;
}

/**
 * A scrollable area with faded edges, so it is visible that there is more.
 *
 * The viewport carries a `tabIndex` of 0 by default, and that is not decoration: without it somebody
 * using only a keyboard cannot scroll the region at all, because there is nothing inside to focus that
 * would bring the rest into view.
 *
 * `role="region"` is applied only when `label` is given. An unnamed region adds a landmark a screen
 * reader has to announce and cannot describe, which is worse than no landmark.
 */
export function Scroller(props: ScrollerProps): React.ReactElement {
  const axis = props.axis || 'y';
  const style: React.CSSProperties = { ...props.style };
  if (props.fadeSize) {
    (style as Record<string, unknown>)['--rr-scroller-fade'] =
      typeof props.fadeSize === 'number' ? `${props.fadeSize}px` : props.fadeSize;
  }
  if (props.background) {
    (style as Record<string, unknown>)['--rr-scroller-bg'] = props.background;
  }

  const viewStyle: React.CSSProperties = {};
  if (props.maxHeight) {
    viewStyle.maxHeight = typeof props.maxHeight === 'number' ? `${props.maxHeight}px` : props.maxHeight;
  }
  if (props.height) {
    viewStyle.height = typeof props.height === 'number' ? `${props.height}px` : props.height;
  }

  return React.createElement(
    'div',
    {
      className: cx(
        'rr-scroller',
        `rr-scroller--${axis}`,
        props.size === 'thin' && 'rr-scroller--thin',
        props.tone === 'inverse' && 'rr-scroller--inverse',
        props.gutter === 'auto' && 'rr-scroller--gutter-auto',
        props.fade === false && 'rr-scroller--no-fade',
        props.className,
      ),
      style,
    },
    [
      React.createElement('span', {
        className: 'rr-scroller__edge rr-scroller__edge--start',
        key: 's',
        'aria-hidden': 'true',
      }),
      React.createElement(
        'div',
        {
          className: 'rr-scroller__view',
          key: 'v',
          style: viewStyle,
          tabIndex: props.focusable === false ? undefined : 0,
          role: props.label ? 'region' : undefined,
          'aria-label': props.label,
          onScroll: props.onScroll,
        },
        props.children,
      ),
      React.createElement('span', {
        className: 'rr-scroller__edge rr-scroller__edge--end',
        key: 'e',
        'aria-hidden': 'true',
      }),
    ],
  );
}

export default Scroller;
