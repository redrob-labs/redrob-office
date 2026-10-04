import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
  type ReactElement,
  type ReactNode,
} from 'react'
import { IconButton, icons } from '@redrob-labs/ui'
import {
  CommandSearch,
  type CommandSearchHandle,
  type CommandSearchStrings,
  type FrameTool,
} from './CommandSearch'
import {
  FormatChip,
  ModeMenu,
  ToolbarSwitch,
  type ModeMenuProps,
  type ToolbarChoice,
  type ToolbarSwitchStrings,
} from './parts'
import { PANEL_DEFAULT, PANEL_MAX, PANEL_MIN, clampPanelWidth, frameLayout } from './layout'

export type FrameShortcut = 'toggleToolbar' | 'togglePanel' | 'search'

/**
 * The frame's own keys: Ctrl+F1 switches the toolbar, Ctrl+J (Cmd+J on a Mac)
 * toggles Redrob, Alt+Q goes to the title bar search.
 */
export function frameShortcut(e: Pick<KeyboardEvent, 'key' | 'code' | 'ctrlKey' | 'metaKey' | 'altKey' | 'shiftKey'>): FrameShortcut | null {
  const mod = e.ctrlKey || e.metaKey
  if (mod && !e.altKey && !e.shiftKey && e.key === 'F1') return 'toggleToolbar'
  if (mod && !e.altKey && !e.shiftKey && (e.code === 'KeyJ' || e.key.toLowerCase() === 'j')) return 'togglePanel'
  if (e.altKey && !mod && !e.shiftKey && (e.code === 'KeyQ' || e.key.toLowerCase() === 'q')) return 'search'
  return null
}

export interface EditorFrameStrings {
  /** names the title bar region */
  titleBar: string
  undo: string
  redo: string
  /** the panel's resize handle: "Resize the Redrob panel" */
  resizePanel: string
  /** names the tools row */
  tools: string
}

export interface EditorFrameProps {
  strings: EditorFrameStrings
  /* title bar, left to right */
  fileMenu?: ReactNode | undefined
  onUndo?: (() => void) | undefined
  onRedo?: (() => void) | undefined
  canUndo?: boolean | undefined
  canRedo?: boolean | undefined
  /** the file name (with extension) the format chip reads */
  fileName: string
  /** shown in place of the plain name, e.g. an editable title */
  title?: ReactNode | undefined
  /** save status; opens version history where the editor has it */
  saveStatus?: ReactNode | undefined
  search: { tools: readonly FrameTool[]; strings: CommandSearchStrings; onAsk?: (q: string) => void }
  /** faces of people in the file (empty until sync) */
  faces?: ReactNode | undefined
  mode?: ModeMenuProps | undefined
  /** Share, once a file can be shared */
  share?: ReactNode | undefined
  /* tools row */
  toolbar: ToolbarChoice
  onToolbarChange: (t: ToolbarChoice) => void
  toolbarStrings: ToolbarSwitchStrings
  simpleToolbar: ReactNode
  classicToolbar: ReactNode
  /** e.g. the older-format banner, under the tools */
  banner?: ReactNode | undefined
  /* body */
  rail?: ReactNode | undefined
  /** the rail's width when shown */
  railWidth?: number | undefined
  children: ReactNode
  /** the Redrob panel */
  panel?: ReactNode | undefined
  panelOpen: boolean
  onPanelOpenChange: (open: boolean) => void
  panelWidth: number
  onPanelWidthChange: (w: number) => void
  status?: ReactNode | undefined
  className?: string | undefined
}

/**
 * The editor frame every Office editor shares: the title bar, the tools row
 * with `Toolbar: Simple | Classic`, the page, Redrob on the right, the status
 * bar. The page never goes under 460px; the panel gives way first.
 */
