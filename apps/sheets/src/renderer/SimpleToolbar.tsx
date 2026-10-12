import type { ReactElement } from 'react'
import { Icon, Toolbar, ToolbarButton, ToolbarGroup, ToolbarSpacer, type FrameTool } from '@genoffice/ui'
import { useI18n, type TFunc } from './i18n/locale'
import { LINKED_CELL_STRINGS } from './linked-cells'

export interface SheetsActions {
  /** a ribbon command, the same strings the classic ribbon sends */
  command: (command: string) => void
  ask: () => void
  run: (prompt: string) => void
}

export interface SheetsFormatState {
  bold?: boolean | undefined
  italic?: boolean | undefined
  underline?: boolean | undefined
}

/** the commands the simplified toolbar and the title bar search share, by id */
const COMMANDS = [
  { id: 'bold', label: 'appBold', command: 'bold', icon: 'bold' },
  { id: 'italic', label: 'appItalic', command: 'italic', icon: 'italic' },
  { id: 'underline', label: 'appUnderline', command: 'underline', icon: 'underline' },
  { id: 'align-left', label: 'appAlignLeft', command: 'align:left', icon: 'alignLeft' },
  { id: 'align-center', label: 'appAlignCenter', command: 'align:center', icon: 'alignCenter' },
  { id: 'wrap', label: 'appSimpleWrap', command: 'wrap', icon: 'alignJustify' },
  { id: 'percent', label: 'appPercentTitle', command: 'percent', icon: 'percent' },
  { id: 'sum', label: 'appAutoSum', command: 'autofn:SUM', icon: 'plus' },
  { id: 'sort-asc', label: 'appSimpleSortAsc', command: 'sort:asc', icon: 'arrowUp' },
  { id: 'sort-desc', label: 'appSimpleSortDesc', command: 'sort:desc', icon: 'arrowDown' },
  { id: 'filter', label: 'appFilter', command: 'filter-toggle', icon: 'checklist' },
  { id: 'table', label: 'appFormatAsTable', command: 'format-as-table', icon: 'grid' },
  { id: 'chart', label: 'appSimpleChart', command: 'insert-chart:column', icon: 'columns' },
] as const

const PROMPTS = [
  { id: 'explain', label: 'appSimpleExplain', prompt: 'appSimpleExplainPrompt', icon: 'bookOpen' },
  { id: 'check', label: 'appSimpleCheck', prompt: 'appSimpleCheckPrompt', icon: 'flag' },
  { id: 'summarize', label: 'appSimpleSummarize', prompt: 'appSimpleSummarizePrompt', icon: 'fileText' },
] as const

export function sheetsTools(t: TFunc, a: SheetsActions, canEdit: boolean): FrameTool[] {
  return [
    { id: 'ask', label: t('appSimpleAsk'), keywords: ['redrob', 'ai'], run: a.ask },
    ...COMMANDS.map((c) => ({
      id: c.id,
      label: t(c.label),
      keywords: [c.command],
      run: () => a.command(c.command),
      disabled: !canEdit,
    })),
    {
      id: 'link-cell',
      label: LINKED_CELL_STRINGS.tool,
      keywords: ['linked', 'figure', 'fact', 'source'],
      run: () => a.command('link-cell'),
      disabled: !canEdit,
    },
    ...PROMPTS.map((p) => ({
      id: p.id,
      label: t(p.label),
      group: 'Redrob',
      run: () => a.run(t(p.prompt)),
    })),
  ]
}

/**
 * Sheets' simplified toolbar (handoff 04-sheet-forecast): Ask Redrob, B I U,
 * alignment, wrap, percent, AutoSum, sort, filter, table, a column chart,
 * then Explain, Check formulas and Summarize. Everything else is in Classic.
 */
export function SimpleToolbar({
  actions: a,
  canEdit,
  format,
}: {
  actions: SheetsActions
  canEdit: boolean
  format: SheetsFormatState | null
}): ReactElement {
  const { t } = useI18n()
  const pressed: Record<string, boolean | undefined> = {
    bold: format?.bold,
    italic: format?.italic,
    underline: format?.underline,
  }
  const button = (c: (typeof COMMANDS)[number]) => (
    <ToolbarButton
      key={c.id}
      label={t(c.label)}
      icon={<Icon name={c.icon} />}
      disabled={!canEdit}
      {...(c.id in pressed ? { pressed: !!pressed[c.id] } : {})}
      onClick={() => a.command(c.command)}
    />
  )
  return (
    <Toolbar label={t('appSimpleToolbar')} className="sheets-simple-toolbar">
      <ToolbarGroup>
        <ToolbarButton size="lg" label={t('appSimpleAsk')} icon={<Icon name="sparkle" size={16} />} keepFocus={false} onClick={a.ask} />
      </ToolbarGroup>
      <ToolbarGroup>{COMMANDS.slice(0, 6).map(button)}</ToolbarGroup>
      <ToolbarGroup>{COMMANDS.slice(6, 8).map(button)}</ToolbarGroup>
      <ToolbarGroup>{COMMANDS.slice(8).map(button)}</ToolbarGroup>
      <ToolbarSpacer />
      <ToolbarGroup label="Redrob">
        {PROMPTS.map((p) => (
          <ToolbarButton
            key={p.id}
            size="lg"
            label={t(p.label)}
            icon={<Icon name={p.icon} size={16} />}
            keepFocus={false}
            onClick={() => a.run(t(p.prompt))}
          />
        ))}
      </ToolbarGroup>
    </Toolbar>
  )
}
