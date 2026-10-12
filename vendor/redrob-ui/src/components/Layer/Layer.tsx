import * as React from 'react';
import { cx } from '../../internal/cx';

/**
 * What each depth means. The strata are an argument, not decoration: the claim sits on top, the
 * evidence under it, the source under that. A fourth level would be a depth with nothing to say.
 */
export const LAYER_MEANS = ['the claim', 'the evidence', 'the source'] as const;

/** Nesting depth, so a Layer inside a Layer knows to step down without being told. */
export const LayerContext = React.createContext(0);

export interface LayerProps {
  /**
   * Force a depth instead of taking one from the parent. `0` base, `1` raised, `2` sunken.
   * Anything above 2 is held at 2 and warned about.
   */
  depth?: number;
  /** The element to render. `section` or `article` when the layer is also a document landmark. */
  as?: keyof React.JSX.IntrinsicElements;
  id?: string;
  className?: string;
  children?: React.ReactNode;
}

/**
 * One step of depth. The system's only expression of depth, measured in CIE L* off rendered pixels
 * rather than chosen by eye.
 *
 * Nest it and each child steps down on its own, so a panel does not have to know where it sits. The
 * cap at 2 is deliberate and warns instead of failing: a fourth stratum usually means the content
 * wants restructuring, not another shade, and crashing a page over it would be worse than the flaw.
 */
export function Layer(props: LayerProps): React.ReactElement {
  const parent = React.useContext(LayerContext);
  const want = typeof props.depth === 'number' ? props.depth : parent + 1;
  const depth = Math.max(0, Math.min(2, want));

  if (want > 2 && typeof console !== 'undefined' && console.warn) {
    console.warn(
      `[Redrob] Layer nested to ${want}. The strata stop at 2 (${LAYER_MEANS[2]}); ` +
        'this one is held there. See 40-surfaces-and-motion.md.',
    );
  }

  const Tag = (props.as || 'div') as string;
  const element = React.createElement(
    Tag,
    {
      className: cx('rr-strata', props.className),
      'data-layer': String(depth),
      id: props.id,
    },
    props.children,
  );

  return React.createElement(LayerContext.Provider, { value: depth }, element);
}

export default Layer;
