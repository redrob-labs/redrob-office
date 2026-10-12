/**
 * Plan or Run, the plan document, and inline second opinions.
 *
 * The design system defines ComposerMode, PlanDocument and Opinion, but the
 * pinned kit (@redrob-labs/ui 1.0.2) does not ship them yet, so Office builds
 * them here on the kit's tokens with the same class anatomy (go- prefix
 * instead of rr-). Each props interface mirrors the design system's so the
 * parts can move into the kit unchanged; see docs/redrob-ui-gaps.md.
 *
 * Opinion is composed from the kit's own Disputed and OpinionAdded, which is
 * exactly what the design system's Opinion is.
 */
import {
  isValidElement,
  useRef,
  useState,
  type KeyboardEvent,
  type ReactElement,
  type ReactNode,
} from 'react'
import {
  Button,
  Disputed,
  OpinionAdded,
  icons,
  type DisputedProps,
  type IconName,
  type OpinionAddedProps,
} from '@redrob-labs/ui'

const cx = (...parts: Array<string | false | null | undefined>): string =>
  parts.filter(Boolean).join(' ')

function glyph(name: IconName, size: number): ReactNode {
  const Glyph = icons[name]
  return Glyph ? <Glyph width={size} height={size} aria-hidden="true" /> : null
}

/* ── ComposerMode ───────────────────────────────────────────────────────── */

export interface ComposerModeOption {
  value: string
  label: string
  /** a kit icon name, e.g. `route` for Plan and `play` for Run */
  icon?: IconName
  /** what the mode does, shown as the native tooltip */
  hint?: string
}

export interface ComposerModeProps {
  options: ComposerModeOption[]
  value?: string
  defaultValue?: string
  /** icons only: the labels stay as accessible names */
  compact?: boolean
  /** names the radio group */
  label: string
  className?: string
  onChange?: (value: string, option: ComposerModeOption) => void
}

/**
 * Plan or Run, per message, in the composer bar beside the model.
 * A radio group: arrow keys move and select, one tab stop for the group.
 */
export function ComposerMode(props: ComposerModeProps): ReactElement {
  const { options, compact, label, className, onChange } = props
  const [own, setOwn] = useState(props.defaultValue ?? options[0]?.value ?? '')
  const value = props.value ?? own
  const refs = useRef<Array<HTMLButtonElement | null>>([])

  const pick = (option: ComposerModeOption) => {
    if (props.value === undefined) setOwn(option.value)
    onChange?.(option.value, option)
  }

  const onKeyDown = (e: KeyboardEvent<HTMLButtonElement>, index: number) => {
    const step =
      e.key === 'ArrowRight' || e.key === 'ArrowDown'
        ? 1
        : e.key === 'ArrowLeft' || e.key === 'ArrowUp'
          ? -1
          : 0
    if (!step || options.length === 0) return
    e.preventDefault()
    const next = (index + step + options.length) % options.length
    pick(options[next]!)
    refs.current[next]?.focus()
  }

  const selectedIndex = Math.max(
    0,
    options.findIndex((o) => o.value === value),
  )

  return (
    <div
      className={cx('go-cmode', compact && 'go-cmode--compact', className)}
      role="radiogroup"
      aria-label={label}
    >
      {options.map((option, i) => {
        const on = option.value === value
        return (
          <button
            key={option.value}
            ref={(el) => {
              refs.current[i] = el
            }}
            type="button"
            role="radio"
            aria-checked={on}
            aria-label={option.label}
            title={option.hint}
            tabIndex={i === selectedIndex ? 0 : -1}
            className="go-cmode__o"
            onClick={() => pick(option)}
            onKeyDown={(e) => onKeyDown(e, i)}
          >
            {option.icon ? glyph(option.icon, 13) : null}
            <span className="go-cmode__l">{option.label}</span>
          </button>
        )
      })}
    </div>
  )
}

/* ── PlanDocument ───────────────────────────────────────────────────────── */

export type PlanStatus = 'draft' | 'edited' | 'running' | 'done' | 'kept'

export interface PlanItem {
  id?: string
  /** a bold lead-in before the text */
  lead?: string
  text: ReactNode
  /** muted text after the item */
  note?: ReactNode
  /** `false` keeps this line fixed even while the plan is a draft */
  editable?: boolean
}

export interface PlanSection {
  id?: string
  heading: ReactNode
  body?: ReactNode
  items?: Array<PlanItem | ReactNode>
  ordered?: boolean
}

export interface PlanTodo {
  id?: string
  label: ReactNode
  /** who does this step, e.g. the AI that will run it */
  who?: ReactNode
  done?: boolean
}

export interface PlanDocumentProps {
  /** the plan's file name, shown in the header */
  file: ReactNode
  status?: PlanStatus
  /** every status label; the plan never shows a status it has no words for */
  statusLabels: Record<PlanStatus, ReactNode>
  title?: ReactNode
  summary?: ReactNode
  sections?: PlanSection[]
  todo?: PlanTodo[]
  todoLabel?: ReactNode
  /** how many to-do items are done; otherwise counted from `todo[].done` */
  done?: number
  note?: ReactNode
  runLabel: ReactNode
  keepLabel?: ReactNode
  hint?: ReactNode
  /** visually hidden suffix for a ticked to-do item, e.g. "(done)" */
  doneLabel?: string
  /** names the article for assistive tech */
  label: string
  className?: string
  onRun?: () => void
  onKeep?: () => void
  /** a paragraph was changed in place */
  onEdit?: () => void
}

