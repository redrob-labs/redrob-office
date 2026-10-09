/**
 * The 한글-style Classic ribbon and the Simple toolbar for the owned editor
 * (spec task 2.2). Tabs follow 한글 2024's grouping: 편집, 입력, 서식, 쪽, 보기,
 * plus a contextual 표 tab while the caret is in a table. 검토 (memos, tracked
 * changes) arrives with Phase 4.
 *
 * Every control runs a command on the editor's CommandBus by id, so the
 * ribbon, shortcuts, command search and AI tools share one implementation, and
 * pressed/disabled state comes from the bus. Built from @genoffice/ui only.
 */
import { Children, Fragment, isValidElement, useEffect, useLayoutEffect, useRef, useState } from 'react'
import type { ReactElement, ReactNode } from 'react'
import type { EditorView } from '@genoffice/hwp-editor'
import { FONT_SIZE_STEPS, copy, paste, styleAt, styleList } from '@genoffice/hwp-editor'
import { ColorPicker, Dropdown, Icon, RedrobMark, TabbedPanels, Toolbar, ToolbarButton, useDismissablePopover } from '@genoffice/ui'
import type { Lang } from '@genoffice/i18n'
import { COMMAND_LABELS } from '../i18n/command-labels'
import { useI18n } from '../i18n/locale'
import { RibbonIcon } from './ribbon-icons'

export type RibbonTab = 'edit' | 'insert' | 'format' | 'page' | 'review' | 'view' | 'table' | 'object' | 'story'

/** 한글's own fonts first (installed on government PCs), then the open fonts rhwp bundles. */
export const HANGUL_FONTS = ['함초롬바탕', '함초롬돋움', '맑은 고딕', '바탕', '돋움', '굴림', '궁서', '휴먼명조', 'HY헤드라인M', '나눔고딕', '나눔명조', 'Noto Sans KR', 'Noto Serif KR', 'Pretendard']

export function commandLabel(id: string, lang: Lang): string {
  const l = COMMAND_LABELS[id]
  if (!l) return id
  return lang === 'ko' ? l.ko : l.en
}

export function commandShortcut(id: string, mac: boolean): string | undefined {
  const s = COMMAND_LABELS[id]?.shortcut
  if (!s) return undefined
  return mac ? s.replace(/Ctrl\+/g, '⌘').replace(/Alt\+/g, '⌥').replace(/Shift\+/g, '⇧') : s
}

interface RibbonProps {
  view: EditorView | null
  mac: boolean
  readOnly: boolean
  /** Re-render after a command (the host bumps a counter). */
  onRan: () => void
  onCommand?: (id: string) => void
  /** Tab shown first (tests, and reopening the ribbon where it was). */
  initialTab?: RibbonTab
  /** The Redrob panel's open state and its toggle, as in Docs' ribbon. */
  panel?: { open: boolean; toggle(): void }
}

/** Redrob AI: opens and closes the Redrob panel (Ctrl+J). */
function RedrobButton({ panel, size }: { panel: NonNullable<RibbonProps['panel']>; size: 'sm' | 'lg' }): React.JSX.Element {
  const { t } = useI18n()
  return <ToolbarButton label={t('nextRedrobPanel')} icon={<RedrobMark size={size === 'lg' ? 22 : 16} />} size={size} pressed={panel.open} shortcut="Ctrl+J" keepFocus={false} onClick={() => panel.toggle()} />
}

/** A glyph for commands the icon set has no picture for (자간, 장평 …), e.g. "자+". */
function Glyph({ text }: { text: string }): React.JSX.Element {
  return (
    <span className="hangul-glyph" aria-hidden="true">
      {text}
    </span>
  )
}

function useCommands(props: RibbonProps) {
  const { lang } = useI18n()
  const { view, mac, readOnly, onRan } = props
  const run = (id: string, params?: unknown) => {
    if (!view) return
    view.run(id, params)
    view.focus()
    onRan()
  }
  const button = (id: string, icon: ReactNode, opts: { toggle?: boolean; pressed?: boolean; size?: 'sm' | 'lg'; params?: unknown; label?: string } = {}) => {
    const enabled = !!view && view.bus.has(id) && view.bus.isEnabled(id, opts.params) && (!readOnly || id.startsWith('view:') || id.startsWith('move:'))
    return (
      <ToolbarButton
        key={opts.label ? `${id}:${opts.label}` : id}
        label={opts.label ?? commandLabel(id, lang)}
        icon={icon}
        size={opts.size ?? 'sm'}
        shortcut={commandShortcut(id, mac)}
        pressed={opts.pressed ?? (opts.toggle ? (view?.bus.isActive(id) ?? false) : undefined)}
        disabled={!enabled}
        onClick={() => run(id, opts.params)}
      />
    )
  }
  return { run, button, lang }
}

