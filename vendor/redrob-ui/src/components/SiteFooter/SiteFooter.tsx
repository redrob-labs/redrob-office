import * as React from 'react';
import { cx } from '../../internal/cx';
import { icons } from '../../icons';

export interface SiteFooterLink {
  label?: React.ReactNode;
  href?: string;
  /** Starts a second group in the column, e.g. the endorsed brands under the suite. */
  divider?: boolean;
  /** Marks a link that leaves the site. Gets a glyph and `rel="noopener"`. */
  external?: boolean;
  onClick?: () => void;
}

export interface SiteFooterColumn {
  title?: React.ReactNode;
  items?: SiteFooterLink[];
}

export interface SiteFooterProps {
  mark?: React.ReactNode;
  /** One line about the company, beside the mark. */
  line?: React.ReactNode;
  action?: React.ReactNode;
  columns?: SiteFooterColumn[];
  /** The copyright line. A legal identifier - quote it verbatim, do not translate it. */
  copyright?: React.ReactNode;
  legal?: SiteFooterLink[];
  className?: string;
}

/**
 * The site's footer: the mark, the columns, the legal line.
 *
 * External links carry a glyph with an accessible label rather than only a visual cue, so somebody using a
 * screen reader is told they are about to leave before they follow it.
 *
 * A legal item with an `onClick` renders as a button, not a link - a cookie-settings control that looks like a
 * link but goes nowhere is a link that lies about where it goes.
 */
export function SiteFooter(props: SiteFooterProps): React.ReactElement {
  const cols = props.columns || [];

  return React.createElement('div', { className: cx('rr-sitefooter', props.className) }, [
    React.createElement('div', { className: 'rr-sitefooter__top', key: 't' }, [
      React.createElement('div', { className: 'rr-sitefooter__brand', key: 'b' }, [
        props.mark
          ? React.createElement('span', { className: 'rr-sitefooter__mark', key: 'm' }, props.mark)
          : null,
        props.line ? React.createElement('p', { className: 'rr-sitefooter__line', key: 'l' }, props.line) : null,
        props.action
          ? React.createElement('div', { className: 'rr-sitefooter__action', key: 'a' }, props.action)
          : null,
      ]),
      React.createElement(
        'div',
        { className: 'rr-sitefooter__cols', key: 'c' },
        cols.map((col, i) =>
          React.createElement('div', { className: 'rr-sitefooter__col', key: i }, [
            React.createElement('span', { className: 'rr-sitefooter__colTitle', key: 't' }, col.title),
            React.createElement(
              'ul',
              { className: 'rr-sitefooter__colList', key: 'l' },
              (col.items || []).map((it, j) =>
                React.createElement(
                  'li',
                  { key: j, className: it.divider ? 'rr-sitefooter__divider' : undefined },
                  React.createElement('a', { href: it.href, rel: it.external ? 'noopener' : undefined }, [
                    React.createElement('span', { key: 't' }, it.label),
                    it.external
                      ? React.createElement(
                          'span',
                          {
                            key: 'x',
                            className: 'rr-sitefooter__ext',
                            'aria-label': '(opens another site)',
                          },
                          icons.external({ width: 12, height: 12, 'aria-hidden': 'true' }),
                        )
                      : null,
                  ]),
                ),
              ),
            ),
          ]),
        ),
      ),
    ]),
    React.createElement('div', { className: 'rr-sitefooter__foot', key: 'f' }, [
      React.createElement('span', { className: 'rr-sitefooter__legal', key: 'c' }, props.copyright),
      React.createElement(
        'ul',
        { className: 'rr-sitefooter__legalLinks', key: 'l' },
        (props.legal || []).map((it, j) =>
          React.createElement(
            'li',
            { key: j },
            it.onClick
              ? React.createElement(
                  'button',
                  { type: 'button', className: 'rr-sitefooter__legalBtn', onClick: it.onClick },
                  it.label,
                )
              : React.createElement('a', { href: it.href }, it.label),
          ),
        ),
      ),
    ]),
  ]);
}

export default SiteFooter;
