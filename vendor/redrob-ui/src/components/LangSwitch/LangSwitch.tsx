import * as React from 'react';
import { cx } from '../../internal/cx';
import { useStableId } from '../../internal/ids';
import { useDismiss } from '../../internal/useDismiss';
import { useFloating } from '../../internal/useFloating';
import { icons } from '../../icons';

export interface LangOption {
  /** BCP 47 code. */
  code?: string;
  /** The language's name in that language. Never translated into the current one. */
  label?: React.ReactNode;
  /** THIS page in that language. Omit it and the language renders as unavailable. */
  href?: string;
  dir?: 'ltr' | 'rtl';
}

export interface LangSwitchProps {
  langs?: LangOption[];
  current?: string;
  /** Up to this many render inline; more become a disclosure. Three by default. */
  inlineUpTo?: number;
  /** `up` opens the menu above the trigger, for a switch at the foot of a sidebar. Default `down`. */
  placement?: 'down' | 'up';
  /** Which edge the menu lines up with. Default `right`. */
  align?: 'left' | 'right';
  /** Accessible name for the control. */
  label?: string;
  missingLabel?: string;
  className?: string;
  onChange?: (lang: LangOption) => void;
}

/**
 * Switches the page's language.
 *
 * `href` must be the SAME page in the other language. A switch that lands on the home page is the border this
 * company is named after, reversed - it takes something away for choosing a language. So a language with no
 * counterpart for this page renders as unavailable, with a reason, and never as a link home.
 *
 * Two languages fit on a line; twelve do not, and a site that will carry twelve should not be laid out as
 * though it carries two. Past `inlineUpTo` this becomes a disclosure rather than wrapping.
 *
 * Each label is marked with its own `lang`, so the browser sets it in the right script, and RTL codes get
 * `dir` without the consumer remembering to.
 */
export function LangSwitch(props: LangSwitchProps): React.ReactElement {
  const langs = props.langs || [];
  const current = props.current;
  const inlineUpTo = props.inlineUpTo == null ? 3 : props.inlineUpTo;
  const [open, setOpen] = React.useState(false);
  const close = React.useCallback(() => setOpen(false), []);
  const ref = useDismiss<HTMLDivElement>(open, close);
  useFloating(
    open,
    () => [
      ref.current && ref.current.querySelector<HTMLElement>('.rr-lang__trigger'),
      ref.current && ref.current.querySelector<HTMLElement>('.rr-lang__menu'),
    ],
    { side: props.placement === 'up' ? 'top' : 'bottom', align: props.align === 'left' ? 'start' : 'end', fitHeight: true },
  );
  const id = useStableId('rr-lang');

  let here: LangOption | null = null;
  for (let k = 0; k < langs.length; k++) if (langs[k].code === current) here = langs[k];

  function entry(l: LangOption): React.ReactElement {
    const on = l.code === current;
    const missing = !l.href;
    const dir = l.dir || (/^(ar|he|fa|ur)\b/.test(l.code || '') ? 'rtl' : undefined);
    return on
      ? React.createElement(
          'span',
          { className: 'rr-lang__on', 'aria-current': 'true', lang: l.code, dir },
          l.label,
        )
      : missing
        ? React.createElement(
            'span',
            {
              className: 'rr-lang__off',
              lang: l.code,
              dir,
              title: props.missingLabel || `This page is not in ${l.label} yet`,
            },
            l.label,
          )
        : React.createElement(
            'a',
            {
              className: 'rr-lang__link',
              href: l.href,
              lang: l.code,
              hrefLang: l.code,
              dir,
              rel: 'alternate',
              onClick: props.onChange && (() => props.onChange && props.onChange(l)),
            },
            l.label,
          );
  }

  if (langs.length > inlineUpTo) {
    // placement 'up' for a switch at the foot of a sidebar or page; align 'left' when it sits at a left edge.
    return React.createElement(
      'div',
      {
        ref,
        className: cx(
          'rr-lang',
          'rr-lang--menu',
          props.placement === 'up' && 'rr-lang--up',
          props.align === 'left' && 'rr-lang--left',
          props.className,
        ),
      },
      [
      React.createElement(
        'button',
        {
          type: 'button',
          key: 'b',
          className: 'rr-lang__trigger',
          'aria-expanded': String(open),
          'aria-controls': id,
          'aria-label': props.label ? `${props.label}, ${(here && here.label) || ''}` : undefined,
          onClick: () => setOpen(!open),
        },
        [
          React.createElement(
            'span',
            { key: 'i', className: 'rr-lang__icon', 'aria-hidden': 'true' },
            icons.translate({ width: 15, height: 15 }),
          ),
          React.createElement(
            'span',
            { key: 'l', lang: here && here.code },
            (here && here.label) || props.label || 'Language',
          ),
          React.createElement(
            'span',
            { key: 'c', className: cx('rr-lang__chev', open && 'rr-lang__chev--open') },
            icons.chevronDown({ width: 13, height: 13 }),
          ),
        ],
      ),
      React.createElement(
        'ul',
        {
          className: cx('rr-lang__menu', open && 'rr-lang__menu--open'),
          key: 'm',
          id,
          hidden: !open,
        },
        langs.map((l, i) =>
          React.createElement('li', { key: l.code || i, className: 'rr-lang__row' }, entry(l)),
        ),
      ),
    ]);
  }

  return React.createElement('div', { className: cx('rr-lang', props.className) }, [
    React.createElement(
      'span',
      { className: 'rr-lang__icon', key: 'i', 'aria-hidden': 'true' },
      icons.translate({ width: 15, height: 15 }),
    ),
    React.createElement(
      'ul',
      { className: 'rr-lang__list', key: 'l', role: 'list' },
      langs.map((l, i) =>
        React.createElement('li', { key: l.code || i, className: 'rr-lang__item' }, entry(l)),
      ),
    ),
  ]);
}

export default LangSwitch;
