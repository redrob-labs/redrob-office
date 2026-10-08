/**
 * 한글 commands the editor host runs (spec task 2.6): the ones that open a
 * dialog, reach the clipboard or a file, or change the editor frame rather
 * than the document. Keyboard shortcuts, the ribbon and command search all come
 * here for ids the command bus does not have, so one table says what each does
 * and the coverage test can check every id against it.
 *
 * Document edits stay on the bus; a dialog here ends by running a bus command.
 */
import type { InsertKind } from './InsertDialogs'

export type HostDialog =
  | 'char-shape'
  | 'para-shape'
  | 'find'
  | 'replace'
  | 'page-setup'
  | 'table-props'
  | 'table-borders'
  | 'object-props'
  | 'hyperlink'
  | 'click-here'
  | 'styles'
  | 'chart'
  | 'about'
  | 'page-hide'
  | 'insert-rows-cols'
  | 'delete-rows-cols'
  | 'columns'
  | 'section'
  | 'page-border'
  | 'endnote-shape'
  | 'hf-template'
  | 'numbering-shape'
  | 'bullet-shape'
  | 'symbols'
  | 'field-edit'
  | 'grid'
  | InsertKind

export interface HostDeps {
  openDialog(d: HostDialog): void
  save(mode: 'save' | 'saveAs', format?: 'hwp' | 'hwpx'): void
  clipboard(kind: 'cut' | 'copy' | 'paste'): void
  /** Run a bus command; false when it is not enabled. */
  run(id: string, params?: unknown): boolean
  pickPicture(): void
  comments(compose: boolean): void
  versions(): void
  setToolbar(choice: 'simple' | 'classic'): void
  toggleMarkup(): void
  /** The kind of the selected object, if any. */
  objectKind(): 'picture' | 'shape' | 'chart' | 'equation' | null
  /** Whether the caret is in a table. */
  inTable(): boolean
  /** Whether the caret is in a click-here field. */
  inField(): boolean
  /** Print, or save as PDF, the engine's pages; export the document as HTML. */
  output(kind: 'print' | 'pdf' | 'html'): void
}

type Handler = (d: HostDeps, params?: unknown) => boolean

const dialog = (k: HostDialog): Handler => (d) => (d.openDialog(k), true)

