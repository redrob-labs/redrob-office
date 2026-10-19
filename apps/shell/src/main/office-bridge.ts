/**
 * Office's app bridge: the tools the shared Redrob Code daemon's agent can drive this
 * shell with, served over MCP on loopback (see ./app-bridge.ts, a vendored copy of the
 * redrob-code package; protocol in redrob-code docs/APP-BRIDGE.md).
 *
 * Every tool acts on the real tabs through the code paths the menus already use:
 * `openDocumentPath` for File > Open, the per-app save/export requests the File menu
 * sends to a tab's renderer, and the slides session the main process already owns.
 * The two edit tools (write_cells, replace_text) ask the tab's renderer over a
 * request/response channel to apply the edit through the editor's own undoable path
 * (sheets: the AI panel's set_range plan; docs: the Find panel's replace), since that
 * edit state lives only in the renderer. Where an app keeps its text only in the
 * renderer and has no such channel (hangul, pdf) the tool says so instead of
 * guessing.
 *
 * The bridge is optional: a daemon that cannot be reached is logged and the shell runs
 * without it, exactly as the AI panel does.
 */
import { readFile } from 'node:fs/promises'
import { isAbsolute } from 'node:path'

import { app } from 'electron'
import type { WebContents } from 'electron'
import { z } from 'zod'

import type { SlideElement, TextBody } from '@genoffice/pptx-engine'

import { docsQueryDirty, requestDocsReplaceText } from '../../../docs/src/main/docs-main'
import {
  hangulFilePath,
  hangulIsDirty,
  requestHangulSave,
} from '../../../hangul/src/main/hangul-main'
import {
  markdownFilePath,
  markdownIsDirty,
  requestMarkdownSave,
  sendMarkdownExportRequest,
} from '../../../markdown/src/main/markdown-main'
import { flushPdfSave, pdfIsDirty, requestPdfSaveAs } from '../../../pdf/src/main/pdf-main'
import {
  requestSheetsWriteCells,
  sheetsPendingEditCount,
} from '../../../sheets/src/main/sheets-main'
import { IPC_CHANNELS as SHEETS_CHANNELS } from '../../../sheets/src/shared/ipc-channels'
import { sessions as slidesSessions } from '../../../slides/src/main/session-state'
import { slidesIsDirty } from '../../../slides/src/main/slides-main'
import type { TabKind } from '../shared/tabs-api'

import { startAppBridge, type AppBridgeHandle, type ToolDef } from './app-bridge'
import { currentDaemon } from './engine-daemon'
import { ensureEngine } from './engine-lifecycle'
import type { TabManager } from './tab-manager'

/** Longest text a read tool answers; the agent asks for a range when it needs more. */
const READ_CAP = 8_000

export type OfficeBridgeHooks = {
  tabs: TabManager
  /** File > Open's router: extension decides the editor; false = nothing opened */
  openDocumentPath: (filePath: string) => boolean
}

let handle: AppBridgeHandle | null = null
let starting: Promise<void> | null = null

const tabIdArg = z
  .string()
  .optional()
  .describe('Tab id from list_documents. Omitted: the active tab.')

/** The tab a tool call means: the named one, else the active document tab. */
function resolveTab(
  hooks: OfficeBridgeHooks,
  tabId: string | undefined,
): { id: string; kind: TabKind; wc: WebContents; filePath: string | undefined } {
  const summary = tabId
    ? hooks.tabs.list().find((t) => t.id === tabId)
    : hooks.tabs.list().find((t) => t.active)
  if (!summary) throw new Error(tabId ? `No tab ${tabId}` : 'No active tab')
  if (summary.kind === 'home') throw new Error('The Home tab is not a document')
  const wc = hooks.tabs.webContentsOf(summary.id)
  if (!wc || wc.isDestroyed()) throw new Error(`Tab ${summary.id} has no live editor`)
  return { id: summary.id, kind: summary.kind, wc, filePath: hooks.tabs.filePathOf(summary.id) }
}