/** The groups inside a band, with fragments and empty slots taken out. */
function groupsOf(node: ReactNode): ReactElement[] {
  const out: ReactElement[] = []
  for (const c of Children.toArray(node)) {
    if (!isValidElement(c)) continue
    if (c.type === Fragment) out.push(...groupsOf((c.props as { children?: ReactNode }).children))
    else out.push(c)
  }
  return out
}

/** Space the More button takes, with the band's gap. */
const MORE_WIDTH = 40

/**
 * One row of ribbon groups. Groups that do not fit move, in order, into a
 * More menu at the end of the row, so the ribbon never grows a second row and
 * nothing is cut off. Widths are measured on screen; a group that has never
 * been measured is shown once so it can be.
 */
function OverflowBand({ label, moreLabel, resetKey, children }: { label: string; moreLabel: string; resetKey: string; children: ReactNode }): React.JSX.Element {
  const groups = groupsOf(children)
  const bandRef = useRef<HTMLDivElement>(null)
  const widths = useRef(new Map<string, number[]>())
  const [fit, setFit] = useState(Number.POSITIVE_INFINITY)
  const [open, setOpen] = useState(false)
  const [tick, setTick] = useState(0)
  const moreRef = useRef<HTMLDivElement>(null)
  useDismissablePopover(open, () => setOpen(false), { inside: () => [moreRef.current] })
  // A new tab starts from nothing measured.
  useLayoutEffect(() => {
    setFit(Number.POSITIVE_INFINITY)
    setOpen(false)
  }, [resetKey])
  useEffect(() => {
    const el = bandRef.current
    if (!el || typeof ResizeObserver === 'undefined') return
    const ro = new ResizeObserver(() => setTick((n) => n + 1))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])
  useLayoutEffect(() => {
    const band = bandRef.current
    if (!band) return
    const known = widths.current.get(resetKey) ?? []
    const slots = band.querySelectorAll<HTMLElement>(':scope > .hangul-ribbon__slot > *')
    slots.forEach((el, i) => {
      known[i] = el.offsetWidth + 4
    })
    widths.current.set(resetKey, known)
    const avail = band.clientWidth
    if (!avail) return
    const n = groups.length
    if (known.slice(0, n).some((w) => w === undefined)) {
      if (fit !== Number.POSITIVE_INFINITY) setFit(Number.POSITIVE_INFINITY)
      return
    }
    const total = known.slice(0, n).reduce((a, b) => a + b, 0)
    let next = n
    if (total > avail) {
      let used = MORE_WIDTH
      next = 0
      while (next < n && used + known[next]! <= avail) used += known[next++]!
    }
    if (next !== Math.min(fit, n)) setFit(next)
  })
  const shown = Math.min(fit, groups.length)
  const rest = groups.slice(shown)
  return (
    <Toolbar label={label} className="hangul-ribbon__band" rootRef={bandRef}>
      {groups.slice(0, shown).map((g, i) => (
        <div key={g.key ?? i} className="hangul-ribbon__slot">
          {g}
        </div>
      ))}
      {rest.length ? (
        <div className="hangul-ribbon__more" ref={moreRef}>
          <ToolbarButton label={moreLabel} icon={<Icon name="more" size={16} />} onClick={() => setOpen((o) => !o)} />
          {open ? (
            <div
              className="hangul-ribbon__more-pop"
              data-toolbar-skip
              onClick={(e) => {
                // A command ran: the menu goes away. Opening a picker inside it (font, colour, table size) does not.
                const b = (e.target as HTMLElement).closest('button')
                if (!b || b.matches('.gs-dd-btn') || b.parentElement?.matches('.hangul-color, .hangul-table-grid')) return
                setOpen(false)
              }}
              onKeyDown={(e) => {
                if (e.key !== 'Escape') return
                e.stopPropagation()
                setOpen(false)
                moreRef.current?.querySelector<HTMLButtonElement>('button')?.focus()
              }}
            >
              <Toolbar label={moreLabel} className="hangul-ribbon__more-band">
                {rest}
              </Toolbar>
            </div>
          ) : null}
        </div>
      ) : null}
      <span hidden data-tick={tick} />
    </Toolbar>
  )
}

