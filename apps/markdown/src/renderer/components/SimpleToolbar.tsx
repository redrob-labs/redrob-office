import type { ReactElement } from 'react'
import type { Editor } from '@tiptap/core'
import {
  Dropdown,
  Icon,
  Toolbar,
  ToolbarButton,
  ToolbarGroup,
  ToolbarSpacer,
  type FrameTool,
} from '@genoffice/ui'
import { useI18n } from '../i18n/locale'
import type { StringKey } from '../i18n/locale'

type T = (key: StringKey) => string
export type MdStyle = 'p' | 'h1' | 'h2' | 'h3' | 'quote' | 'code'

export interface MdRedrob {
  ask: () => void
  run: (prompt: string) => void
}

/** the commands both toolbars and the title bar search run */
export function mdCommands(editor: Editor | null) {
  const chain = () => editor?.chain().focus()
  return {
    bold: () => chain()?.toggleBold().run(),
    italic: () => chain()?.toggleItalic().run(),
    strike: () => chain()?.toggleStrike().run(),
    code: () => chain()?.toggleCode().run(),
    bullets: () => chain()?.toggleBulletList().run(),
    numbering: () => chain()?.toggleOrderedList().run(),
    tasks: () => chain()?.toggleTaskList().run(),
    table: () => chain()?.insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run(),
    style: (s: MdStyle) => {
      const c = chain()
      if (!c) return
      if (s === 'p') c.setParagraph().run()
      else if (s === 'quote') c.setParagraph().setBlockquote().run()
      else if (s === 'code') c.setCodeBlock().run()
      else c.setHeading({ level: Number(s.slice(1)) as 1 | 2 | 3 }).run()
    },
  }
}

export type MdCommands = ReturnType<typeof mdCommands>

export function currentMdStyle(editor: Editor | null): MdStyle {
  if (!editor) return 'p'
  for (const level of [1, 2, 3] as const) if (editor.isActive('heading', { level })) return `h${level}`
  if (editor.isActive('blockquote')) return 'quote'
  if (editor.isActive('codeBlock')) return 'code'
  return 'p'
}

export function mdTools(t: T, cmd: MdCommands, redrob: MdRedrob, canEdit: boolean): FrameTool[] {
  const off = !canEdit
  return [
    { id: 'ask', label: t('aiAskBtn'), keywords: ['redrob', 'ai'], run: redrob.ask },
    { id: 'summarize', label: t('mdSimpleSummarize'), group: 'Redrob', run: () => redrob.run(t('aiSummarizePrompt')) },
    { id: 'polish', label: t('mdSimplePolish'), group: 'Redrob', run: () => redrob.run(t('aiPolishPrompt')), disabled: off },
    { id: 'tidy', label: t('mdSimpleTidy'), group: 'Redrob', run: () => redrob.run(t('aiTidyPrompt')), disabled: off },
    { id: 'bold', label: t('bold'), run: cmd.bold, disabled: off },
    { id: 'italic', label: t('italic'), run: cmd.italic, disabled: off },
    { id: 'strike', label: t('strike'), run: cmd.strike, disabled: off },
    { id: 'code', label: t('inlineCode'), run: cmd.code, disabled: off },
    { id: 'bullets', label: t('bulletList'), keywords: ['list'], run: cmd.bullets, disabled: off },
    { id: 'numbering', label: t('orderedList'), keywords: ['list'], run: cmd.numbering, disabled: off },
    { id: 'tasks', label: t('taskList'), keywords: ['todo', 'checklist'], run: cmd.tasks, disabled: off },
    { id: 'table', label: t('insertTable'), run: cmd.table, disabled: off },
    { id: 'h1', label: t('styleH1'), run: () => cmd.style('h1'), disabled: off },
    { id: 'h2', label: t('styleH2'), run: () => cmd.style('h2'), disabled: off },
    { id: 'quote', label: t('styleQuote'), run: () => cmd.style('quote'), disabled: off },
  ]
}

