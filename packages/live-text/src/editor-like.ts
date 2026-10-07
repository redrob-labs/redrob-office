/**
 * The part of a tiptap Editor the live binding uses, typed structurally so
 * Docs and Markdown can each pass their own tiptap build (they pin different
 * versions; the ProseMirror packages underneath are the same ones).
 */
import type { EditorState, Plugin, PluginKey, Transaction } from 'prosemirror-state'
import type { EditorView } from 'prosemirror-view'

export interface LiveEditor {
  readonly state: EditorState
  readonly view: EditorView
  readonly isDestroyed: boolean
  registerPlugin(plugin: Plugin, handlePlugins?: (newPlugin: Plugin, plugins: Plugin[]) => Plugin[]): unknown
  unregisterPlugin(nameOrPluginKey: string | PluginKey | (string | PluginKey)[]): unknown
  /** the editor's own history, used when no live binding is on */
  chain(): { focus(): { undo(): { run(): boolean }; redo(): { run(): boolean } } }
  can(): { undo(): boolean; redo(): boolean }
  on(event: 'selectionUpdate' | 'transaction', fn: (props: { transaction?: Transaction }) => void): unknown
  off(event: 'selectionUpdate' | 'transaction', fn: (props: { transaction?: Transaction }) => void): unknown
}