async function isDirty(kind: TabKind, wc: WebContents): Promise<boolean> {
  switch (kind) {
    case 'sheets':
      return sheetsPendingEditCount(wc.id) > 0
    case 'slides':
      return slidesIsDirty(wc.id)
    case 'markdown':
      return markdownIsDirty(wc.id)
    case 'hangul':
      return hangulIsDirty(wc.id)
    case 'pdf':
      return pdfIsDirty(wc.id)
    case 'docs':
      return docsQueryDirty(wc).catch(() => false)
    default:
      return false
  }
}

function cap(text: string): string {
  return text.length > READ_CAP ? `${text.slice(0, READ_CAP)}\n… (${text.length - READ_CAP} more characters)` : text
}

function bodyText(body: TextBody | undefined): string {
  if (!body) return ''
  return body.paragraphs
    .map((p) => p.runs.map((r) => r.text).join(''))
    .filter((line) => line.trim().length > 0)
    .join('\n')
}

function elementText(element: SlideElement, out: string[]): void {
  if (element.type === 'group') {
    for (const child of element.children) elementText(child, out)
    return
  }
  if (element.type === 'table') {
    for (const row of element.rows) {
      const cells = row.map((cell) => bodyText(cell.text).replace(/\n/g, ' '))
      if (cells.some((c) => c.length > 0)) out.push(cells.join('\t'))
    }
    return
  }
  if ('text' in element) {
    const text = bodyText(element.text)
    if (text) out.push(text)
  }
}

/** One block per slide: "Slide N" then every text element's text, in z-order. */
function slidesOutline(wc: WebContents): string {
  const session = slidesSessions.get(wc.id)
  if (!session) throw new Error('The slides tab has no open deck yet')
  const blocks: string[] = []
  session.opened.deck.slides.forEach((slide, i) => {
    const lines: string[] = []
    for (const element of slide.elements) elementText(element, lines)
    blocks.push(`Slide ${i + 1}\n${lines.join('\n')}`.trimEnd())
  })
  return blocks.join('\n\n')
}

