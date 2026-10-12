import * as React from 'react';
import { cx } from '../../internal/cx';

export interface BreadcrumbItem {
  label?: React.ReactNode;
  href?: string;
  onClick?: (event: React.MouseEvent<HTMLAnchorElement>) => void;
}

export interface BreadcrumbProps {
  /** Ancestors first, this page last. */
  items?: BreadcrumbItem[];
  label?: string;
  className?: string;
}

/**
 * Where this page sits, and the way back up.
 *
 * An ordered list inside a `nav`, because the order is the meaning. The last item is the current page:
 * it is not a link and carries `aria-current="page"`, so nobody is offered a link to where they already
 * are.
 */
export function Breadcrumb(props: BreadcrumbProps): React.ReactElement {
  const items = props.items || [];

  return React.createElement(
    'nav',
    { className: cx('rr-breadcrumb', props.className), 'aria-label': props.label || 'Breadcrumb' },
    React.createElement(
      'ol',
      { className: 'rr-breadcrumb__list' },
      items.map((item, i) => {
        const last = i === items.length - 1;
        return React.createElement(
          'li',
          { key: i, style: { display: 'inline-flex', alignItems: 'center', gap: 'var(--space-2)' } },
          [
            last
              ? React.createElement(
                  'span',
                  { className: 'rr-breadcrumb__current', key: 'c', 'aria-current': 'page' },
                  item.label,
                )
              : React.createElement(
                  'a',
                  {
                    className: 'rr-breadcrumb__link',
                    key: 'l',
                    href: item.href || '#',
                    onClick: item.onClick,
                  },
                  item.label,
                ),
            last
              ? null
              : React.createElement(
                  'span',
                  { className: 'rr-breadcrumb__sep', key: 's', 'aria-hidden': 'true' },
                  '/',
                ),
          ],
        );
      }),
    ),
  );
}

export default Breadcrumb;
