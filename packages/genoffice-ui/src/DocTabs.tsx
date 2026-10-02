import { useEffect, useRef, useState } from 'react'
import type { CSSProperties, KeyboardEvent, ReactElement, ReactNode } from 'react'
import { Icon } from './Icon'

export interface DocTab {
  id: string
  title: string
  /** Leading glyph, usually the document type's product icon. */
  icon?: ReactNode
  /** Shows a close button and allows Delete to close it. */
  closable?: boolean
  /** Unsaved changes: a dot that the close button replaces on hover. */
  dirty?: boolean
}

export interface DocTabsStrings {
  /** Names the tab list. */
  label: string
  /** The close button's accessible name. */
  close: string
  /** Appended to a dirty tab's accessible name, e.g. "unsaved changes". */
  unsaved?: string
}

export interface DocTabsProps {
  tabs: DocTab[]
  activeId: string | null
  strings: DocTabsStrings
  onActivate: (id: string) => void
  onClose?: (id: string) => void
  /** A drag released at a new slot. `toIndex` counts every tab, pinned ones included. */
  onReorder?: (id: string, toIndex: number) => void
  /** Leading tabs (e.g. Home) that cannot be dragged, and that nothing can be dropped before. */
  pinned?: number
  /** Rendered inside the scrolling strip, right after the last tab (e.g. a "new tab" button). */
  trailing?: ReactNode
  /** Rendered after the strip, outside the scroll area (e.g. a tab-list button). */
  end?: ReactNode
  /** Rendered before the strip (e.g. room for macOS traffic lights). */
  start?: ReactNode
  className?: string
}

interface DragInfo {
  pointerId: number
  id: string
  from: number
  startX: number
  /** viewport-x left edge + width of every tab, sampled when the drag starts */
  lefts: number[]
  widths: number[]
  target: number
  started: boolean
}

/**
 * The document tab strip: one tab per open document, browser style.
 *
 * The kit's Tabs switch views of one thing; these are separate documents that
 * open, close and reorder, so this is an Office composite on the kit's tokens.
 *
 * - Pointer: pressing a tab activates it at once (activation never depends on
 *   a click that a drag would swallow). Dragging past a 4px dead zone moves it;
 *   neighbours slide aside live and the order commits on release.
 * - Keyboard: the tablist pattern with a roving tabindex. Arrow keys, Home and
 *   End move focus without activating; Enter or Space activates; Delete closes
 *   a closable tab. The close buttons stay out of the Tab order for that reason.
 * - A mouse's vertical wheel scrolls the strip sideways, and the active tab is
 *   kept in view.
 */