export const HOST_COMMANDS: Record<string, Handler> = {
  // Files. Opening and new documents belong to the shell's Home, not to an editor tab.
  'file:save': (d) => (d.save('save'), true),
  'file:save-as': (d) => (d.save('saveAs'), true),
  'file:save-as-hwp': (d) => (d.save('saveAs', 'hwp'), true),
  'file:save-as-hwpx': (d) => (d.save('saveAs', 'hwpx'), true),
  'file:page-setup': dialog('page-setup'),
  'file:about': dialog('about'),
  'file:print': (d) => (d.output('print'), true),
  'file:print-to-pdf': (d) => (d.output('pdf'), true),
  'file:export-html': (d) => (d.output('html'), true),
  // Editing
  'edit:cut': (d) => (d.clipboard('cut'), true),
  'edit:copy': (d) => (d.clipboard('copy'), true),
  'edit:paste': (d) => (d.clipboard('paste'), true),
  'edit:find': dialog('find'),
  'edit:find-replace': dialog('replace'),
  // 다시 찾기 repeats the last search; with none yet, it opens 찾기.
  'edit:find-again': (d) => d.run('edit:find-next') || (d.openDialog('find'), true),
  'edit:goto': dialog('edit:goto-page'),
  'edit:document-history': (d) => (d.versions(), true),
  // Formatting
  'format:char-shape': dialog('char-shape'),
  'format:para-shape': dialog('para-shape'),
  // 줄 간격 opens the paragraph shape, where the spacing is set.
  'format:line-spacing': dialog('para-shape'),
  'format:style-dialog': dialog('styles'),
  'format:object-properties': (d) => {
    const k = d.objectKind()
    if (!k) return false
    d.openDialog(k === 'chart' ? 'chart' : k === 'equation' ? 'insert:equation-edit' : 'object-props')
    return true
  },
  // Inserting
  'insert:image': (d) => (d.pickPicture(), true),
  'insert:picture-props': (d) => HOST_COMMANDS['format:object-properties']!(d),
  'insert:hyperlink-dialog': dialog('hyperlink'),
  'hyperlink:edit-dialog': dialog('hyperlink'),
  'insert:field-dialog': dialog('click-here'),
  'insert:chart-dialog': dialog('chart'),
  'insert:chart-data-edit': (d) => (d.objectKind() === 'chart' ? (d.openDialog('chart'), true) : false),
  'insert:equation': dialog('insert:equation'),
  'insert:equation-edit': (d) => (d.objectKind() === 'equation' ? (d.openDialog('insert:equation-edit'), true) : false),
  'insert:footnote': dialog('insert:footnote'),
  'insert:bookmark': dialog('insert:bookmark'),
  // Pages
  'page:setup': dialog('page-setup'),
  'page:header-create': dialog('page:header-create'),
  'page:footer-create': dialog('page:footer-create'),
  'page:new-page-num': dialog('page:new-page-num'),
  'page:hide': dialog('page-hide'),
  // Tables
  'table:cell-props': (d) => (d.inTable() ? (d.openDialog('table-props'), true) : false),
  'table:border-each': (d) => (d.inTable() ? (d.openDialog('table-borders'), true) : false),
  'table:border-one': (d) => (d.inTable() ? (d.openDialog('table-borders'), true) : false),
  'table:formula': (d) => (d.inTable() ? (d.openDialog('table:formula'), true) : false),
  'table:insert-row-col': (d) => (d.inTable() ? (d.openDialog('insert-rows-cols'), true) : false),
  'table:delete-row-col': (d) => (d.inTable() ? (d.openDialog('delete-rows-cols'), true) : false),
  'page:col-settings': dialog('columns'),
  'page:section-settings': dialog('section'),
  'page:page-border': dialog('page-border'),
  'page:apply-hf-template': dialog('hf-template'),
  'insert:endnote-shape': dialog('endnote-shape'),
  'insert:symbols': dialog('symbols'),
  'format:para-num-shape': dialog('numbering-shape'),
  'format:bullet-shape': dialog('bullet-shape'),
  'field:edit': (d) => (d.inField() ? (d.openDialog('field-edit'), true) : false),
  'view:grid-settings': dialog('grid'),
  // View
  'view:zoom-dialog': dialog('view:zoom-set'),
  'view:toolbox-basic': (d) => (d.setToolbar('simple'), true),
  'view:toolbox-format': (d) => (d.setToolbar('classic'), true),
  // Review
  'review:memo-insert': (d) => (d.comments(true), true),
  'review:memo-show': (d) => (d.comments(false), true),
  'review:show-markup': (d) => (d.toggleMarkup(), true),
}

/**
 * Coverage-list commands that are not reachable yet, with why. The coverage
 * test fails when an id is neither on the bus, nor here, nor in HOST_COMMANDS,
 * so this list only shrinks.
 */
export const NOT_YET: Record<string, string> = {
  'file:new-doc': 'opened from Home in the shell',
  'file:open': 'opened from Home in the shell',
  'file:open-recent': 'recent files are listed on Home in the shell',
  'file:clear-recent': 'recent files are listed on Home in the shell',
  'file:export-doc': 'needs a .doc export',
  'edit:compare-documents': 'needs a document diff view',
  'insert:group-shapes': 'needs selecting several objects',
  'page:insert-field-filename': 'a file name field exists only inside headers and footers',
  'tool:options': 'settings live in the shell',
  'view:form-mode': 'needs form mode',
}

/**
 * Bus commands that need input first: a shortcut or a ribbon button opens their
 * dialog (the host entry above), which then runs the bus command with it.
 */
export const DIALOG_FIRST: ReadonlySet<string> = new Set([
  'insert:image',
  'insert:equation',
  'insert:footnote',
  'insert:bookmark',
  'page:header-create',
  'page:footer-create',
  'page:new-page-num',
  'page:hide',
  'table:formula',
  'insert:equation-edit',
])

/** Run a host command; false when the id is not one or it does not apply now. */
export function runHostCommand(deps: HostDeps, id: string, params?: unknown): boolean {
  const h = HOST_COMMANDS[id]
  return h ? h(deps, params) : false
}
