import * as React from 'react';
import { cx } from '../../internal/cx';

export interface PageShellProps {
  /** The page's language. Written to `<html lang>`, which is what the font stack and line breaking read. */
  lang?: string;
  header?: React.ReactNode;
  footer?: React.ReactNode;
  /** Id of the main region. The skip link points at it. */
  mainId?: string;
  skipLabel?: React.ReactNode;
  className?: string;
  children?: React.ReactNode;
}

/**
 * The frame of a public page: a skip link, the banner, the main region, the footer.
 *
 * The skip link is first in the DOM and it is not optional. Without it a keyboard user tabs through the whole
 * header on every page before reaching the content.
 *
 * `main` carries `tabIndex={-1}` so the skip link can actually move focus there. A link to a container that
 * cannot receive focus scrolls the page and leaves focus behind, which looks like it worked and is not.
 *
 * `lang` is written to the document element rather than this div, because the font stack, `keep-all` line
 * breaking and a screen reader's pronunciation all read it from there.
 */
export function PageShell(props: PageShellProps): React.ReactElement {
  const lang = props.lang || 'en';

  React.useEffect(() => {
    if (typeof document === 'undefined') return;
    document.documentElement.setAttribute('lang', lang);
  }, [lang]);

  return React.createElement('div', { className: cx('rr-pageshell', props.className), 'data-lang': lang }, [
    React.createElement(
      'a',
      { className: 'rr-pageshell__skip', href: `#${props.mainId || 'main'}`, key: 's' },
      props.skipLabel || (lang === 'ko' ? '본문으로 건너뛰기' : 'Skip to the content'),
    ),
    props.header
      ? React.createElement(
          'header',
          { className: 'rr-pageshell__header', key: 'h', role: 'banner' },
          props.header,
        )
      : null,
    React.createElement(
      'main',
      { className: 'rr-pageshell__main', key: 'm', id: props.mainId || 'main', tabIndex: -1 },
      props.children,
    ),
    props.footer
      ? React.createElement(
          'footer',
          { className: 'rr-pageshell__footer', key: 'f', role: 'contentinfo' },
          props.footer,
        )
      : null,
  ]);
}

export default PageShell;