function Group({ label, children }: { label: string; children: ReactNode }): React.JSX.Element {
  return (
    <div className="hangul-ribbon-group" role="group" aria-label={label}>
      <div className="hangul-ribbon-group__controls">{children}</div>
      <div className="hangul-ribbon-group__label" aria-hidden="true">
        {label}
      </div>
    </div>
  )
}

/** Font, size, style pickers bound to the selection. */
function CharacterPickers(props: RibbonProps): React.JSX.Element {
  const { t } = useI18n()
  const { view, readOnly } = props
  const { run } = useCommands(props)
  const s = view?.session
  const head = s?.selection.head
  const props0 = s && head ? s.charProps(head) : null
  const family = String(props0?.fontFamily ?? HANGUL_FONTS[0])
  const size = props0 ? Math.round(Number(props0.fontSize) / 10) / 10 : 10
  const fonts = HANGUL_FONTS.includes(family) ? HANGUL_FONTS : [family, ...HANGUL_FONTS]
  const sizes = FONT_SIZE_STEPS.includes(size) ? FONT_SIZE_STEPS : [size, ...FONT_SIZE_STEPS].sort((a, b) => a - b)
  const canChar = !!view && view.bus.isEnabled('format:font-size', { pt: size }) && !readOnly
  const styles = s ? styleList(s) : []
  const current = s ? styleAt(s) : -1
  return (
    <>
      {styles.some((st) => st.id === current) ? (
      <Dropdown
        className="hangul-picker hangul-picker--style"
        ariaLabel={t('nextStyleLabel')}
        value={String(current) as string}
        disabled={!view || readOnly || current < 0}
        options={styles.map((st) => ({ value: String(st.id), label: st.name }))}
        onPick={(v) => run('format:apply-style', { styleId: Number(v) })}
      />
      ) : null}
      <Dropdown
        className="hangul-picker hangul-picker--font"
        ariaLabel={t('nextFontLabel')}
        value={family}
        disabled={!canChar}
        options={fonts.map((f) => ({ value: f, label: f }))}
        onPick={(v) => run('format:font-family', { name: v })}
      />
      <Dropdown
        className="hangul-picker hangul-picker--size"
        ariaLabel={t('nextSizeLabel')}
        value={String(size)}
        disabled={!canChar}
        options={sizes.map((v) => ({ value: String(v), label: String(v) }))}
        onPick={(v) => run('format:font-size', { pt: Number(v) })}
      />
    </>
  )
}

function ColorButton(props: RibbonProps & { command: 'format:text-color' | 'format:shade-color'; icon: ReactNode }): React.JSX.Element {
  const { t } = useI18n()
  const { run } = useCommands(props)
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  useDismissablePopover(open, () => setOpen(false), { inside: () => [ref.current] })
  const enabled = !!props.view && !props.readOnly && props.view.bus.isEnabled(props.command, { color: '#000000' })
  return (
    <div className="hangul-color" ref={ref}>
      <ToolbarButton
        label={props.command === 'format:text-color' ? t('nextTextColor') : t('nextShadeColor')}
        icon={props.icon}
        disabled={!enabled}
        keepFocus
        onClick={() => setOpen((o) => !o)}
      />
      {open ? (
        <div className="hangul-color__popover" data-toolbar-skip>
          <ColorPicker
            strings={{ themeColors: t('nextColorTheme'), standardColors: t('nextColorStandard'), moreColors: t('nextColorMore') }}
            onPick={(hex) => {
              setOpen(false)
              if (hex) run(props.command, { color: hex })
            }}
          />
        </div>
      ) : null}
    </div>
  )
}

