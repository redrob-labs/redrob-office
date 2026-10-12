import * as React from 'react';
import { cx } from '../../internal/cx';
import { icons } from '../../icons';

export interface PaginationProps {
  page?: number;
  pageCount?: number;
  label?: string;
  previousLabel?: string;
  nextLabel?: string;
  className?: string;
  onChange?: (page: number) => void;
}

/**
 * Which page of a list this is, and how to reach the others.
 *
 * Always shows the first and last page, plus a window around the current one. Reaching the end of a long
 * list should not need a hundred clicks, and knowing how many pages there are is half of what this
 * control is for.
 */
export function pageList(page: number, count: number): Array<number | string> {
  const out: Array<number | string> = [];
  if (count <= 7) {
    for (let i = 1; i <= count; i++) out.push(i);
    return out;
  }
  out.push(1);
  const start = Math.max(2, page - 1);
  const end = Math.min(count - 1, page + 1);
  if (start > 2) out.push('gap-start');
  for (let i = start; i <= end; i++) out.push(i);
  if (end < count - 1) out.push('gap-end');
  out.push(count);
  return out;
}

/**
 * Page controls for a list.
 *
 * Every number carries its own `aria-label` ("Page 4"), because a bare digit on a button tells a screen
 * reader nothing about what pressing it does. The current page is marked with `aria-current`, not only a
 * colour.
 */
export function Pagination(props: PaginationProps): React.ReactElement {
  const page = props.page || 1;
  const count = props.pageCount || 1;

  function go(n: number): void {
    if (props.onChange && n >= 1 && n <= count && n !== page) props.onChange(n);
  }

  const kids: React.ReactNode[] = [
    React.createElement(
      'button',
      {
        type: 'button',
        key: 'prev',
        className: 'rr-page',
        disabled: page <= 1,
        'aria-label': props.previousLabel || 'Previous page',
        onClick: () => go(page - 1),
      },
      icons.chevronLeft({ width: 16, height: 16 }),
    ),
  ];

  pageList(page, count).forEach((item) => {
    if (typeof item === 'string') {
      kids.push(
        React.createElement('span', { key: item, className: 'rr-page__gap', 'aria-hidden': 'true' }, '…'),
      );
    } else {
      kids.push(
        React.createElement(
          'button',
          {
            type: 'button',
            key: `p${item}`,
            className: 'rr-page',
            'aria-current': item === page ? 'page' : undefined,
            'aria-label': `Page ${item}`,
            onClick: () => go(item),
          },
          item,
        ),
      );
    }
  });

  kids.push(
    React.createElement(
      'button',
      {
        type: 'button',
        key: 'next',
        className: 'rr-page',
        disabled: page >= count,
        'aria-label': props.nextLabel || 'Next page',
        onClick: () => go(page + 1),
      },
      icons.chevronRight({ width: 16, height: 16 }),
    ),
  );

  return React.createElement(
    'nav',
    { className: cx('rr-pagination', props.className), 'aria-label': props.label || 'Pagination' },
    kids,
  );
}

export default Pagination;