function PlanText(props: {
  editable: boolean
  as?: 'span' | 'p'
  className?: string
  onEdit: () => void
  children: ReactNode
}): ReactElement {
  const Tag = props.as ?? 'span'
  if (!props.editable) return <Tag className={props.className}>{props.children}</Tag>
  return (
    <Tag
      className={cx('go-plandoc__ed', props.className)}
      contentEditable
      suppressContentEditableWarning
      spellCheck={false}
      onInput={props.onEdit}
    >
      {props.children}
    </Tag>
  )
}

const isPlanItem = (it: PlanItem | ReactNode): it is PlanItem =>
  typeof it === 'object' &&
  it !== null &&
  !Array.isArray(it) &&
  !isValidElement(it) &&
  'text' in (it as object)

/**
 * The plan, written out as a document before anything changes: what was
 * asked, how, what you get, and a to-do list that ticks as the run goes.
 * Any paragraph can be changed in place until the plan runs.
 */
export function PlanDocument(props: PlanDocumentProps): ReactElement {
  const status = props.status ?? 'draft'
  const [edited, setEdited] = useState(false)
  const editable = status === 'draft' || status === 'edited' || status === 'kept'
  const shown: PlanStatus = status === 'draft' && edited ? 'edited' : status
  const mark = () => {
    if (!edited) setEdited(true)
    props.onEdit?.()
  }
  const todo = props.todo ?? []
  const ticked = props.done ?? todo.filter((t) => t.done).length

  const renderItem = (raw: PlanItem | ReactNode, i: number) => {
    if (raw == null || raw === false) return null
    const it: PlanItem = isPlanItem(raw) ? raw : { text: raw }
    return (
      <li key={it.id ?? i}>
        {it.lead ? <b>{it.lead} </b> : null}
        <PlanText editable={editable && it.editable !== false} onEdit={mark}>
          {it.text}
        </PlanText>
        {it.note ? <span className="go-plandoc__muted"> {it.note}</span> : null}
      </li>
    )
  }

  return (
    <article className={cx('go-plandoc', props.className)} aria-label={props.label}>
      <header className="go-plandoc__h">
        <span className="go-plandoc__file">
          {glyph('fileText', 14)}
          <span>{props.file}</span>
        </span>
        <span className={cx('go-plandoc__state', `go-plandoc__state--${shown}`)}>
          {props.statusLabels[shown]}
        </span>
      </header>
      <div className={cx('go-plandoc__b', !editable && 'go-plandoc__b--locked')}>
        {props.title ? <h2 className="go-plandoc__title">{props.title}</h2> : null}
        {props.summary ? (
          <PlanText as="p" editable={editable} onEdit={mark}>
            {props.summary}
          </PlanText>
        ) : null}
        {(props.sections ?? []).map((s, si) => {
          const List = s.ordered ? 'ol' : 'ul'
          return (
            <section key={s.id ?? si} className="go-plandoc__sec">
              <h3>{s.heading}</h3>
              {s.body ? (
                <PlanText as="p" editable={editable} onEdit={mark}>
                  {s.body}
                </PlanText>
              ) : null}
              {s.items ? <List>{s.items.map(renderItem)}</List> : null}
            </section>
          )
        })}
        {todo.length > 0 ? (
          <section className="go-plandoc__sec">
            {props.todoLabel ? <h3>{props.todoLabel}</h3> : null}
            <ul className="go-plandoc__todo">
              {todo.map((t, i) => {
                const done = i < ticked
                return (
                  <li key={t.id ?? i} className={done ? 'is-done' : undefined}>
                    <span className="go-plandoc__box" aria-hidden="true">
                      {done ? glyph('check', 10) : null}
                    </span>
                    <span className="go-plandoc__task">
                      {t.label}
                      {done && props.doneLabel ? (
                        <span className="go-visually-hidden"> {props.doneLabel}</span>
                      ) : null}
                    </span>
                    {t.who ? <span className="go-plandoc__who">{t.who}</span> : null}
                  </li>
                )
              })}
            </ul>
          </section>
        ) : null}
        {props.note ? <p className="go-plandoc__note">{props.note}</p> : null}
      </div>
      {editable && (props.onRun || props.onKeep) ? (
        <footer className="go-plandoc__f">
          {props.onRun ? (
            <Button variant="primary" iconLeft={glyph('play', 14)} onClick={props.onRun}>
              {props.runLabel}
            </Button>
          ) : null}
          {props.onKeep && status !== 'kept' && props.keepLabel ? (
            <Button variant="secondary" onClick={props.onKeep}>
              {props.keepLabel}
            </Button>
          ) : null}
          {props.hint ? <span className="go-plandoc__hint">{props.hint}</span> : null}
        </footer>
      ) : null}
    </article>
  )
}

/* ── Opinion ────────────────────────────────────────────────────────────── */

export type OpinionProps =
  | ({ kind?: 'differs' } & DisputedProps)
  | ({ kind: 'added' } & OpinionAddedProps)

/**
 * What Fact check found, inside an answer. `differs` (the default) marks a
 * sentence another AI reads differently, opened in place; `added` is what it
 * thinks the answer missed, set after the answer and never merged into it.
 * Only disagreement is marked: agreement renders nothing extra.
 */
export function Opinion(props: OpinionProps): ReactElement {
  if (props.kind === 'added') {
    const { kind: _kind, ...rest } = props
    return <OpinionAdded {...rest} />
  }
  const { kind: _kind, ...rest } = props
  return <Disputed {...rest} />
}