/** Rows × columns picker for 표 만들기. */
function TableGrid(props: RibbonProps): React.JSX.Element {
  const { t } = useI18n()
  const { run, lang } = useCommands(props)
  const [open, setOpen] = useState(false)
  const [hover, setHover] = useState<[number, number]>([0, 0])
  const ref = useRef<HTMLDivElement>(null)
  useDismissablePopover(open, () => setOpen(false), { inside: () => [ref.current] })
  const enabled = !!props.view && !props.readOnly && props.view.bus.isEnabled('table:create', { rows: 1, cols: 1 })
  return (
    <div className="hangul-table-grid" ref={ref}>
      <ToolbarButton label={commandLabel('table:create', lang)} icon={<Icon name="grid" size={24} />} size="lg" disabled={!enabled} keepFocus onClick={() => setOpen((o) => !o)} />
      {open ? (
        <div className="hangul-table-grid__popover" role="grid" aria-label={t('nextTableGrid')} data-toolbar-skip>
          {Array.from({ length: 8 }, (_, r) => (
            <div key={r} role="row" className="hangul-table-grid__row">
              {Array.from({ length: 10 }, (_, c) => (
                <button
                  key={c}
                  type="button"
                  role="gridcell"
                  aria-label={t('nextTableSize', { rows: r + 1, cols: c + 1 })}
                  className={r < hover[0] && c < hover[1] ? 'is-on' : ''}
                  onMouseEnter={() => setHover([r + 1, c + 1])}
                  onFocus={() => setHover([r + 1, c + 1])}
                  onClick={() => {
                    setOpen(false)
                    run('table:create', { rows: r + 1, cols: c + 1 })
                  }}
                />
              ))}
            </div>
          ))}
          <div className="hangul-table-grid__size" aria-live="polite">
            {hover[0] ? t('nextTableSize', { rows: hover[0], cols: hover[1] }) : ''}
          </div>
        </div>
      ) : null}
    </div>
  )
}

export async function clipboardCopy(view: EditorView, cut: boolean): Promise<void> {
  const data = copy(view.session)
  if (!data) return
  try {
    const items: Record<string, Blob> = { 'text/plain': new Blob([data.text], { type: 'text/plain' }) }
    if (data.html) items['text/html'] = new Blob([data.html], { type: 'text/html' })
    await navigator.clipboard.write([new ClipboardItem(items)])
  } catch {
    await navigator.clipboard?.writeText(data.text)
  }
  if (cut) view.run('edit:delete-backward')
}

export async function clipboardPaste(view: EditorView): Promise<void> {
  try {
    const [item] = await navigator.clipboard.read()
    if (!item) return
    const text = item.types.includes('text/plain') ? await (await item.getType('text/plain')).text() : ''
    const html = item.types.includes('text/html') ? await (await item.getType('text/html')).text() : undefined
    paste(view.session, { text, html })
  } catch {
    const text = await navigator.clipboard?.readText()
    if (text) paste(view.session, { text })
  }
  view.render()
}

export function tabsFor(view: EditorView | null): RibbonTab[] {
  const base: RibbonTab[] = ['edit', 'insert', 'format', 'page', 'review', 'view']
  if (view?.session.object) return [...base, 'object']
  if (view?.session.selection.head.story) return [...base, 'story']
  const c = view?.session.selection.head.cell
  return c && !c.textBox ? [...base, 'table'] : base
}

