// Keyboard shortcuts: 한글's own map (generated from the coverage list into
// hangul-shortcuts.json by scripts/hangul-coverage.mjs) plus the editing keys
// every text surface has. A shortcut fires only when its command is registered
// and enabled, so a plain-key binding (`p` for object properties) never eats
// typing.
import shortcuts from './hangul-shortcuts.json'

export interface ShortcutDef {
  key: string
  code?: string
  ctrl?: boolean
  shift?: boolean
  alt?: boolean
  command: string
  /** Params passed to the command. */
  params?: unknown
}

export interface KeyLike {
  key: string
  code?: string
  ctrlKey: boolean
  metaKey: boolean
  shiftKey: boolean
  altKey: boolean
}

/** Editing keys. `extend` comes from Shift for moves. */
const EDITING: ShortcutDef[] = [
  { key: 'enter', command: 'edit:split-paragraph' },
  { key: 'backspace', command: 'edit:delete-backward' },
  { key: 'delete', command: 'edit:delete-forward' },
  { key: 'arrowleft', command: 'move:left' },
  { key: 'arrowright', command: 'move:right' },
  { key: 'arrowup', command: 'move:up' },
  { key: 'arrowdown', command: 'move:down' },
  { key: 'home', command: 'move:line-start' },
  { key: 'end', command: 'move:line-end' },
  { key: 'home', ctrl: true, command: 'move:doc-start' },
  { key: 'end', ctrl: true, command: 'move:doc-end' },
]

const MOVES = new Set(EDITING.filter((d) => d.command.startsWith('move:')).map((d) => d.key))

export const HANGUL_SHORTCUTS: ShortcutDef[] = (shortcuts as { shortcuts: ShortcutDef[] }).shortcuts

export interface Resolved {
  command: string
  params?: unknown
}

/**
 * Resolve a key event. `mac` maps Cmd to Ctrl, as 한글 for macOS does. During
 * IME composition the key is "Process", so a binding with a `code` matches on
 * the physical key (한글's own rule for Ctrl+A under the Korean IME).
 */
export function resolveKey(e: KeyLike, mac = false, defs: ShortcutDef[] = [...EDITING, ...HANGUL_SHORTCUTS]): Resolved[] {
  const key = e.key.toLowerCase()
  const ctrl = mac ? e.metaKey : e.ctrlKey
  const out: Resolved[] = []
  for (const d of defs) {
    const isMove = !d.ctrl && !d.alt && MOVES.has(d.key)
    const keyMatches = d.key === key || (d.code !== undefined && d.code === e.code)
    if (!keyMatches) continue
    if (!!d.ctrl !== ctrl || !!d.alt !== e.altKey) continue
    // Moves accept Shift (to extend); everything else must match Shift exactly.
    if (!isMove && !!d.shift !== e.shiftKey) continue
    const ctrlMove = d.ctrl && (d.command === 'move:doc-start' || d.command === 'move:doc-end')
    out.push({ command: d.command, params: isMove || ctrlMove ? { extend: e.shiftKey } : d.params })
  }
  return out
}
