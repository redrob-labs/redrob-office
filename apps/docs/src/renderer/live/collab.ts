/**
 * Live typing: binds the editor to a shared Y.Doc with y-prosemirror while a
 * shared file is open. The binding is added to the running editor and taken
 * off again on leave, so a file that is not shared never carries it.
 *
 * While bound:
 *   - the shared text is the Y.Doc's "prosemirror" fragment;
 *   - undo and redo are Yjs's, scoped to this person's own changes, and the
 *     editor's local history is off (it would undo other people's typing);
 *   - other people's carets and selections are decorations from presence the
 *     shell relays; this person's caret goes back the same way;
 *   - a read-only role sees every change but cannot change the text.
 */
import type { Editor } from '@tiptap/core'
import { Plugin, PluginKey, type EditorState, type Transaction } from '@tiptap/pm/state'
import { history } from '@tiptap/pm/history'
import { keydownHandler } from '@tiptap/pm/keymap'
import * as Y from 'yjs'
import { Awareness } from 'y-protocols/awareness'
import {
  defaultDeleteFilter,
  prosemirrorToYXmlFragment,
  redoCommand,
  undoCommand,
  yCursorPlugin,
  yCursorPluginKey,
  ySyncPlugin,
  ySyncPluginKey,
  yUndoPlugin,
  yUndoPluginKey,
} from 'y-prosemirror'
import { seatOf } from '@genoffice/ui'
import type { LiveCursor, LivePeer } from '@genoffice/sync-client'

export const FRAGMENT = 'prosemirror'

/** blocks an undo never removes whole when only their text changed (y-prosemirror's "paragraph", in this schema's names) */
const PROTECTED_BLOCKS = new Set(['docParagraph', 'docHeading', 'docListItem'])

/** An UndoManager that outlives plugin-view rebuilds; release() is the real destroy. */
class KeptUndoManager extends Y.UndoManager {
  override destroy(): void {
    // ignored: y-prosemirror calls this from a plugin view's destroy
  }
  release(): void {
    super.destroy()
  }
}
const keysKey = new PluginKey('liveUndoKeys')
const guardKey = new PluginKey('liveReadOnly')

/** A transaction that renders someone else's change (not an undo or redo of this person's own). */
export function isRemoteChange(tr: Transaction): boolean {
  const meta = tr.getMeta(ySyncPluginKey) as { isChangeOrigin?: boolean; isUndoRedoOperation?: boolean } | undefined
  return !!meta?.isChangeOrigin && !meta.isUndoRedoOperation
}

/** Undo that follows whichever history is active: Yjs's while live, the editor's otherwise. */
export function historyUndo(editor: Editor): boolean {
  if (yUndoPluginKey.getState(editor.state)) return undoCommand(editor.state, editor.view.dispatch, editor.view)
  return editor.chain().focus().undo().run()
}

export function historyRedo(editor: Editor): boolean {
  if (yUndoPluginKey.getState(editor.state)) return redoCommand(editor.state, editor.view.dispatch, editor.view)
  return editor.chain().focus().redo().run()
}

export function historyCan(editor: Editor): { canUndo: boolean; canRedo: boolean } {
  const y = yUndoPluginKey.getState(editor.state) as { undoManager?: Y.UndoManager } | undefined
  if (y?.undoManager) return { canUndo: y.undoManager.undoStack.length > 0, canRedo: y.undoManager.redoStack.length > 0 }
  return { canUndo: editor.can().undo(), canRedo: editor.can().redo() }
}

function peerSeat(user: { id?: unknown } | undefined, clientId: number): number {
  return seatOf(typeof user?.id === 'string' ? user.id : String(clientId))
}

function caret(user: { id?: unknown; name?: unknown }, clientId: number): HTMLElement {
  const el = document.createElement('span')
  el.className = `docs-peer-caret docs-peer--${peerSeat(user, clientId)}`
  el.setAttribute('aria-hidden', 'true')
  const label = document.createElement('span')
  label.className = 'docs-peer-caret__name'
  label.textContent = typeof user.name === 'string' ? user.name : ''
  el.append(label)
  return el
}

/**
 * Remote people's presence written into a local Awareness, which is what
 * yCursorPlugin reads. These states are never sent anywhere from here; the
 * shell owns the real connection.
 */