export interface MdSimpleToolbarProps {
  editor: Editor | null
  cmd: MdCommands
  redrob: MdRedrob
  canEdit: boolean
}

/**
 * Markdown's simplified toolbar (handoff 06-markdown): Ask Redrob, paragraph
 * style, inline marks, lists, table, then Summarize, Polish and Format.
 */
export function SimpleToolbar({ editor, cmd, redrob, canEdit }: MdSimpleToolbarProps): ReactElement {
  const { t } = useI18n()
  const off = !canEdit
  const on = (name: string) => !!editor?.isActive(name)
  return (
    <Toolbar label={t('ribbonFormatting')} className="md-simple-toolbar">
      <ToolbarGroup>
        <ToolbarButton size="lg" label={t('aiAskBtn')} icon={<Icon name="sparkle" size={16} />} keepFocus={false} onClick={redrob.ask} />
      </ToolbarGroup>
      <ToolbarGroup label={t('blockStyle')}>
        <Dropdown
          className="md-simple-style"
          ariaLabel={t('blockStyle')}
          tip={t('blockStyle')}
          disabled={off}
          value={currentMdStyle(editor)}
          options={[
            { value: 'p', label: t('styleParagraph') },
            { value: 'h1', label: t('styleH1') },
            { value: 'h2', label: t('styleH2') },
            { value: 'h3', label: t('styleH3') },
            { value: 'quote', label: t('styleQuote') },
            { value: 'code', label: t('styleCodeBlock') },
          ]}
          onPick={(v) => cmd.style(v)}
        />
        <ToolbarButton label={t('bold')} icon={<Icon name="bold" />} pressed={on('bold')} disabled={off} onClick={cmd.bold} />
        <ToolbarButton label={t('italic')} icon={<Icon name="italic" />} pressed={on('italic')} disabled={off} onClick={cmd.italic} />
        <ToolbarButton label={t('strike')} icon={<Icon name="strikethrough" />} pressed={on('strike')} disabled={off} onClick={cmd.strike} />
        <ToolbarButton label={t('inlineCode')} icon={<Icon name="code" />} pressed={on('code')} disabled={off} onClick={cmd.code} />
      </ToolbarGroup>
      <ToolbarGroup>
        <ToolbarButton label={t('bulletList')} icon={<Icon name="list" />} pressed={on('bulletList')} disabled={off} onClick={cmd.bullets} />
        <ToolbarButton label={t('orderedList')} icon={<Icon name="listOrdered" />} pressed={on('orderedList')} disabled={off} onClick={cmd.numbering} />
        <ToolbarButton label={t('taskList')} icon={<Icon name="checklist" />} pressed={on('taskList')} disabled={off} onClick={cmd.tasks} />
        <ToolbarButton label={t('insertTable')} icon={<Icon name="grid" />} disabled={off} onClick={cmd.table} />
      </ToolbarGroup>
      <ToolbarSpacer />
      <ToolbarGroup label="Redrob">
        <ToolbarButton size="lg" label={t('mdSimpleSummarize')} icon={<Icon name="fileText" size={16} />} keepFocus={false} onClick={() => redrob.run(t('aiSummarizePrompt'))} />
        <ToolbarButton size="lg" label={t('mdSimplePolish')} icon={<Icon name="edit" size={16} />} keepFocus={false} disabled={off} onClick={() => redrob.run(t('aiPolishPrompt'))} />
        <ToolbarButton size="lg" label={t('mdSimpleTidy')} icon={<Icon name="layout" size={16} />} keepFocus={false} disabled={off} onClick={() => redrob.run(t('aiTidyPrompt'))} />
      </ToolbarGroup>
    </Toolbar>
  )
}

/** words in the document: CJK characters count one each, other runs by whitespace */
export function countMdWords(text: string): number {
  const cjk = /[\u3040-\u30ff\u3400-\u9fff\uac00-\ud7af]/g
  const count = text.match(cjk)?.length ?? 0
  const rest = text.replace(cjk, ' ').trim()
  return count + (rest ? rest.split(/\s+/).length : 0)
}
