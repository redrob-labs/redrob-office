import {
  useEffect,
  useId,
  useRef,
  useState,
  type KeyboardEvent,
  type ReactElement,
  type ReactNode,
} from 'react'
import { Button, icons, type IconName } from '@redrob-labs/ui'
import { formatOf } from './formats'

const cx = (...p: Array<string | false | null | undefined>) => p.filter(Boolean).join(' ')
const glyph = (name: IconName, size = 14) => {
  const G = icons[name]
  return G ? <G width={size} height={size} aria-hidden="true" /> : null
}

/* ── a radio group of buttons with arrow-key roving ─────────────────────── */

interface SegOption<V extends string> {
  value: V
  label: string
  icon?: IconName | undefined
  hint?: string | undefined
}

function Segmented<V extends string>({
  options,
  value,
  onChange,
  label,
  className,
}: {
  options: readonly SegOption<V>[]
  value: V
  onChange: (v: V) => void
  label: string
  className?: string | undefined
}): ReactElement {
  const refs = useRef<Array<HTMLButtonElement | null>>([])
  const onKey = (e: KeyboardEvent, i: number) => {
    const d = e.key === 'ArrowRight' || e.key === 'ArrowDown' ? 1 : e.key === 'ArrowLeft' || e.key === 'ArrowUp' ? -1 : 0
    if (!d) return
    e.preventDefault()
    const n = (i + d + options.length) % options.length
    onChange(options[n]!.value)
    refs.current[n]?.focus()
  }
  return (
    <div role="radiogroup" aria-label={label} className={cx('go-seg', className)}>
      {options.map((o, i) => (
        <button
          key={o.value}
          ref={(el) => {
            refs.current[i] = el
          }}
          type="button"
          role="radio"
          aria-checked={o.value === value}
          tabIndex={o.value === value ? 0 : -1}
          title={o.hint}
          className="go-seg__o"
          onClick={() => onChange(o.value)}
          onKeyDown={(e) => onKey(e, i)}
        >
          {o.icon ? glyph(o.icon) : null}
          <span>{o.label}</span>
        </button>
      ))}
    </div>
  )
}

/* ── Toolbar: Simple | Classic ──────────────────────────────────────────── */

export type ToolbarChoice = 'simple' | 'classic'

export interface ToolbarSwitchStrings {
  /** the visible label beside the switch: Toolbar */
  label: string
  simple: string
  simpleHint: string
  classic: string
  classicHint: string
  /** the one-time tip */
  tipTitle: string
  tipBody: string
  tipDismiss: string
}

/** localStorage key for the one-time tip, shared by every editor */
export const TOOLBAR_TIP_KEY = 'redrob.office.toolbarTipSeen'

function tipSeen(): boolean {
  try {
    return localStorage.getItem(TOOLBAR_TIP_KEY) === '1'
  } catch {
    return true
  }
}

function markTipSeen(): void {
  try {
    localStorage.setItem(TOOLBAR_TIP_KEY, '1')
  } catch {
    /* private storage: the tip simply shows again next time */
  }
}

export interface ToolbarSwitchProps {
  value: ToolbarChoice
  onChange: (v: ToolbarChoice) => void
  strings: ToolbarSwitchStrings
  /** show the one-time tip if it was never dismissed (default true) */
  tip?: boolean | undefined
}

/**
 * The labeled toolbar switch beside the tools: never hidden behind an icon.
 * A one-time tip says the full ribbon is a click (or Ctrl+F1) away.
 */
export function ToolbarSwitch({ value, onChange, strings, tip = true }: ToolbarSwitchProps): ReactElement {
  const [showTip, setShowTip] = useState(() => tip && value === 'simple' && !tipSeen())
  const tipId = useId()
  const dismiss = () => {
    markTipSeen()
    setShowTip(false)
  }
  return (
    <div className="go-tbswitch" data-toolbar-skip>
      <span className="go-tbswitch__label" aria-hidden="true">
        {strings.label}
      </span>
      <Segmented
        label={strings.label}
        value={value}
        onChange={(v) => {
          if (showTip) dismiss()
          onChange(v)
        }}
        options={[
          { value: 'simple', label: strings.simple, icon: 'layout', hint: strings.simpleHint },
          { value: 'classic', label: strings.classic, icon: 'columns', hint: strings.classicHint },
        ]}
      />
      {showTip ? (
        <div className="go-tbswitch__tip" role="note" aria-labelledby={tipId}>
          <p id={tipId} className="go-tbswitch__tip-title">
            {strings.tipTitle}
          </p>
          <p className="go-tbswitch__tip-body">{strings.tipBody}</p>
          <Button size="sm" variant="secondary" onClick={dismiss}>
            {strings.tipDismiss}
          </Button>
        </div>
      ) : null}
    </div>
  )
}

/* ── Editing / Suggesting / Viewing ─────────────────────────────────────── */

export type EditMode = 'editing' | 'suggesting' | 'viewing'

export interface ModeMenuStrings {
  label: string
  editing: string
  suggesting: string
  viewing: string
  editingHint: string
  suggestingHint: string
  viewingHint: string
}