export function HangulRibbon(props: RibbonProps): React.JSX.Element {
  const { t } = useI18n()
  const { button, lang } = useCommands(props)
  const [tab, setTab] = useState<RibbonTab>(props.initialTab ?? 'format')
  const tabs = tabsFor(props.view)
  const active = tabs.includes(tab) ? tab : 'format'
  const L = (id: string) => commandLabel(id, lang)
  const g = (s: string) => <Glyph text={s} />
  const view = props.view
  const clip = (fn: () => Promise<void>) => () => {
    void fn().then(props.onRan)
  }
  const tabLabel: Record<RibbonTab, string> = {
    edit: t('nextTabEdit'),
    insert: t('nextTabInsert'),
    format: t('nextTabFormat'),
    page: t('nextTabPage'),
    review: t('nextTabReview'),
    view: t('nextTabView'),
    table: t('nextTabTable'),
    object: t('nextTabObject'),
    story: view?.session.selection.head.story?.kind === 'note' ? t('nextTabNote') : t('nextTabHeaderFooter'),
  }
  // The frame's toolbar switch sits at the end of the tab row (styles.css,
  // .hangul-toolbar--classic): reserve its width there and centre it on the row.
  const rootRef = useRef<HTMLDivElement>(null)
  useLayoutEffect(() => {
    const root = rootRef.current
    const tools = root?.closest<HTMLElement>('.go-frame__tools')
    const sw = tools?.querySelector<HTMLElement>(':scope > .go-tbswitch')
    const row = root?.querySelector<HTMLElement>(':scope > :not([role="tabpanel"])')
    if (!tools || !sw || !row) return
    const place = () => {
      tools.style.setProperty('--hangul-switch-w', `${sw.offsetWidth}px`)
      const top = row.getBoundingClientRect().top - tools.getBoundingClientRect().top
      tools.style.setProperty('--hangul-switch-top', `${Math.max(0, top + (row.offsetHeight - sw.offsetHeight) / 2)}px`)
    }
    place()
    const ro = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(place)
    ro?.observe(sw)
    ro?.observe(row)
    return () => {
      ro?.disconnect()
      tools.style.removeProperty('--hangul-switch-w')
      tools.style.removeProperty('--hangul-switch-top')
    }
  }, [])
  return (
    <div className="hangul-ribbon" ref={rootRef}>
      <TabbedPanels idPrefix="hangul-ribbon" label={t('nextRibbonLabel')} value={active} items={tabs.map((id) => ({ id, label: tabLabel[id] }))} onChange={setTab}>
        <OverflowBand label={tabLabel[active]} moreLabel={t('nextRibbonMore')} resetKey={active}>
        {active === 'review' ? (
          <>
            <Group label={t('reviewGroupMemos')}>
              <ToolbarButton label={L('review:memo-insert')} icon={<Icon name="comment" size={16} />} disabled={!view || props.readOnly || !props.onCommand} onClick={() => props.onCommand?.('review:memo-insert')} />
              <ToolbarButton label={L('review:memo-show')} icon={<Icon name="messages" size={16} />} disabled={!view || !props.onCommand} onClick={() => props.onCommand?.('review:memo-show')} />
            </Group>
            <Group label={t('reviewGroupTrack')}>
              {button('review:track-changes', <Icon name="edit" size={16} />, { toggle: true })}
              {button('review:revision-previous', <Icon name="chevronsLeft" size={16} />)}
              {button('review:revision-next', <Icon name="chevronsRight" size={16} />)}
            </Group>
            <Group label={t('reviewGroupDecide')}>
              {button('review:revision-accept', <Icon name="check" size={16} />)}
              {button('review:revision-reject', <Icon name="close" size={16} />)}
              {button('review:revision-accept-all', <Icon name="checkAll" size={16} />)}
              {button('review:revision-reject-all', <Icon name="circleX" size={16} />)}
            </Group>
          </>
        ) : null}
        {active === 'edit' ? (
          <>
            <Group label={t('nextGroupHistory')}>
              {button('edit:undo', <Icon name="undo" size={16} />)}
              {button('edit:redo', <Icon name="redo" size={16} />)}
            </Group>
            <Group label={t('nextGroupClipboard')}>
              <ToolbarButton label={L('edit:cut')} icon={RibbonIcon.cut()} shortcut={commandShortcut('edit:cut', props.mac) ?? (props.mac ? '⌘X' : 'Ctrl+X')} disabled={!view || props.readOnly} onClick={clip(() => clipboardCopy(view!, true))} />
              <ToolbarButton label={L('edit:copy')} icon={<Icon name="copy" size={16} />} shortcut={props.mac ? '⌘C' : 'Ctrl+C'} disabled={!view} onClick={clip(() => clipboardCopy(view!, false))} />
              <ToolbarButton label={L('edit:paste')} icon={<Icon name="clipboard" size={16} />} shortcut={props.mac ? '⌘V' : 'Ctrl+V'} disabled={!view || props.readOnly} onClick={clip(() => clipboardPaste(view!))} />
            </Group>
            <Group label={t('nextGroupSelect')}>{button('edit:select-all', RibbonIcon.selectAll())}</Group>
            {props.onCommand ? (
              <Group label={t('nextGroupFind')}>
                <ToolbarButton label={L('edit:find')} icon={<Icon name="search" size={16} />} shortcut={commandShortcut('edit:find', props.mac)} disabled={!view} onClick={() => props.onCommand!('edit:find')} />
                <ToolbarButton label={L('edit:find-replace')} icon={<Icon name="repeat" size={16} />} shortcut={commandShortcut('edit:find-replace', props.mac)} disabled={!view || props.readOnly} onClick={() => props.onCommand!('edit:find-replace')} />
              </Group>
            ) : null}
          </>
        ) : null}
        {active === 'insert' ? (
          <>
            <Group label={t('nextGroupTable')}>
              <TableGrid {...props} />
            </Group>
            <Group label={t('nextGroupBreaks')}>
              {button('page:break', RibbonIcon.pageBreak(24), { size: 'lg' })}
              {button('page:column-break', RibbonIcon.columnBreak(24), { size: 'lg' })}
            </Group>
            {props.onCommand ? (
              <Group label={t('nextGroupObjects')}>
                {(['insert:image', 'insert:equation'] as const).map((id) => (
                  <ToolbarButton key={id} label={L(id)} icon={id === 'insert:image' ? <Icon name="image" size={24} /> : RibbonIcon.equation(24)} size="lg" disabled={!view || props.readOnly || !view.bus.isEnabled(id, { script: 'x', bytes: new Uint8Array(), extension: 'png', widthPx: 1, heightPx: 1 })} onClick={() => props.onCommand!(id)} />
                ))}
              </Group>
            ) : null}
            {props.onCommand ? (
              <Group label={t('nextGroupLinks')}>
                <ToolbarButton label={L('insert:hyperlink')} icon={<Icon name="link" size={16} />} disabled={!view || props.readOnly || !view.bus.isEnabled('insert:hyperlink', { uri: 'https://x' })} onClick={() => props.onCommand!('insert:hyperlink-dialog')} />
                <ToolbarButton label={L('insert:field')} icon={RibbonIcon.field()} disabled={!view || props.readOnly || !view.bus.isEnabled('insert:field', { guide: 'x' })} onClick={() => props.onCommand!('insert:field-dialog')} />
                {button('field:remove', RibbonIcon.fieldRemove())}
              </Group>
            ) : null}
            {props.onCommand ? (
              <Group label={t('nextChartData')}>
                <ToolbarButton label={t('nextChartTitle')} icon={<Icon name="chart" size={24} />} size="lg" disabled={!view || props.readOnly || !view.bus.isEnabled('insert:chart', { chart: { kind: 'column', categories: [], series: [] } })} onClick={() => props.onCommand!('insert:chart-dialog')} />
              </Group>
            ) : null}
            <Group label={L('insert:shape')}>
              {button('view:draw-shape', RibbonIcon.rectangle(), { params: { shapeType: 'rectangle' }, pressed: view?.drawTool === 'rectangle', label: t('nextShapeRectangle') })}
              {button('view:draw-shape', RibbonIcon.ellipse(), { params: { shapeType: 'ellipse' }, pressed: view?.drawTool === 'ellipse', label: t('nextShapeEllipse') })}
              {button('view:draw-shape', RibbonIcon.line(), { params: { shapeType: 'line' }, pressed: view?.drawTool === 'line', label: t('nextShapeLine') })}
              {button('view:draw-shape', RibbonIcon.textBox(), { params: { shapeType: 'textbox' }, pressed: view?.drawTool === 'textbox', label: t('nextShapeTextbox') })}
            </Group>
            {props.onCommand ? (
              <Group label={t('nextGroupNotes')}>
                <ToolbarButton label={L('insert:footnote')} icon={RibbonIcon.footnote()} disabled={!view || props.readOnly || !view.bus.isEnabled('insert:footnote')} onClick={() => props.onCommand!('insert:footnote')} />
                {button('insert:endnote', RibbonIcon.endnote())}
                <ToolbarButton label={L('insert:bookmark')} icon={<Icon name="bookmark" size={16} />} disabled={!view || props.readOnly || !view.bus.isEnabled('insert:bookmark', { name: 'x' })} onClick={() => props.onCommand!('insert:bookmark')} />
              </Group>
            ) : null}
          </>
        ) : null}
        {active === 'format' ? (
          <>
            <Group label={t('nextGroupFont')}>
              <CharacterPickers {...props} />
              {button('format:font-size-increase', g('가+'))}
              {button('format:font-size-decrease', g('가-'))}
            </Group>
            <Group label={t('nextGroupCharacter')}>
              {button('format:bold', <Icon name="bold" size={16} />, { toggle: true })}
              {button('format:italic', <Icon name="italic" size={16} />, { toggle: true })}
              {button('format:underline', <Icon name="underline" size={16} />, { toggle: true })}
              {button('format:strikethrough', <Icon name="strikethrough" size={16} />, { toggle: true })}
              {button('format:superscript', g('x²'), { toggle: true })}
              {button('format:subscript', g('x₂'), { toggle: true })}
              {button('format:emboss', g('양'), { toggle: true })}
              {button('format:engrave', g('음'), { toggle: true })}
              <ColorButton {...props} command="format:text-color" icon={g('가')} />
              <ColorButton {...props} command="format:shade-color" icon={<Icon name="highlight" size={16} />} />
            </Group>
            <Group label={t('nextGroupSpacing')}>
              {button('format:char-spacing-increase', g('자+'))}
              {button('format:char-spacing-decrease', g('자-'))}
              {button('format:char-ratio-increase', g('장+'))}
              {button('format:char-ratio-decrease', g('장-'))}
            </Group>
            <Group label={t('nextGroupParagraph')}>
              {button('format:align-justify', <Icon name="alignJustify" size={16} />, { toggle: true })}
              {button('format:align-left', <Icon name="alignLeft" size={16} />, { toggle: true })}
              {button('format:align-center', <Icon name="alignCenter" size={16} />, { toggle: true })}
              {button('format:align-right', <Icon name="alignRight" size={16} />, { toggle: true })}
              {button('format:align-distribute', g('배'), { toggle: true })}
              {button('format:align-split', g('나'), { toggle: true })}
              {button('format:line-spacing-increase', g('줄+'))}
              {button('format:line-spacing-decrease', g('줄-'))}
            </Group>
            {props.onCommand ? (
              <Group label={t('nextGroupFormatting')}>
                <ToolbarButton label={L('format:char-shape')} icon={g('가')} size="lg" shortcut={commandShortcut('format:char-shape', props.mac)} disabled={!view || props.readOnly} onClick={() => props.onCommand!('format:char-shape')} />
                <ToolbarButton label={L('format:para-shape')} icon={g('¶')} size="lg" shortcut={commandShortcut('format:para-shape', props.mac)} disabled={!view || props.readOnly} onClick={() => props.onCommand!('format:para-shape')} />
                <ToolbarButton label={L('format:style-dialog')} icon={g('스')} size="lg" shortcut={commandShortcut('format:style-dialog', props.mac)} disabled={!view || props.readOnly} onClick={() => props.onCommand!('format:style-dialog')} />
              </Group>
            ) : null}
          </>
        ) : null}
        {active === 'page' ? (
          <>
            {props.onCommand ? (
              <Group label={t('nextGroupPaper')}>
                <ToolbarButton label={L('page:setup')} icon={<Icon name="file" size={24} />} size="lg" shortcut="F7" disabled={!view || props.readOnly} onClick={() => props.onCommand!('page:setup')} />
              </Group>
            ) : null}
            <Group label={t('nextGroupBreaks')}>
              {button('page:break', RibbonIcon.pageBreak(24), { size: 'lg' })}
              {button('page:column-break', RibbonIcon.columnBreak(24), { size: 'lg' })}
            </Group>
            {props.onCommand ? (
              <Group label={t('nextGroupHeaderFooter')}>
                <ToolbarButton label={L('page:header-create')} icon={RibbonIcon.header()} disabled={!view || props.readOnly} onClick={() => props.onCommand!('page:header-create')} />
                <ToolbarButton label={L('page:footer-create')} icon={RibbonIcon.footer()} disabled={!view || props.readOnly} onClick={() => props.onCommand!('page:footer-create')} />
              </Group>
            ) : null}
          </>
        ) : null}
        {active === 'view' ? (
          <Group label={t('nextGroupZoom')}>
            {button('view:zoom-in', <Icon name="zoomIn" size={16} />)}
            {button('view:zoom-out', <Icon name="zoomOut" size={16} />)}
            {button('view:zoom-100', g('100%'), { label: t('nextZoom100') })}
            {button('view:zoom-fit-width', RibbonIcon.fitWidth())}
            {button('view:zoom-fit-page', RibbonIcon.fitPage())}
          </Group>
        ) : null}
        {active === 'view' && props.panel ? (
          <Group label={t('nextGroupRedrob')}>
            <RedrobButton panel={props.panel} size="lg" />
          </Group>
        ) : null}
        {active === 'view' ? (
          <Group label={t('nextGroupForm')}>{button('view:form-mode', <Icon name="checklist" size={16} />, { toggle: true, size: 'lg' })}</Group>
        ) : null}
        {active === 'story' ? (
          <Group label={tabLabel.story}>
            {view?.session.selection.head.story?.kind === 'note' ? (
              button('insert:note-close', <Icon name="close" size={16} />, { size: 'lg' })
            ) : (
              <>
                {button('page:headerfooter-prev', <Icon name="chevronLeft" size={16} />)}
                {button('page:headerfooter-next', <Icon name="chevronRight" size={16} />)}
                {button('page:headerfooter-close', <Icon name="close" size={16} />, { size: 'lg' })}
              </>
            )}
          </Group>
        ) : null}
        {active === 'object' ? (
          <>
            <Group label={t('nextGroupObject')}>
              {props.onCommand ? <ToolbarButton label={L('format:object-properties')} icon={<Icon name="settings" size={24} />} size="lg" disabled={!view || props.readOnly || !view.bus.isEnabled('object:set-properties', { props: {} })} onClick={() => props.onCommand!('format:object-properties')} /> : null}
              {button('insert:picture-delete', <Icon name="trash" size={16} />)}
              {props.onCommand && view?.session.object?.kind === 'chart' ? <ToolbarButton label={t('nextChartEditData')} icon={<Icon name="fileSheet" size={16} />} disabled={props.readOnly} onClick={() => props.onCommand!('insert:chart-data-edit')} /> : null}
            </Group>
            <Group label={t('nextGroupArrange')}>
              {button('insert:arrange-front', <Icon name="chevronsUp" size={16} />)}
              {button('insert:arrange-forward', RibbonIcon.forward())}
              {button('insert:arrange-backward', RibbonIcon.backward())}
              {button('insert:arrange-back', <Icon name="chevronsDown" size={16} />)}
              {button('insert:group-shapes', <Icon name="merge" size={16} />)}
              {button('insert:ungroup-shapes', <Icon name="split" size={16} />)}
            </Group>
          </>
        ) : null}
        {active === 'table' ? (
          <>
            <Group label={t('nextGroupRowsCols')}>
              {button('table:insert-row-above', RibbonIcon.rowAbove())}
              {button('table:insert-row-below', RibbonIcon.rowBelow())}
              {button('table:insert-col-left', RibbonIcon.colLeft())}
              {button('table:insert-col-right', RibbonIcon.colRight())}
              {button('table:delete-row', RibbonIcon.deleteRow())}
              {button('table:delete-col', RibbonIcon.deleteCol())}
            </Group>
            <Group label={t('nextGroupCells')}>
              {props.onCommand ? <ToolbarButton label={L('table:cell-props')} icon={RibbonIcon.cellProps()} disabled={!view || props.readOnly || !view.bus.isEnabled('table:set-properties', { props: {} })} onClick={() => props.onCommand!('table:cell-props')} /> : null}
              {button('table:cell-merge', <Icon name="merge" size={16} />)}
              {button('table:delete', <Icon name="trash" size={16} />)}
            </Group>
          </>
        ) : null}
        </OverflowBand>
      </TabbedPanels>
    </div>
  )
}

/** The Simple toolbar: the commands people reach for most. */
export function HangulSimpleToolbar(props: RibbonProps): React.JSX.Element {
  const { t } = useI18n()
  const { button } = useCommands(props)
  return (
    <Toolbar label={t('nextFormatLabel')}>
      <CharacterPickers {...props} />
      {button('format:bold', <Icon name="bold" size={16} />, { toggle: true })}
      {button('format:italic', <Icon name="italic" size={16} />, { toggle: true })}
      {button('format:underline', <Icon name="underline" size={16} />, { toggle: true })}
      {button('format:align-left', <Icon name="alignLeft" size={16} />, { toggle: true })}
      {button('format:align-center', <Icon name="alignCenter" size={16} />, { toggle: true })}
      {button('format:align-right', <Icon name="alignRight" size={16} />, { toggle: true })}
      {props.panel ? <RedrobButton panel={props.panel} size="sm" /> : null}
    </Toolbar>
  )
}