export function applyPeers(awareness: Awareness, peers: readonly LivePeer[]): void {
  const next = new Map<number, { user: { id: string; name: string }; cursor: LiveCursor | null }>()
  for (const p of peers) if (p.clientId !== awareness.clientID) next.set(p.clientId, { user: { id: p.id, name: p.name }, cursor: p.cursor })
  const added: number[] = []
  const updated: number[] = []
  const removed: number[] = []
  for (const id of [...awareness.states.keys()]) {
    if (id === awareness.clientID || next.has(id)) continue
    awareness.states.delete(id)
    removed.push(id)
  }
  for (const [id, state] of next) {
    const had = awareness.states.get(id)
    if (had && JSON.stringify(had) === JSON.stringify(state)) continue
    awareness.states.set(id, state)
    ;(had ? updated : added).push(id)
  }
  if (added.length || updated.length || removed.length) awareness.emit('change', [{ added, updated, removed }, 'remote'])
}

export interface CollabOptions {
  editor: Editor
  doc: Y.Doc
  /** put the editor's current content into an empty shared text */
  seed: boolean
  readOnly: boolean
  /** this person's caret, as relative positions, whenever it moves */
  onCursor: (cursor: LiveCursor | null) => void
}

export interface CollabHandle {
  awareness: Awareness
  setPeers(peers: readonly LivePeer[]): void
  destroy(): void
}

export function startCollab({ editor, doc, seed, readOnly, onCursor }: CollabOptions): CollabHandle {
  const fragment = doc.getXmlFragment(FRAGMENT)
  if (seed && fragment.length === 0) {
    doc.transact(() => prosemirrorToYXmlFragment(editor.state.doc, fragment))
  }

  // the editor's own history would undo other people's typing: off while live
  const historyPlugin = editor.state.plugins.find((p) => String((p as unknown as { key: string }).key).startsWith('history$'))
  const historyConfig = (historyPlugin?.spec as { config?: object } | undefined)?.config
  if (historyPlugin) editor.unregisterPlugin('history')

  const awareness = new Awareness(doc)
  awareness.setLocalState({})
  const onChange = (_changes: unknown, origin: unknown) => {
    if (origin !== 'local') return
    const c = (awareness.getLocalState() as { cursor?: { anchor: Y.RelativePosition; head: Y.RelativePosition } | null } | null)?.cursor
    // relative positions as plain JSON, which is what crosses IPC and the service
    onCursor(c ? { anchor: Y.relativePositionToJSON(c.anchor), head: Y.relativePositionToJSON(c.head) } : null)
  }
  awareness.on('change', onChange)

  const keys = new Plugin({
    key: keysKey,
    props: {
      handleKeyDown: keydownHandler({ 'Mod-z': undoCommand, 'Mod-y': redoCommand, 'Mod-Shift-z': redoCommand }),
    },
  })
  const guard = new Plugin({
    key: guardKey,
    // read-only: other people's changes still render; this person's never reach the text
    filterTransaction: (tr: Transaction, _state: EditorState) => !readOnly || !tr.docChanged || isRemoteChange(tr),
  })
  // y-prosemirror's undo plugin destroys its UndoManager whenever plugin
  // views are rebuilt (any plugin registered later does that), so this one
  // is owned here and only destroyed on leave
  const undoManager = new KeptUndoManager(fragment, {
    trackedOrigins: new Set([ySyncPluginKey]),
    deleteFilter: (item) => defaultDeleteFilter(item, PROTECTED_BLOCKS),
    captureTransaction: (tr) => tr.meta.get('addToHistory') !== false,
  })
  const plugins = [
    ySyncPlugin(fragment),
    yCursorPlugin(awareness, {
      cursorBuilder: caret,
      selectionBuilder: (user: { id?: unknown }, clientId: number) => ({
        class: `docs-peer-sel docs-peer--${peerSeat(user, clientId)}`,
        nodeName: 'span',
      }),
    }),
    yUndoPlugin({ undoManager }),
    keys,
    guard,
  ]
  // All in one reconfigure, sync first (the undo and cursor plugins read its
  // state when they start), and ahead of the editor's own plugins so the undo
  // keys run before its keymaps.
  editor.registerPlugin(plugins[0]!, (_first, existing) => [...plugins, ...existing])

  return {
    awareness,
    setPeers: (peers) => applyPeers(awareness, peers),
    destroy: () => {
      awareness.off('change', onChange)
      for (const key of [ySyncPluginKey, yCursorPluginKey, yUndoPluginKey, keysKey, guardKey]) {
        if (editor.isDestroyed) break
        editor.unregisterPlugin(key)
      }
      if (!editor.isDestroyed && historyPlugin) editor.registerPlugin(history(historyConfig))
      undoManager.release()
      awareness.destroy()
    },
  }
}