function tools(hooks: OfficeBridgeHooks): ToolDef[] {
  return [
    {
      name: 'list_documents',
      description:
        'List the open document tabs, one per line: tab id, app kind (docs, sheets, slides, hangul, markdown, pdf), file path or (untitled), dirty flag, and * on the active tab.',
      handler: async () => {
        const rows: string[] = []
        for (const t of hooks.tabs.list()) {
          if (t.kind === 'home') continue
          const wc = hooks.tabs.webContentsOf(t.id)
          const dirty = wc && !wc.isDestroyed() ? await isDirty(t.kind, wc) : false
          rows.push(
            [
              t.id,
              t.kind,
              hooks.tabs.filePathOf(t.id) ?? '(untitled)',
              dirty ? 'dirty' : 'clean',
              t.active ? '*' : '',
            ]
              .join('\t')
              .trimEnd(),
          )
        }
        return rows.length > 0 ? rows.join('\n') : 'No documents open'
      },
    },
    {
      name: 'open_document',
      description:
        'Open a file in the editor its extension belongs to (docx, xlsx, csv, pptx, pdf, md, hwp, hwpx), the same as File > Open, and answer the new tab id.',
      input: z.object({ path: z.string().describe('Absolute path of the file to open') }),
      handler: ({ path }) => {
        const filePath = String(path)
        if (!isAbsolute(filePath)) throw new Error('path must be absolute')
        if (!hooks.openDocumentPath(filePath)) throw new Error(`Could not open ${filePath}`)
        const active = hooks.tabs.list().find((t) => t.active)
        if (!active || active.kind === 'home') throw new Error(`Opened ${filePath} but no tab became active`)
        return `${active.id}\t${active.kind}\t${filePath}`
      },
    },
    {
      name: 'read_document',
      description:
        'Read a document as text: for slides the slide outline (every text element per slide), for markdown the saved file text. Sheets, hangul, pdf and docs keep their content in the editor and cannot be read from here. Capped at 8000 characters.',
      input: z.object({ tab_id: tabIdArg }),
      handler: async ({ tab_id }) => {
        const tab = resolveTab(hooks, tab_id as string | undefined)
        if (tab.kind === 'slides') return cap(slidesOutline(tab.wc))
        if (tab.kind === 'markdown') {
          const filePath = markdownFilePath(tab.wc.id) ?? tab.filePath
          if (!filePath) throw new Error('Untitled markdown document: save it first')
          if (markdownIsDirty(tab.wc.id))
            throw new Error('The markdown document has unsaved edits: call save_document first')
          return cap(await readFile(filePath, 'utf8'))
        }
        throw new Error(`read_document is not available for ${tab.kind} tabs`)
      },
    },
    {
      name: 'save_document',
      description:
        'Save a document to its own file, as Ctrl+S does. Answers "saved <path>" for markdown, hangul and pdf, or "save requested" for sheets and slides whose save runs in the editor. An untitled markdown or hangul document answers an error naming save_as.',
      input: z.object({ tab_id: tabIdArg }),
      handler: async ({ tab_id }) => {
        const tab = resolveTab(hooks, tab_id as string | undefined)
        switch (tab.kind) {
          case 'markdown': {
            const path = markdownFilePath(tab.wc.id) ?? tab.filePath
            if (!path) throw new Error('Untitled document: use save_as (or File > Save As in the app)')
            if (!(await requestMarkdownSave(tab.wc, 'save'))) throw new Error('Save failed')
            return `saved ${path}`
          }
          case 'hangul': {
            const path = hangulFilePath(tab.wc.id) ?? tab.filePath
            if (!path) throw new Error('Untitled document: use save_as (or File > Save As in the app)')
            if (!(await requestHangulSave(tab.wc, 'save'))) throw new Error('Save failed')
            return `saved ${path}`
          }
          case 'pdf': {
            if (!tab.filePath) throw new Error('Untitled document: use save_as')
            if (!(await flushPdfSave(tab.wc))) throw new Error('Save failed')
            return `saved ${tab.filePath}`
          }
          case 'sheets':
            tab.wc.send(SHEETS_CHANNELS.menuAction, 'save')
            return 'save requested (an untitled workbook asks for a name in the app)'
          case 'slides':
            tab.wc.send('slides:menu', 'save')
            return 'save requested (an untitled deck is saved to the drafts folder)'
          default:
            throw new Error(`save_document is not available for ${tab.kind} tabs`)
        }
      },
    },
    {
      name: 'save_as',
      description:
        'Save a pdf tab to a new path without touching the original file. Other editors pick their Save As target in a dialog and cannot take a path from here.',
      input: z.object({
        tab_id: tabIdArg,
        path: z.string().describe('Absolute destination path'),
      }),
      handler: async ({ tab_id, path }) => {
        const tab = resolveTab(hooks, tab_id as string | undefined)
        const target = String(path)
        if (!isAbsolute(target)) throw new Error('path must be absolute')
        if (tab.kind !== 'pdf')
          throw new Error(`save_as with a path is only available for pdf tabs; ${tab.kind} uses File > Save As in the app`)
        if (!(await requestPdfSaveAs(tab.wc, target))) throw new Error('Save As failed')
        return `saved ${target}`
      },
    },
    {
      name: 'export_pdf',
      description:
        'Start the PDF export of a sheets, slides or markdown tab through its File > Export menu path; the editor asks for the destination in a save dialog and opens the result. Answers when the export has been requested.',
      input: z.object({ tab_id: tabIdArg }),
      handler: ({ tab_id }) => {
        const tab = resolveTab(hooks, tab_id as string | undefined)
        hooks.tabs.activateTab(tab.id)
        switch (tab.kind) {
          case 'sheets':
            tab.wc.send(SHEETS_CHANNELS.menuAction, 'export-pdf')
            break
          case 'slides':
            tab.wc.send('slides:menu', 'export-pdf')
            break
          case 'markdown':
            sendMarkdownExportRequest(tab.wc, 'pdf')
            break
          case 'pdf':
            throw new Error('The tab is already a PDF: use save_as')
          default:
            throw new Error(`export_pdf is not available for ${tab.kind} tabs`)
        }
        return `PDF export requested for ${tab.id}; the destination is chosen in the app`
      },
    },
    {
      name: 'write_cells',
      description:
        'Write a rectangular block of values into a sheets tab, as typing them would: strings starting with "=" are formulas, null clears a cell. Applied through the editor, so Ctrl+Z undoes it; the workbook stays unsaved until save_document. Answers the number of cells changed. At most 500 rows x 100 columns per call.',
      input: z.object({
        tab_id: tabIdArg,
        sheet: z.string().optional().describe('Sheet name. Omitted: the active sheet.'),
        range: z
          .string()
          .describe('A1 top-left cell ("B2") or full range ("B2:D5", must match the size of values)'),
        values: z
          .array(z.array(z.union([z.string(), z.number(), z.boolean(), z.null()])))
          .describe('Rows of cell values, all rows the same length'),
      }),
      handler: async ({ tab_id, sheet, range, values }) => {
        const tab = resolveTab(hooks, tab_id as string | undefined)
        if (tab.kind !== 'sheets') throw new Error(`write_cells is only available for sheets tabs, not ${tab.kind}`)
        const result = await requestSheetsWriteCells(tab.wc, {
          ...(typeof sheet === 'string' && sheet ? { sheet } : {}),
          range: String(range),
          values: values as (string | number | boolean | null)[][],
        })
        if (!result.ok) throw new Error(result.error ?? 'write_cells failed')
        return `wrote ${result.written ?? 0} cell(s) in ${tab.id}`
      },
    },
    {
      name: 'replace_text',
      description:
        'Find and replace text in a docs tab, as Edit > Replace does (whole document, matches inside one paragraph). Applied as one editor change, so Ctrl+Z undoes it; the document stays unsaved until it is saved in the app. Answers the number of matches replaced (0 when nothing matched).',
      input: z.object({
        tab_id: tabIdArg,
        find: z.string().min(1).describe('Text to find'),
        replace: z.string().describe('Replacement text (may be empty)'),
        all: z.boolean().optional().describe('Replace every match (default) or, when false, only the first'),
        match_case: z.boolean().optional().describe('Case-sensitive match (default false)'),
      }),
      handler: async ({ tab_id, find, replace, all, match_case }) => {
        const tab = resolveTab(hooks, tab_id as string | undefined)
        if (tab.kind !== 'docs') throw new Error(`replace_text is only available for docs tabs, not ${tab.kind}`)
        const result = await requestDocsReplaceText(tab.wc, {
          find: String(find),
          replace: String(replace),
          all: all !== false,
          matchCase: match_case === true,
        })
        if (!result.ok) throw new Error(result.error ?? 'replace_text failed')
        return `replaced ${result.replaced ?? 0} match(es) in ${tab.id}`
      },
    },
  ]
}

/**
 * Start the bridge once the shell window exists. Attaches to the shared daemon through the
 * engine lifecycle (one attachment, never a second daemon) and registers the tools. Any
 * failure is logged and swallowed: Office works without the daemon.
 */
export function startOfficeBridge(hooks: OfficeBridgeHooks): Promise<void> {
  if (handle || starting) return starting ?? Promise.resolve()
  starting = (async () => {
    try {
      await ensureEngine(app.getPath('userData'))
      const connect = await currentDaemon()
      if (!connect) throw new Error('the shared daemon did not answer')
      handle = await startAppBridge({
        name: 'office',
        version: app.getVersion(),
        tools: tools(hooks),
        connect,
      })
      console.log(`[office-bridge] bridged as ${handle.id} on ${handle.url}`)
    } catch (error) {
      console.warn('[office-bridge] not bridged:', error instanceof Error ? error.message : String(error))
    } finally {
      starting = null
    }
  })()
  return starting
}

/** Unregister from the daemon and stop the MCP server. Safe when never started. */
export async function stopOfficeBridge(): Promise<void> {
  const current = handle
  handle = null
  if (current) await current.stop().catch(() => undefined)
}
