import * as React from 'react';
import { cx } from '../../internal/cx';

const BAND_GROUND: Record<string, string> = {
  base: '',
  raised: 'rr-band--raised',
  sunken: 'rr-band--sunken',
  brand: 'rr-band--brand',
  wash: 'rr-band--wash',
  deep: 'rr-band--deep',
};

/**
 * A product's own page wears its grounds (`20-color.md`, The three product grounds). Never the
 * spectrum: that seam belongs to suite surfaces, not to one product's page.
 */
const PRODUCT_GROUNDS: Record<string, 1> = {
  chat: 1,
  cowork: 1,
  browser: 1,
  console: 1,
  office: 1,
  design: 1,
  code: 1,
};

export type BandProduct = 'chat' | 'cowork' | 'browser' | 'console' | 'office' | 'design' | 'code';

export interface BandProps {
  /** Which ground this stretch of page sits on. */
  ground?: 'base' | 'raised' | 'sunken' | 'brand' | 'wash' | 'deep';
  /** Wears one product's grounds. Only meaningful on `base`, `wash` and `brand`. */
  product?: BandProduct;
  /** The 40 degree cut along the band's edge. `spectrum` is for suite surfaces only. */
  threshold?: boolean | 'spectrum';
  size?: 'sm' | 'md' | 'lg';
  /** `false` drops the grain on a non-base ground. */
  grain?: boolean;
  /** One of the five textures. Never behind body copy, one per page. */
  texture?: 'rake' | 'threshold' | 'weave' | 'rule' | 'grid';
  textureScale?: 'sm' | 'md' | 'lg';
  /** `false` keeps the texture at full strength to the band's edge. */
  textureFade?: boolean;
  /** Lets the rail run wider than the default measure. */
  wide?: boolean;
  /** The element. `section` by default, because a band is usually a section of the page. */
  as?: keyof React.JSX.IntrinsicElements;
  /** Id of the heading that names this band. */
  labelledBy?: string;
  id?: string;
  className?: string;
  children?: React.ReactNode;
}

/**
 * One horizontal stretch of a page: its ground, its texture, and the rail that holds the content to a
 * readable measure.
 *
 * There is no centering prop and no alignment prop. That absence is deliberate - `50-not-generated.md`
 * names per-section alignment controls as the tell of a generated layout, and a system that offers them
 * gets pages that wander.
 *
 * The cut is drawn as its own layer rather than on the band, because the band's `::before` already
 * carries the grain and one element cannot hold both.
 */
export function Band(props: BandProps): React.ReactElement {
  const ground = props.ground || 'base';
  const Tag = (props.as || 'section') as string;
  const isProductGround = !!(props.product && PRODUCT_GROUNDS[props.product]);

  return React.createElement(
    Tag,
    {
      className: cx(
        'rr-band',
        BAND_GROUND[ground] || '',
        props.threshold && 'rr-band--threshold',
        isProductGround && `rr-band--product rr-band--p-${props.product}`,
        props.size && `rr-band--${props.size}`,
        props.grain !== false && ground !== 'base' && 'rr-grain',
        props.texture && 'rr-tex',
        props.texture && `rr-tex--${props.texture}`,
        props.texture && props.textureScale && `rr-tex--${props.textureScale}`,
        props.texture && props.textureFade !== false && 'rr-tex--fade',
        props.className,
      ),
      'aria-labelledby': props.labelledBy,
      id: props.id,
    },
    [
      props.threshold && (ground === 'brand' || isProductGround)
        ? React.createElement(
            'div',
            {
              className: cx(
                'rr-band__cut',
                props.threshold === 'spectrum' && !props.product && 'rr-band__cut--spectrum',
              ),
              key: 'cut',
              'aria-hidden': 'true',
            },
            props.threshold === 'spectrum' && !props.product
              ? React.createElement('span', { className: 'rr-band__spectrum' })
              : null,
          )
        : null,
      React.createElement(
        'div',
        { className: cx('rr-band__rail', props.wide && 'rr-band__rail--wide'), key: 'rail' },
        props.children,
      ),
    ],
  );
}

export default Band;