export interface ModeMenuProps {
  value: EditMode
  onChange: (m: EditMode) => void
  strings: ModeMenuStrings
  /** modes this file cannot offer yet (e.g. Suggesting where there is no tracked-change model) */
  unavailable?: readonly EditMode[] | undefined
}

/** the mode button in the title bar, and its menu of three radio items */
export function ModeMenu({ value, onChange, strings, unavailable = [] }: ModeMenuProps): ReactElement {
  const [open, setOpen] = useState(false)
  const menuId = useId()
  const root = useRef<HTMLDivElement>(null)
  const items: Array<{ m: EditMode; label: string; hint: string; icon: IconName }> = [
    { m: 'editing', label: strings.editing, hint: strings.editingHint, icon: 'edit' },
    { m: 'suggesting', label: strings.suggesting, hint: strings.suggestingHint, icon: 'comment' },
    { m: 'viewing', label: strings.viewing, hint: strings.viewingHint, icon: 'eye' },
  ]
  useEffect(() => {
    if (!open) return
    const onDown = (e: PointerEvent) => {
      if (!root.current?.contains(e.target as Node)) setOpen(false)
    }
    window.addEventListener('pointerdown', onDown)
    return () => window.removeEventListener('pointerdown', onDown)
  }, [open])
  const focusItem = (i: number) =>
    root.current?.querySelectorAll<HTMLElement>('[role="menuitemradio"]:not([aria-disabled="true"])')[i]?.focus()
  const current = items.find((i) => i.m === value) ?? items[0]!
  return (
    <div className="go-modemenu" ref={root}>
      <button
        type="button"
        className="go-modemenu__btn"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={menuId}
        aria-label={`${strings.label}: ${current.label}`}
        onClick={() => {
          setOpen((o) => !o)
          if (!open) requestAnimationFrame(() => focusItem(0))
        }}
      >
        <span>{current.label}</span>
        {glyph('chevronDown', 12)}
      </button>
      {open ? (
        <div
          id={menuId}
          role="menu"
          aria-label={strings.label}
          className="go-modemenu__list"
          onKeyDown={(e) => {
            const list = Array.from(
              root.current?.querySelectorAll<HTMLElement>('[role="menuitemradio"]:not([aria-disabled="true"])') ?? [],
            )
            const i = list.indexOf(document.activeElement as HTMLElement)
            if (e.key === 'ArrowDown') {
              e.preventDefault()
              list[(i + 1) % list.length]?.focus()
            } else if (e.key === 'ArrowUp') {
              e.preventDefault()
              list[(i - 1 + list.length) % list.length]?.focus()
            } else if (e.key === 'Escape') {
              setOpen(false)
              root.current?.querySelector<HTMLElement>('.go-modemenu__btn')?.focus()
            }
          }}
        >
          {items.map((it) => {
            const off = unavailable.includes(it.m)
            return (
              <button
                key={it.m}
                type="button"
                role="menuitemradio"
                aria-checked={it.m === value}
                aria-disabled={off || undefined}
                className="go-modemenu__item"
                onClick={() => {
                  if (off) return
                  onChange(it.m)
                  setOpen(false)
                }}
              >
                {glyph(it.icon, 15)}
                <span className="go-modemenu__text">
                  <span className="go-modemenu__name">{it.label}</span>
                  <span className="go-modemenu__hint">{it.hint}</span>
                </span>
              </button>
            )
          })}
        </div>
      ) : null}
    </div>
  )
}

/* ── the format chip ─────────────────────────────────────────────────────── */

export interface FormatChipProps {
  /** the file name or extension */
  file: string
}

/** the format, and what it keeps on open and save as the chip's tooltip */
export function FormatChip({ file }: FormatChipProps): ReactElement | null {
  const info = formatOf(file)
  if (!info) return null
  return (
    <span
      className={cx('go-fmtchip', info.tone === 'old' && 'go-fmtchip--old')}
      title={info.note}
      aria-label={`${info.label}, ${info.ext}. ${info.note}`}
      role="img"
    >
      {glyph(info.tone === 'old' ? ('alert') : ('check'), 12)}
      <span aria-hidden="true">{info.ext}</span>
    </span>
  )
}

/* ── the status bar ─────────────────────────────────────────────────────── */

export interface StatusBarProps {
  /** names the bar for assistive technology */
  label: string
  /** page, words, mode, comments: left to right */
  items?: ReactNode[] | undefined
  /** Online or Offline */
  connection?: { online: boolean; onlineLabel: string; offlineLabel: string } | undefined
  /** zoom controls, at the right */
  zoom?: ReactNode | undefined
}

export function StatusBar({ label, items = [], connection, zoom }: StatusBarProps): ReactElement {
  return (
    <footer className="go-statusbar" role="contentinfo" aria-label={label}>
      <div className="go-statusbar__items">
        {items.filter(Boolean).map((it, i) => (
          <span key={i} className="go-statusbar__item">
            {it}
          </span>
        ))}
      </div>
      <div className="go-statusbar__end">
        {connection ? (
          <span
            className={cx('go-statusbar__conn', !connection.online && 'go-statusbar__conn--off')}
            role="status"
          >
            <span className="go-statusbar__dot" aria-hidden="true" />
            {connection.online ? connection.onlineLabel : connection.offlineLabel}
          </span>
        ) : null}
        {zoom}
      </div>
    </footer>
  )
}
