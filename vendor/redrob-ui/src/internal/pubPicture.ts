import * as React from 'react';
import { cx } from './cx';

export interface PubImage {
  src?: string;
  /** WebP source set, offered before the fallback. */
  webp?: string;
  alt?: string;
  caption?: React.ReactNode;
  /** Overrides the label. */
  label?: React.ReactNode;
  /** Set `false` for a photograph, which then carries no generated label. */
  generated?: boolean;
  /** `object-position`, for a crop that must keep a subject in frame. */
  position?: string;
}

export interface PubPictureOptions {
  className?: string;
  key?: string;
  href?: string;
  /** The image repeats adjacent text, so it gets an empty alt. */
  decorative?: boolean;
  sizes?: string;
  eager?: boolean;
}

/**
 * A published image with its caption and its provenance label.
 *
 * The label defaults to "AI-generated" and a caller has to pass `generated: false` to remove it. That default is the
 * point: an image whose origin is unstated reads as a photograph, and on a site about AI that silence is the
 * misleading option. Opting out is a decision somebody makes; opting in is not something they can forget.
 *
 * A linked frame is `aria-hidden` with `tabIndex: -1`, because the headline beside it is the real link - two links
 * to the same place make a screen reader announce every story twice.
 */
export function pubPicture(img: PubImage, o: PubPictureOptions = {}): React.ReactElement {
  const label = img.generated === false ? img.label : img.label || 'AI-generated';
  const pic = React.createElement('picture', { key: 'p' }, [
    img.webp
      ? React.createElement('source', {
          key: 's',
          type: 'image/webp',
          srcSet: img.webp,
          sizes: o.sizes || '100vw',
        })
      : null,
    React.createElement('img', {
      key: 'i',
      src: img.src,
      alt: o.decorative ? '' : img.alt || '',
      loading: o.eager ? 'eager' : 'lazy',
      decoding: 'async',
      fetchpriority: o.eager ? 'high' : undefined,
      style: img.position ? { objectPosition: img.position } : undefined,
    }),
  ]);

  return React.createElement('figure', { className: cx('rr-pubpic', o.className), key: o.key }, [
    o.href
      ? React.createElement(
          'a',
          { className: 'rr-pubpic__frame', href: o.href, tabIndex: -1, 'aria-hidden': 'true', key: 'f' },
          pic,
        )
      : React.createElement('div', { className: 'rr-pubpic__frame', key: 'f' }, pic),
    img.caption || label
      ? React.createElement('figcaption', { className: 'rr-pubpic__caption', key: 'c' }, [
          img.caption ? React.createElement('span', { key: 'cap' }, img.caption) : null,
          label ? React.createElement('span', { className: 'rr-pubpic__label', key: 'lab' }, label) : null,
        ])
      : null,
  ]);
}
