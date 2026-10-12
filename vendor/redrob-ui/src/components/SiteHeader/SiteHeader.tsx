import * as React from 'react';
import { cx } from '../../internal/cx';
import { useStableId } from '../../internal/ids';
import { icons } from '../../icons';

export interface SiteHeaderItem {
  label?: React.ReactNode;
  href?: string;
  /** A second line under the item. What it is, in a few words. */
  detail?: React.ReactNode;
}

export interface SiteHeaderSection {
  label?: React.ReactNode;
  href?: string;
  /** Children turn this into a panel. Without them it is a plain link. */
  items?: SiteHeaderItem[];
}

export interface SiteHeaderProps {
  mark?: React.ReactNode;
  homeHref?: string;
  homeLabel?: string;
  /** At most six are rendered; the rest are dropped rather than wrapped. */
  sections?: SiteHeaderSection[];
  navLabel?: string;
  menuLabel?: string;
  themeLabel?: React.ReactNode;
  theme?: React.ReactNode;
  lang?: React.ReactNode;
  action?: React.ReactNode;
  stuck?: boolean;
  className?: string;
}

/**
 * The site's top bar: the mark, up to six sections, and the controls at the end.
 *
 * Six is a cap, not a suggestion - the list is sliced. A seventh section makes the bar wrap on a laptop, and a
 * navigation that reflows is a navigation people stop trusting.
 *
 * A section with children opens on hover AND on click, and the trigger is a real button with
 * `aria-expanded`. Hover alone is unreachable by keyboard and unusable on touch.
 *
 * Escape closes everything, from anywhere. The theme control travels into the mobile drawer, where the bar has
 * no room for it - which is why ThemeSwitch keeps two instances in step.
 */
export function SiteHeader(props: SiteHeaderProps): React.ReactElement {
  const sections = (props.sections || []).slice(0, 6);
  const [open, setOpen] = React.useState<number | null>(null);
  const [menu, setMenu] = React.useState(false);
  const id = useStableId('rr-nav');

  React.useEffect(() => {
    if (typeof document === 'undefined') return;
    function esc(event: KeyboardEvent): void {
      if (event.key === 'Escape') {
        setOpen(null);
        setMenu(false);
      }
    }
    document.addEventListener('keydown', esc);
    return () => document.removeEventListener('keydown', esc);
  }, []);

  function panel(s: SiteHeaderSection, i: number): React.ReactElement {
    if (!s.items || !s.items.length) {
      return React.createElement(
        'a',
        { className: 'rr-siteheader__link', key: i, href: s.href },
        s.label,
      );
    }
    const isOpen = open === i;
    return React.createElement(
      'div',
      {
        className: 'rr-siteheader__section',
        key: i,
        onMouseEnter: () => setOpen(i),
        onMouseLeave: () => setOpen(null),
      },
      [
        React.createElement(
          'button',
          {
            type: 'button',
            key: 'b',
            className: cx('rr-siteheader__link', isOpen && 'rr-siteheader__link--open'),
            'aria-expanded': String(isOpen),
            'aria-controls': `${id}-${i}`,
            onClick: () => setOpen(isOpen ? null : i),
          },
          [
            React.createElement('span', { key: 'l' }, s.label),
            React.createElement(
              'span',
              { key: 'c', className: cx('rr-siteheader__chev', isOpen && 'rr-siteheader__chev--open') },
              icons.chevronDown({ width: 13, height: 13 }),
            ),
          ],
        ),
        React.createElement(
          'div',
          {
            className: cx('rr-siteheader__panel', isOpen && 'rr-siteheader__panel--open'),
            key: 'p',
            id: `${id}-${i}`,
            hidden: !isOpen,
          },
          React.createElement(
            'ul',
            { className: 'rr-siteheader__list' },
            (s.items || []).map((it, j) =>
              React.createElement(
                'li',
                { key: j },
                React.createElement('a', { className: 'rr-siteheader__item', href: it.href }, [
                  React.createElement('span', { className: 'rr-siteheader__itemLabel', key: 'l' }, it.label),
                  it.detail
                    ? React.createElement(
                        'span',
                        { className: 'rr-siteheader__itemDetail', key: 'd' },
                        it.detail,
                      )
                    : null,
                ]),
              ),
            ),
          ),
        ),
      ],
    );
  }

  return React.createElement(
    'div',
    { className: cx('rr-siteheader', props.stuck && 'rr-siteheader--stuck', props.className) },
    [
      React.createElement(
        'a',
        {
          className: 'rr-siteheader__mark',
          key: 'm',
          href: props.homeHref || '/',
          'aria-label': props.homeLabel || 'Redrob, home',
        },
        props.mark,
      ),
      React.createElement(
        'nav',
        { className: 'rr-siteheader__nav', key: 'n', 'aria-label': props.navLabel || 'Main' },
        sections.map(panel),
      ),
      React.createElement('div', { className: 'rr-siteheader__end', key: 'e' }, [
        props.theme
          ? React.createElement('span', { key: 't', className: 'rr-siteheader__theme' }, props.theme)
          : null,
        props.lang
          ? React.createElement('span', { key: 'l', className: 'rr-siteheader__lang' }, props.lang)
          : null,
        props.action
          ? React.createElement('span', { key: 'a', className: 'rr-siteheader__action' }, props.action)
          : null,
        React.createElement(
          'button',
          {
            type: 'button',
            key: 'b',
            className: 'rr-siteheader__toggle',
            'aria-expanded': String(menu),
            'aria-controls': `${id}-m`,
            'aria-label': props.menuLabel || 'Menu',
            onClick: () => setMenu(!menu),
          },
          (menu ? icons.close : icons.menu)({ width: 20, height: 20 }),
        ),
      ]),
      React.createElement(
        'div',
        {
          className: cx('rr-siteheader__drawer', menu && 'rr-siteheader__drawer--open'),
          key: 'd',
          id: `${id}-m`,
          hidden: !menu,
        },
        [
          React.createElement(
            'ul',
            { className: 'rr-siteheader__mlist', key: 'l' },
            sections.map((s, i) =>
              React.createElement('li', { key: i, className: 'rr-siteheader__mitem' }, [
                s.href
                  ? React.createElement(
                      'a',
                      { key: 'a', className: 'rr-siteheader__mlink', href: s.href },
                      s.label,
                    )
                  : React.createElement('span', { key: 'a', className: 'rr-siteheader__mlink' }, s.label),
                (s.items || []).length
                  ? React.createElement(
                      'ul',
                      { key: 'u', className: 'rr-siteheader__msub' },
                      (s.items as SiteHeaderItem[]).map((it, j) =>
                        React.createElement(
                          'li',
                          { key: j },
                          React.createElement('a', { href: it.href }, it.label),
                        ),
                      ),
                    )
                  : null,
              ]),
            ),
          ),
          props.theme && menu
            ? React.createElement('div', { key: 't', className: 'rr-siteheader__mtheme' }, [
                React.createElement('span', { key: 'l' }, props.themeLabel || 'Theme'),
                props.theme,
              ])
            : null,
        ],
      ),
    ],
  );
}

export default SiteHeader;