export function EditorFrame(props: EditorFrameProps): ReactElement {
  const {
    strings,
    toolbar,
    onToolbarChange,
    panelOpen,
    onPanelOpenChange,
    panelWidth,
    onPanelWidthChange,
    railWidth = 0,
  } = props
  const search = useRef<CommandSearchHandle>(null)
  const body = useRef<HTMLDivElement>(null)
  const [bodyWidth, setBodyWidth] = useState<number | null>(null)
  const [resizing, setResizing] = useState(false)

  // live props for the window listener, without re-subscribing every render
  const live = useRef({ toolbar, panelOpen, onToolbarChange, onPanelOpenChange })
  live.current = { toolbar, panelOpen, onToolbarChange, onPanelOpenChange }

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const s = frameShortcut(e)
      if (!s) return
      e.preventDefault()
      const l = live.current
      if (s === 'toggleToolbar') l.onToolbarChange(l.toolbar === 'simple' ? 'classic' : 'simple')
      else if (s === 'togglePanel') l.onPanelOpenChange(!l.panelOpen)
      else search.current?.focus()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  useLayoutEffect(() => {
    const el = body.current
    if (!el) return
    const measure = () => setBodyWidth(el.getBoundingClientRect().width)
    measure()
    if (typeof ResizeObserver === 'undefined') return
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  const hasPanel = props.panel != null
  const layout =
    bodyWidth && bodyWidth > 0
      ? frameLayout({ width: bodyWidth, rail: props.rail ? railWidth : 0, preferred: panelWidth, open: panelOpen && hasPanel })
      : { panelOpen: panelOpen && hasPanel, panel: clampPanelWidth(panelWidth), page: 0, constrained: false }

  const startResize = (e: ReactPointerEvent<HTMLDivElement>) => {
    e.preventDefault()
    const handle = e.currentTarget
    const right = body.current?.getBoundingClientRect().right ?? window.innerWidth
    handle.setPointerCapture(e.pointerId)
    setResizing(true)
    const move = (ev: PointerEvent) => onPanelWidthChange(clampPanelWidth(right - ev.clientX))
    const end = () => {
      setResizing(false)
      handle.removeEventListener('pointermove', move)
      handle.removeEventListener('pointerup', end)
      handle.removeEventListener('pointercancel', end)
    }
    handle.addEventListener('pointermove', move)
    handle.addEventListener('pointerup', end)
    handle.addEventListener('pointercancel', end)
  }
  const resizeKey = (e: ReactKeyboardEvent<HTMLDivElement>) => {
    const step = e.shiftKey ? 64 : 16
    if (e.key === 'ArrowLeft') onPanelWidthChange(clampPanelWidth(panelWidth + step))
    else if (e.key === 'ArrowRight') onPanelWidthChange(clampPanelWidth(panelWidth - step))
    else if (e.key === 'Home') onPanelWidthChange(PANEL_MAX)
    else if (e.key === 'End') onPanelWidthChange(PANEL_MIN)
    else return
    e.preventDefault()
  }

  const Undo = icons.undo
  const Redo = icons.redo

  return (
    <div className={`go-frame${resizing ? ' go-frame--resizing' : ''}${props.className ? ` ${props.className}` : ''}`}>
      <header className="go-frame__title" aria-label={strings.titleBar}>
        <div className="go-frame__title-start">
          {props.fileMenu}
          {props.onUndo ? (
            <IconButton size="sm" variant="ghost" label={strings.undo} disabled={props.canUndo === false} onClick={props.onUndo}>
              <Undo width={16} height={16} />
            </IconButton>
          ) : null}
          {props.onRedo ? (
            <IconButton size="sm" variant="ghost" label={strings.redo} disabled={props.canRedo === false} onClick={props.onRedo}>
              <Redo width={16} height={16} />
            </IconButton>
          ) : null}
          <span className="go-frame__name">{props.title ?? props.fileName}</span>
          <FormatChip file={props.fileName} />
          {props.saveStatus ? <span className="go-frame__save">{props.saveStatus}</span> : null}
        </div>
        <CommandSearch
          ref={search}
          className="go-frame__search"
          tools={props.search.tools}
          strings={props.search.strings}
          onAsk={props.search.onAsk}
        />
        <div className="go-frame__title-end">
          {props.faces}
          {props.mode ? <ModeMenu {...props.mode} /> : null}
          {props.share}
        </div>
      </header>

      <div className="go-frame__tools" role="region" aria-label={strings.tools}>
        <div className="go-frame__toolbar">{toolbar === 'simple' ? props.simpleToolbar : props.classicToolbar}</div>
        <ToolbarSwitch value={toolbar} onChange={onToolbarChange} strings={props.toolbarStrings} />
      </div>
      {props.banner}

      <div className="go-frame__body" ref={body}>
        {props.rail ? (
          <aside className="go-frame__rail" style={{ width: railWidth }}>
            {props.rail}
          </aside>
        ) : null}
        <main className="go-frame__page" style={{ minWidth: Math.min(460, layout.page || 460) }}>
          {props.children}
        </main>
        {/* the panel stays mounted while closed, so a run and its history survive */}
        {hasPanel ? (
          <aside
            className="go-frame__panel"
            style={{ width: layout.panel }}
            hidden={!layout.panelOpen}
          >
            <div
              className="go-frame__resizer"
              role="separator"
              aria-orientation="vertical"
              aria-label={strings.resizePanel}
              aria-valuemin={PANEL_MIN}
              aria-valuemax={PANEL_MAX}
              aria-valuenow={layout.panel}
              tabIndex={0}
              onPointerDown={startResize}
              onKeyDown={resizeKey}
              onDoubleClick={() => onPanelWidthChange(PANEL_DEFAULT)}
            />
            {props.panel}
          </aside>
        ) : null}
      </div>

      {props.status}
    </div>
  )
}
