import * as React from 'react';
import { cx } from '../../internal/cx';
import { icons } from '../../icons';

export interface AccordionItem {
  id: string;
  title?: React.ReactNode;
  /** A count or date on the right of the trigger. */
  meta?: React.ReactNode;
  content?: React.ReactNode;
  disabled?: boolean;
}

export interface AccordionProps {
  items?: AccordionItem[];
  /** Allow several open at once. One at a time by default. */
  multiple?: boolean;
  /** Id, or ids, open on first render. */
  defaultOpen?: string | string[];
  className?: string;
}

/**
 * Sections that open one at a time, for content most readers will skip.
 *
 * Right for a FAQ or a long settings page; wrong for anything a reader needs to compare, and wrong for
 * anything they must not miss - collapsed content is content most people never see, and it is invisible
 * to a page search.
 *
 * The panel is `hidden` rather than removed, so its text stays findable in the DOM, and it keeps a
 * `region` role labelled by its own trigger so a screen reader can tell which section it landed in.
 */
export function Accordion(props: AccordionProps): React.ReactElement {
  const items = props.items || [];
  const multiple = !!props.multiple;
  const initial = props.defaultOpen != null ? ([] as string[]).concat(props.defaultOpen) : [];
  const [open, setOpen] = React.useState<string[]>(initial);

  function toggle(id: string): void {
    setOpen((cur) => {
      const isOpen = cur.indexOf(id) !== -1;
      if (isOpen) return cur.filter((x) => x !== id);
      return multiple ? cur.concat([id]) : [id];
    });
  }

  return React.createElement(
    'div',
    { className: cx('rr-accordion', props.className) },
    items.map((item) => {
      const isOpen = open.indexOf(item.id) !== -1;
      return React.createElement('div', { className: 'rr-accordion__item', key: item.id }, [
        React.createElement(
          'button',
          {
            type: 'button',
            key: 'h',
            className: 'rr-accordion__trigger',
            'aria-expanded': String(isOpen),
            'aria-controls': `acc-panel-${item.id}`,
            id: `acc-trigger-${item.id}`,
            disabled: item.disabled,
            onClick: () => toggle(item.id),
          },
          [
            React.createElement('span', { key: 't', className: 'rr-accordion__label' }, item.title),
            item.meta
              ? React.createElement('span', { key: 'm', className: 'rr-accordion__meta' }, item.meta)
              : null,
            React.createElement(
              'span',
              {
                key: 'c',
                className: cx('rr-accordion__chevron', isOpen && 'rr-accordion__chevron--open'),
              },
              icons.chevronDown({ width: 16, height: 16 }),
            ),
          ],
        ),
        React.createElement(
          'div',
          {
            key: 'p',
            id: `acc-panel-${item.id}`,
            role: 'region',
            'aria-labelledby': `acc-trigger-${item.id}`,
            className: 'rr-accordion__panel',
            hidden: !isOpen,
          },
          item.content,
        ),
      ]);
    }),
  );
}

export default Accordion;
