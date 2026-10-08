// The command bus: every user-facing action is a named command with
// `isEnabled` and `run`. Toolbars, shortcuts, the command search, the AI skill
// and the live binding all go through it (design §5). Ids follow the coverage
// list in .kiro/specs/hangul-editor/coverage/commands.json.
import { at, compare, containerOf, paraIndex, sameContainer, type Pos } from './position'
import { collapsed, ordered, type Change, type ChangeOrigin, type Selection, type Session } from './session'
import { moveHorizontal, moveVerticalFrom, documentEnd, documentStart } from './navigation'
import { FORMAT_COMMANDS } from './format-commands'
import { FIND_COMMANDS } from './find-commands'
import { INSERT_COMMANDS } from './insert-commands'
import { OBJECT_COMMANDS } from './object-commands'
import { FIELD_COMMANDS } from './field-commands'

export interface CommandContext {
  session: Session
  origin?: ChangeOrigin
}

export interface Command<P = void> {
  id: string
  /** Whether the command can run in this state. */
  isEnabled(ctx: CommandContext, params?: P): boolean
  /** Toggle state for toolbar buttons (aria-pressed), when the command has one. */
  isActive?(ctx: CommandContext): boolean
  run(ctx: CommandContext, params: P): Change | null
}

function deleteSelection(s: Session): Pos {
  const [a, b] = ordered(s.selection)
  if (!sameContainer(a, b)) {
    // A selection spanning body and a cell collapses to its anchor's container.
    return s.selection.anchor
  }
  return s.text.delete(a, b)
}

/** Insert text at the selection, replacing it. Newlines split paragraphs. */
export const insertText: Command<{ text: string }> = {
  id: 'edit:insert-text',
  isEnabled: () => true,
  run({ session, origin }, { text }) {
    if (!text) return null
    return session.edit(
      'edit:insert-text',
      () => {
        let p = collapsed(session.selection) ? session.selection.head : deleteSelection(session)
        const parts = text.replace(/\r\n?/g, '\n').split('\n')
        parts.forEach((part, i) => {
          if (i > 0) p = session.text.split(p)
          p = session.text.insert(p, part)
        })
        return { anchor: p, head: p }
      },
      origin,
    )
  },
}

export const splitParagraph: Command = {
  id: 'edit:split-paragraph',
  isEnabled: () => true,
  run({ session, origin }) {
    return session.edit(
      'edit:split-paragraph',
      () => {
        const p = session.text.split(collapsed(session.selection) ? session.selection.head : deleteSelection(session))
        return { anchor: p, head: p }
      },
      origin,
    )
  },
}

function deleteBy(session: Session, dir: -1 | 1, origin?: ChangeOrigin): Change | null {
  if (!collapsed(session.selection)) {
    return session.edit('edit:delete', () => {
      const p = deleteSelection(session)
      return { anchor: p, head: p }
    }, origin)
  }
  const head = session.selection.head
  const other = moveHorizontal(session, head, dir)
  // At the edge of a container (start of a cell, end of the document) there is nothing to delete.
  if (!sameContainer(head, other) || compare(head, other) === 0) return null
  return session.edit(dir < 0 ? 'edit:delete-backward' : 'edit:delete-forward', () => {
    const p = session.text.delete(head, other)
    return { anchor: p, head: p }
  }, origin)
}

export const deleteBackward: Command = { id: 'edit:delete-backward', isEnabled: () => true, run: (ctx) => deleteBy(ctx.session, -1, ctx.origin) }
export const deleteForward: Command = { id: 'edit:delete-forward', isEnabled: () => true, run: (ctx) => deleteBy(ctx.session, 1, ctx.origin) }

export const undo: Command = { id: 'edit:undo', isEnabled: ({ session }) => session.canUndo, run: ({ session }) => session.undo() }
export const redo: Command = { id: 'edit:redo', isEnabled: ({ session }) => session.canRedo, run: ({ session }) => session.redo() }

export const selectAll: Command = {
  id: 'edit:select-all',
  isEnabled: () => true,
  run({ session }) {
    const head = session.selection.head
    if (head.cell) {
      const c = containerOf(head)
      const last = session.text.paragraphCount(c) - 1
      const end = at(c, last, 0)
      session.select({ anchor: at(c, 0, 0), head: { ...end, offset: session.text.length(end) } })
    } else {
      session.select({ anchor: documentStart(), head: documentEnd(session, head.section) })
    }
    return null
  },
}

type Toggle = 'bold' | 'italic' | 'underline' | 'strikethrough'

