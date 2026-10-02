import { useLayoutEffect, useRef } from 'react'
import type { KeyboardEvent, MouseEvent, ReactElement, ReactNode } from 'react'

/**
 * What a toolbar's arrow keys move between: every enabled control inside it.
 * A dropdown's options are the dropdown's own (focus stays on its trigger).
 */
const FOCUSABLE =
  'button:not(:disabled):not([role="option"]), [role="combobox"]:not(:disabled), input:not(:disabled)'
const ANY_CONTROL = 'button:not([role="option"]), [role="combobox"], input'
/** Fields whose arrow keys move a caret, which the toolbar must not take. */
const TEXT_ENTRY =
  'textarea, input:not([type="checkbox"]):not([type="radio"]):not([type="range"]):not([type="button"])'

export interface ToolbarProps {
  /** Names the toolbar for assistive technology. */
  label: string
  className?: string
  children?: ReactNode
}

/**
 * An editor toolbar: one Tab stop, arrow keys between its controls.
 *
 * The ARIA toolbar pattern. Tab enters on the last-focused control and leaves
 * the toolbar; Left/Right (and Home/End) move between enabled controls,
 * skipping disabled ones. Controls keep their own tabindex management simple:
 * the toolbar sets tabindex -1 on every control but the current one.
 */
export function Toolbar({ label, className, children }: ToolbarProps): ReactElement {
  const ref = useRef<HTMLDivElement>(null)
  const current = useRef<HTMLElement | null>(null)
  const controls = (): HTMLElement[] =>
    Array.from(ref.current?.querySelectorAll<HTMLElement>(FOCUSABLE) ?? []).filter(
      // a control inside an open popover (link field, dropdown list) is not a toolbar stop
      (el) => !el.closest('[data-toolbar-skip]'),
    )

  const rove = (next: HTMLElement): void => {
    current.current = next
    // disabled controls too, so one that is enabled later is not a stray Tab stop
    const all = ref.current?.querySelectorAll<HTMLElement>(ANY_CONTROL) ?? []
    for (const el of all) {
      if (!el.closest('[data-toolbar-skip]')) el.tabIndex = el === next ? 0 : -1
    }
  }

  // After every render, exactly one enabled control is the Tab stop: the last
  // one focused while it is still there and enabled, else the first.
  useLayoutEffect(() => {
    const list = controls()
    const stop = current.current && list.includes(current.current) ? current.current : list[0]
    if (stop) rove(stop)
  })

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>): void => {
    // a text field keeps its own arrow keys (caret movement); Tab leaves it
    if ((event.target as HTMLElement).matches?.(TEXT_ENTRY)) return
    const list = controls()
    const at = list.indexOf(document.activeElement as HTMLElement)
    if (at < 0) return
    let next: HTMLElement | undefined
    if (event.key === 'ArrowRight') next = list[(at + 1) % list.length]
    else if (event.key === 'ArrowLeft') next = list[(at - 1 + list.length) % list.length]
    else if (event.key === 'Home') next = list[0]
    else if (event.key === 'End') next = list[list.length - 1]
    if (!next) return
    event.preventDefault()
    rove(next)
    next.focus()
  }

  return (
    <div
      ref={ref}
      role="toolbar"
      aria-label={label}
      className={className ? `go-toolbar ${className}` : 'go-toolbar'}
      onKeyDown={onKeyDown}
      onFocus={(event) => {
        const target = event.target as HTMLElement
        if (target.matches(FOCUSABLE) && controls().includes(target)) rove(target)
      }}
    >
      {children}
    </div>
  )
}

export interface ToolbarGroupProps {
  /** Names the group, e.g. "Formatting". Optional: most groups are self-evident. */
  label?: string
  className?: string
  children?: ReactNode
}

/** A run of related controls; groups are separated by a hairline rule. */
export function ToolbarGroup({ label, className, children }: ToolbarGroupProps): ReactElement {
  return (
    <div
      role={label ? 'group' : undefined}
      aria-label={label}
      className={className ? `go-toolbar__group ${className}` : 'go-toolbar__group'}
    >
      {children}
    </div>
  )
}

/** Pushes everything after it to the far end of the toolbar. */
export function ToolbarSpacer(): ReactElement {
  return <div className="go-toolbar__spacer" aria-hidden="true" />
}

export interface ToolbarButtonProps {
  /** What the button does. It is the accessible name and the ScreenTip. */
  label: string
  /** The glyph. */
  icon: ReactNode
  /**
   * `sm`: an icon-only inline control. `lg`: icon over its visible label, for
   * the commands a toolbar leads with.
   */
  size?: 'sm' | 'lg'
  /**
   * A toggle's state. Set it (true or false) only for a control that toggles,
   * e.g. Bold; it becomes aria-pressed. Leave it unset for a plain command.
   */
  pressed?: boolean
  /** Shortcut shown dimmed in the ScreenTip, e.g. "Ctrl+B". */
  shortcut?: string
  /** A longer ScreenTip line under the name. */
  detail?: string
  disabled?: boolean
  /**
   * Keep focus (and so the editor's selection) where it is when the button is
   * pressed. On by default, which is what a formatting command needs.
   */
  keepFocus?: boolean
  className?: string
  onClick: (event: MouseEvent<HTMLButtonElement>) => void
}

/**
 * A toolbar command or toggle on the design system's tokens.
 *
 * The ScreenTip comes from the shared data-tip engine (installScreenTips), so
 * every toolbar in the suite times and draws its tips the same way.
 */
export function ToolbarButton({
  label,
  icon,
  size = 'sm',
  pressed,
  shortcut,
  detail,
  disabled,
  keepFocus = true,
  className,
  onClick,
}: ToolbarButtonProps): ReactElement {
  const classes = [
    'go-toolbar__btn',
    `go-toolbar__btn--${size}`,
    pressed && 'go-toolbar__btn--pressed',
    className,
  ]
    .filter(Boolean)
    .join(' ')
  return (
    <button
      type="button"
      className={classes}
      aria-label={size === 'lg' ? undefined : label}
      aria-pressed={pressed === undefined ? undefined : pressed}
      data-tip={label}
      data-tip-kbd={shortcut}
      data-tip-detail={detail}
      disabled={disabled}
      onMouseDown={keepFocus ? (event) => event.preventDefault() : undefined}
      onClick={onClick}
    >
      <span className="go-toolbar__icon" aria-hidden="true">
        {icon}
      </span>
      {size === 'lg' && <span className="go-toolbar__label">{label}</span>}
    </button>
  )
}
