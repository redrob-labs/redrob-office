import * as React from 'react';
import { cx } from '../../internal/cx';
import { useStableId } from '../../internal/ids';
import { applyTheme, themeTarget, THEME_OPTS, ThemeMode } from '../../internal/theme';
import { icons, IconName } from '../../icons';

export interface ThemeSwitchProps {
  value?: ThemeMode;
  defaultValue?: ThemeMode;
  /** Where to persist the choice. Omit it and the choice lasts one page. */
  storageKey?: string;
  /** Element the attributes are written to. Defaults to `<html>`. */
  target?: HTMLElement | null;
  label?: string;
  labels?: Partial<Record<ThemeMode, string>>;
  size?: 'sm' | 'md';
  className?: string;
  onChange?: (mode: ThemeMode) => void;
}

/**
 * System, light, dark - three options, not a toggle.
 *
 * A two-state toggle cannot say "follow my computer", which is what most people want and what a fresh visit
 * should do. So `system` is a real choice that keeps following the OS while it is selected, and the component
 * writes both `data-theme-mode` (what was chosen) and `data-theme` (what is rendered).
 *
 * A `radiogroup` with arrow-key movement and a roving tabindex, because these are three states of one setting
 * rather than three independent buttons.
 *
 * The MutationObserver keeps two switches on one page in step - the header's and the one that travels into
 * the mobile drawer. Without it, changing the theme in the drawer leaves the header's switch showing the old
 * value.
 *
 * Every `localStorage` access is wrapped: in a private window it throws, and a theme switch that crashes the
 * page is worse than one that forgets.
 */
export function ThemeSwitch(props: ThemeSwitchProps): React.ReactElement {
  const labels = props.labels || {};

  const initial = (): ThemeMode => {
    if (props.defaultValue) return props.defaultValue;
    let saved: string | null = null;
    if (props.storageKey) {
      try {
        saved = window.localStorage.getItem(props.storageKey);
      } catch {
        saved = null;
      }
    }
    if (saved === 'light' || saved === 'dark' || saved === 'system') return saved;
    const el = themeTarget(props.target);
    const m = el && el.getAttribute('data-theme-mode');
    if (m) return m as ThemeMode;
    const t = el && el.getAttribute('data-theme');
    return t === 'light' || t === 'dark' ? t : 'system';
  };

  const [held, setHeld] = React.useState<ThemeMode>(initial);
  const mode = props.value !== undefined ? props.value : held;
  const name = useStableId('rr-theme');

  React.useEffect(() => {
    if (!props.storageKey) return;
    let saved: string | null = null;
    try {
      saved = window.localStorage.getItem(props.storageKey);
    } catch {
      saved = null;
    }
    if (saved) applyTheme(themeTarget(props.target), saved as ThemeMode);
  }, []);

  React.useEffect(() => {
    if (mode !== 'system') return undefined;
    let mq: MediaQueryList;
    try {
      mq = window.matchMedia('(prefers-color-scheme: dark)');
    } catch {
      return undefined;
    }
    const el = themeTarget(props.target);
    function on(): void {
      if (el && el.getAttribute('data-theme-mode') === 'system') applyTheme(el, 'system');
    }
    if (mq.addEventListener) mq.addEventListener('change', on);
    else if (mq.addListener) mq.addListener(on);
    return () => {
      if (mq.removeEventListener) mq.removeEventListener('change', on);
      else if (mq.removeListener) mq.removeListener(on);
    };
  }, [mode]);

  React.useEffect(() => {
    const el = themeTarget(props.target);
    if (!el || typeof MutationObserver === 'undefined' || props.value !== undefined) return undefined;
    const ob = new MutationObserver(() => {
      const m = el.getAttribute('data-theme-mode');
      if (m) setHeld(m as ThemeMode);
    });
    ob.observe(el, { attributes: true, attributeFilter: ['data-theme-mode'] });
    return () => ob.disconnect();
  }, []);

  function choose(id: ThemeMode): void {
    if (props.value === undefined) setHeld(id);
    applyTheme(themeTarget(props.target), id);
    if (props.storageKey) {
      try {
        window.localStorage.setItem(props.storageKey, id);
      } catch {
        // A private window refuses to store. The choice still applies for this page.
      }
    }
    if (props.onChange) props.onChange(id);
  }

  function onKey(event: React.KeyboardEvent<HTMLDivElement>): void {
    const i = THEME_OPTS.map((o) => o.id).indexOf(mode);
    let next: (typeof THEME_OPTS)[number] | null = null;
    if (event.key === 'ArrowRight' || event.key === 'ArrowDown') next = THEME_OPTS[(i + 1) % 3];
    if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') next = THEME_OPTS[(i + 2) % 3];
    if (next) {
      event.preventDefault();
      choose(next.id);
      const btn = event.currentTarget.querySelector<HTMLElement>(`[data-theme-opt="${next.id}"]`);
      if (btn) btn.focus();
    }
  }

  return React.createElement(
    'div',
    {
      className: cx('rr-theme', props.size === 'sm' && 'rr-theme--sm', props.className),
      role: 'radiogroup',
      'aria-label': props.label || 'Theme',
      onKeyDown: onKey,
    },
    THEME_OPTS.map((o) => {
      const on = o.id === mode;
      const text = labels[o.id] || o.label;
      return React.createElement(
        'button',
        {
          type: 'button',
          key: o.id,
          role: 'radio',
          'aria-checked': String(on),
          'aria-label': text,
          title: text,
          'data-theme-opt': o.id,
          name,
          tabIndex: on ? 0 : -1,
          className: 'rr-theme__opt',
          onClick: () => choose(o.id),
        },
        icons[o.icon as IconName]({ width: 16, height: 16 }),
      );
    }),
  );
}

export default ThemeSwitch;