function toggleFormat(id: string, prop: Toggle): Command {
  return {
    id,
    isEnabled: ({ session }) => !collapsed(session.selection) && sameContainer(session.selection.anchor, session.selection.head),
    isActive: ({ session }) => {
      const [a] = ordered(session.selection)
      return Boolean(session.text.charPropertiesAt(a)[prop])
    },
    run(ctx) {
      const { session, origin } = ctx
      if (!this.isEnabled(ctx)) return null
      const on = !this.isActive!(ctx)
      const sel = session.selection
      return session.edit(id, () => {
        const [a, b] = ordered(sel)
        session.text.applyCharFormat(a, b, { [prop]: on })
        return sel
      }, origin)
    },
  }
}

export const bold = toggleFormat('format:bold', 'bold')
export const italic = toggleFormat('format:italic', 'italic')
export const underline = toggleFormat('format:underline', 'underline')
export const strikethrough = toggleFormat('format:strikethrough', 'strikethrough')

/** Caret moves. `extend` keeps the anchor (Shift). Never a change. */
export type MoveParams = { extend?: boolean }

function mover(id: string, to: (s: Session, head: Pos, sel: Selection) => Pos): Command<MoveParams> {
  return {
    id,
    isEnabled: () => true,
    run({ session }, params) {
      const sel = session.selection
      let head: Pos
      if (!params?.extend && !collapsed(sel) && (id === 'move:left' || id === 'move:right')) {
        const [a, b] = ordered(sel)
        head = id === 'move:left' ? a : b
      } else head = to(session, sel.head, sel)
      session.select({ anchor: params?.extend ? sel.anchor : head, head })
      return null
    },
  }
}

export const moveLeft = mover('move:left', (s, h) => moveHorizontal(s, h, -1))
export const moveRight = mover('move:right', (s, h) => moveHorizontal(s, h, 1))
export const moveUp = mover('move:up', (s, h) => moveVerticalFrom(s, h, -1))
export const moveDown = mover('move:down', (s, h) => moveVerticalFrom(s, h, 1))
export const moveLineStart = mover('move:line-start', (s, h) => ({ ...h, offset: 0 }))
export const moveLineEnd = mover('move:line-end', (s, h) => ({ ...h, offset: s.text.length(h) }))
export const moveDocStart = mover('move:doc-start', () => documentStart())
export const moveDocEnd = mover('move:doc-end', (s, h) => documentEnd(s, h.section))

export const CORE_COMMANDS = [
  insertText,
  splitParagraph,
  deleteBackward,
  deleteForward,
  undo,
  redo,
  selectAll,
  bold,
  italic,
  underline,
  strikethrough,
  moveLeft,
  moveRight,
  moveUp,
  moveDown,
  moveLineStart,
  moveLineEnd,
  moveDocStart,
  moveDocEnd,
] as Command<never>[]

export class CommandBus {
  private readonly commands = new Map<string, Command<never>>()

  constructor(readonly session: Session, commands: Command<never>[] = [...CORE_COMMANDS, ...FORMAT_COMMANDS, ...FIND_COMMANDS, ...INSERT_COMMANDS, ...OBJECT_COMMANDS, ...FIELD_COMMANDS]) {
    for (const c of commands) this.register(c)
  }

  register(c: Command<never>): void {
    if (this.commands.has(c.id)) throw new Error(`command ${c.id} registered twice`)
    this.commands.set(c.id, c)
  }

  has(id: string): boolean {
    return this.commands.has(id)
  }

  ids(): string[] {
    return [...this.commands.keys()]
  }

  isEnabled(id: string, params?: unknown): boolean {
    const c = this.commands.get(id)
    return !!c && c.isEnabled({ session: this.session }, params as never)
  }

  isActive(id: string): boolean {
    const c = this.commands.get(id)
    return !!c?.isActive?.({ session: this.session })
  }

  private intercepts: Array<(id: string, params: unknown, origin: ChangeOrigin) => Change | null | undefined> = []

  /**
   * Take commands before they run (suggesting mode records edits as tracked
   * changes; a live room takes undo). The newest runs first; returning
   * undefined passes the command on. Returns the function that removes it.
   */
  addIntercept(fn: (id: string, params: unknown, origin: ChangeOrigin) => Change | null | undefined): () => void {
    this.intercepts.unshift(fn)
    return () => {
      this.intercepts = this.intercepts.filter((f) => f !== fn)
    }
  }

  /** Whether something (suggesting mode) is taking edit commands. */
  intercepting(): boolean {
    return this.intercepts.length > 0
  }

  run(id: string, params?: unknown, origin: ChangeOrigin = 'user'): Change | null {
    const c = this.commands.get(id)
    if (!c) throw new Error(`unknown command ${id}`)
    for (const fn of this.intercepts) {
      const r = fn(id, params, origin)
      if (r !== undefined) return r
    }
    if (!c.isEnabled({ session: this.session, origin }, params as never)) return null
    return c.run({ session: this.session, origin }, params as never)
  }
}

export { paraIndex }
