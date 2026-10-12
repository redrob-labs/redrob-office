import * as React from 'react';
import { cx } from '../../internal/cx';

export interface CardProps {
  /** A tick and a short line above the title. An array joins with a middle dot. */
  meta?: React.ReactNode | React.ReactNode[];
  /** Older name for `meta`. */
  eyebrow?: React.ReactNode | React.ReactNode[];
  title?: React.ReactNode;
  description?: React.ReactNode;
  /** An image or figure above the body. */
  media?: React.ReactNode;
  footer?: React.ReactNode;
  /** `quiet` has no box at all - one of the three square-by-rule surfaces. */
  variant?: 'default' | 'quiet' | 'raised' | 'outline';
  /** The whole card is one control. Renders a button and drops the inner headings. */
  interactive?: boolean;
  padding?: 'default' | 'tight';
  wash?: boolean | 'brand';
  className?: string;
  style?: React.CSSProperties;
  children?: React.ReactNode;
  onClick?: (event: React.MouseEvent) => void;
}

/**
 * A block of related content, optionally the whole thing being one control.
 *
 * `interactive` changes the element to a `button` and demotes the title and description to spans. That is
 * not cosmetic: a heading inside a button is announced as part of the button's name, so a screen reader
 * reads the title twice and the outline gains a heading nobody can navigate to.
 *
 * It also sets `text-align: left` inline, because a button centres its text and a card does not.
 */
export function Card(props: CardProps): React.ReactElement {
  const body: React.ReactNode[] = [];
  const meta = props.meta || props.eyebrow;

  if (meta) {
    body.push(
      React.createElement('div', { className: 'rr-card__meta', key: 'e' }, [
        React.createElement('span', { className: 'rr-tick', key: 't', 'aria-hidden': 'true' }),
        React.createElement('span', { key: 'l' }, Array.isArray(meta) ? meta.join(' \u00b7 ') : meta),
      ]),
    );
  }
  if (props.title) {
    body.push(
      React.createElement(
        props.interactive ? 'span' : 'h3',
        { className: 'rr-card__title', key: 't' },
        props.title,
      ),
    );
  }
  if (props.description) {
    body.push(
      React.createElement(
        props.interactive ? 'span' : 'p',
        { className: 'rr-card__desc', key: 'd' },
        props.description,
      ),
    );
  }
  if (props.children) {
    body.push(
      React.createElement(
        props.interactive ? 'span' : 'div',
        { key: 'c', className: props.interactive ? 'rr-card__slot' : undefined },
        props.children,
      ),
    );
  }

  return React.createElement(
    props.interactive ? 'button' : 'div',
    {
      className: cx(
        'rr-card',
        props.variant && props.variant !== 'default' && `rr-card--${props.variant}`,
        props.interactive && 'rr-card--interactive',
        props.padding === 'tight' && 'rr-card--tight',
        props.wash && 'rr-wash rr-grain',
        props.wash === 'brand' && 'rr-wash--brand',
        props.className,
      ),
      onClick: props.onClick,
      type: props.interactive ? 'button' : undefined,
      style: { textAlign: props.interactive ? 'left' : undefined, ...props.style },
    },
    [
      props.media ? React.createElement('div', { className: 'rr-card__media', key: 'm' }, props.media) : null,
      React.createElement('div', { className: 'rr-card__body', key: 'b' }, body),
      props.footer
        ? React.createElement('div', { className: 'rr-card__footer', key: 'f' }, props.footer)
        : null,
    ],
  );
}

export default Card;