export function DocTabs({
  tabs,
  activeId,
  strings,
  onActivate,
  onClose,
  onReorder,
  pinned = 0,
  trailing,
  end,
  start,
  className,
}: DocTabsProps): ReactElement {
  const stripRef = useRef<HTMLDivElement>(null)
  const dragRef = useRef<DragInfo | null>(null)
  const [dragVisual, setDragVisual] = useState<{
    id: string
    dx: number
    from: number
    target: number
    width: number
  } | null>(null)
  // the tab holding the roving tabindex; follows the active tab unless the
  // keyboard has moved it elsewhere
  const [focusId, setFocusId] = useState<string | null>(null)
  const rovingId = tabs.some((t) => t.id === focusId) ? focusId : activeId

  const tabEls = (): HTMLElement[] =>
    Array.from(stripRef.current?.querySelectorAll<HTMLElement>('.go-doctabs__tab') ?? [])

  const scrollActiveIntoView = (): void => {
    stripRef.current
      ?.querySelector('.go-doctabs__tab--active')
      ?.scrollIntoView({ inline: 'nearest', block: 'nearest' })
  }

  // a tab closed mid-drag unmounts its element, so pointerup never fires
  useEffect(() => {
    const drag = dragRef.current
    if (drag && !tabs.some((t) => t.id === drag.id)) {
      dragRef.current = null
      setDragVisual(null)
    }
  }, [tabs])

  // trackpads scroll the strip natively; map a mouse's vertical wheel to
  // horizontal. Native listener: React registers wheel as passive.
  useEffect(() => {
    const strip = stripRef.current
    if (!strip) return
    const onWheel = (event: WheelEvent): void => {
      if (strip.scrollWidth <= strip.clientWidth) return
      if (Math.abs(event.deltaY) <= Math.abs(event.deltaX)) return
      event.preventDefault()
      strip.scrollLeft += event.deltaY
    }
    strip.addEventListener('wheel', onWheel, { passive: false })
    return () => strip.removeEventListener('wheel', onWheel)
  }, [])

  // keep the active tab in view; skipped mid-press, where scrolling would
  // invalidate the geometry sampled at pointer-down
  useEffect(() => {
    if (!dragRef.current) scrollActiveIntoView()
  }, [activeId])

  const finishDrag = (pointerId: number, commit: boolean): void => {
    const drag = dragRef.current
    if (!drag || pointerId !== drag.pointerId) return
    dragRef.current = null
    if (!drag.started) {
      // a plain click: honour the in-view scroll suppressed during the press
      scrollActiveIntoView()
      return
    }
    setDragVisual(null)
    if (commit && drag.target !== drag.from) onReorder?.(drag.id, drag.target)
  }

  const focusTab = (index: number): void => {
    const tab = tabs[index]
    if (!tab) return
    setFocusId(tab.id)
    tabEls()[index]?.focus()
  }

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>, index: number, tab: DocTab): void => {
    switch (event.key) {
      case 'ArrowRight':
        event.preventDefault()
        focusTab((index + 1) % tabs.length)
        break
      case 'ArrowLeft':
        event.preventDefault()
        focusTab((index - 1 + tabs.length) % tabs.length)
        break
      case 'Home':
        event.preventDefault()
        focusTab(0)
        break
      case 'End':
        event.preventDefault()
        focusTab(tabs.length - 1)
        break
      case 'Enter':
      case ' ':
        event.preventDefault()
        onActivate(tab.id)
        break
      case 'Delete':
        if (tab.closable && onClose) {
          event.preventDefault()
          onClose(tab.id)
          // keep keyboard focus in the strip, on the neighbour
          window.requestAnimationFrame(() => focusTab(Math.min(index, tabs.length - 2)))
        }
        break
    }
  }

  const classes = ['go-doctabs', dragVisual && 'go-doctabs--dragging', className]
    .filter(Boolean)
    .join(' ')

  return (
    <div className={classes}>
      {start}
      <div className="go-doctabs__strip" ref={stripRef}>
        {/* display: contents, so the trailing button still hugs the last tab
            in the scroll area while staying outside the tablist */}
        <div className="go-doctabs__tabs" role="tablist" aria-label={strings.label}>
          {tabs.map((tab, index) => {
            const active = tab.id === activeId
            // live transforms: the grabbed tab tracks the pointer; tabs between
            // the origin and the current target slide aside by its width
            let dragStyle: CSSProperties | undefined
            if (dragVisual) {
              if (dragVisual.id === tab.id) {
                dragStyle = { transform: `translateX(${dragVisual.dx}px)` }
              } else if (dragVisual.target <= index && index < dragVisual.from) {
                dragStyle = { transform: `translateX(${dragVisual.width}px)` }
              } else if (dragVisual.from < index && index <= dragVisual.target) {
                dragStyle = { transform: `translateX(-${dragVisual.width}px)` }
              }
            }
            const tabClass = [
              'go-doctabs__tab',
              active && 'go-doctabs__tab--active',
              index < pinned && 'go-doctabs__tab--pinned',
              tab.dirty && 'go-doctabs__tab--dirty',
              dragVisual?.id === tab.id && 'go-doctabs__tab--drag',
            ]
              .filter(Boolean)
              .join(' ')
            return (
              <div
                key={tab.id}
                className={tabClass}
                role="tab"
                aria-selected={active}
                aria-label={
                  tab.dirty && strings.unsaved ? `${tab.title}, ${strings.unsaved}` : undefined
                }
                tabIndex={tab.id === rovingId ? 0 : -1}
                // long titles ellipsize; hover shows the whole name
                title={tab.title}
                style={dragStyle}
                onFocus={() => setFocusId(tab.id)}
                onKeyDown={(event) => onKeyDown(event, index, tab)}
                onPointerDown={(event) => {
                  if (event.button !== 0) return
                  if ((event.target as HTMLElement).closest('.go-doctabs__close')) return
                  if (!active) onActivate(tab.id)
                  if (index < pinned || !onReorder) return
                  const rects = tabEls().map((el) => el.getBoundingClientRect())
                  dragRef.current = {
                    pointerId: event.pointerId,
                    id: tab.id,
                    from: index,
                    startX: event.clientX,
                    lefts: rects.map((r) => r.left),
                    widths: rects.map((r) => r.width),
                    target: index,
                    started: false,
                  }
                  event.currentTarget.setPointerCapture?.(event.pointerId)
                }}
                onPointerMove={(event) => {
                  const drag = dragRef.current
                  if (!drag || event.pointerId !== drag.pointerId) return
                  let dx = event.clientX - drag.startX
                  if (!drag.started) {
                    // 4px dead zone so a plain click never wiggles the tab
                    if (Math.abs(dx) < 4) return
                    // re-sample: the pointer-down activation may have re-laid out the strip
                    const rects = tabEls().map((el) => el.getBoundingClientRect())
                    drag.lefts = rects.map((r) => r.left)
                    drag.widths = rects.map((r) => r.width)
                    drag.started = true
                  }
                  // geometry sampled from the same element list, so every index is in range
                  const left = (i: number): number => drag.lefts[i] ?? 0
                  const width = (i: number): number => drag.widths[i] ?? 0
                  // keep the tab inside the strip and behind the pinned tabs
                  const last = drag.lefts.length - 1
                  const first = Math.min(pinned, last)
                  const minDx = left(first) - left(drag.from)
                  const maxDx = left(last) + width(last) - width(drag.from) - left(drag.from)
                  dx = Math.min(Math.max(dx, minDx), Math.max(minDx, maxDx))
                  // swap once the grabbed tab's leading edge crosses a neighbour's midpoint
                  const draggedLeft = left(drag.from) + dx
                  const draggedRight = draggedLeft + width(drag.from)
                  let target = drag.from
                  for (let i = first; i < drag.from; i++) {
                    if (draggedLeft < left(i) + width(i) / 2) {
                      target = i
                      break
                    }
                  }
                  for (let i = last; i > drag.from; i--) {
                    if (draggedRight > left(i) + width(i) / 2) {
                      target = i
                      break
                    }
                  }
                  drag.target = target
                  setDragVisual({
                    id: drag.id,
                    dx,
                    from: drag.from,
                    target,
                    width: width(drag.from),
                  })
                }}
                onPointerUp={(event) => finishDrag(event.pointerId, true)}
                onPointerCancel={(event) => finishDrag(event.pointerId, false)}
                onLostPointerCapture={(event) => finishDrag(event.pointerId, false)}
              >
                {/* one plate serves hover and active, so the edges never shift between them */}
                <span className="go-doctabs__plate" aria-hidden="true" />
                {tab.icon && <span className="go-doctabs__icon">{tab.icon}</span>}
                <span className="go-doctabs__title">{tab.title}</span>
                {tab.dirty && <span className="go-doctabs__dirty" aria-hidden="true" />}
                {tab.closable && onClose && (
                  <button
                    type="button"
                    className="go-doctabs__close"
                    tabIndex={-1}
                    aria-label={strings.close}
                    title={strings.close}
                    onClick={(event) => {
                      event.stopPropagation()
                      onClose(tab.id)
                    }}
                  >
                    <Icon name="close" size={12} />
                  </button>
                )}
              </div>
            )
          })}
        </div>
        {trailing}
      </div>
      {end}
    </div>
  )
}
