import type { ReactElement } from 'react'
import { Icon, Toolbar, ToolbarButton, ToolbarGroup, ToolbarSpacer, type FrameTool } from '@genoffice/ui'
import { useI18n, type TFunc } from '../i18n/locale'

export interface PdfActions {
  markup: (kind: 'highlight' | 'underline' | 'strikeout') => void
  editText: () => void
  rotateLeft: () => void
  rotateRight: () => void
  toWord: () => void
  print: () => void
  ask: () => void
  run: (prompt: string) => void
}

export function pdfTools(t: TFunc, a: PdfActions, canEdit: boolean): FrameTool[] {
  const off = !canEdit
  return [
    { id: 'ask', label: t('pdfSimpleAsk'), keywords: ['redrob', 'ai'], run: a.ask },
    { id: 'highlight', label: t('highlight'), keywords: ['mark'], run: () => a.markup('highlight'), disabled: off },
    { id: 'underline', label: t('underline'), run: () => a.markup('underline'), disabled: off },
    { id: 'strikeout', label: t('strikeout'), run: () => a.markup('strikeout'), disabled: off },
    { id: 'edit-text', label: t('editText'), run: a.editText, disabled: off },
    { id: 'rotate-left', label: t('rotateLeft'), keywords: ['page'], run: a.rotateLeft, disabled: off },
    { id: 'rotate-right', label: t('rotateRight'), keywords: ['page'], run: a.rotateRight, disabled: off },
    { id: 'to-word', label: t('convertToWord'), keywords: ['convert', 'docx'], run: a.toWord },
    { id: 'print', label: t('print'), run: a.print },
    { id: 'summarize', label: t('aiQuickSummary'), group: 'Redrob', run: () => a.run(t('aiQuickSummaryPrompt')) },
    { id: 'key-points', label: t('pdfSimpleKeyPoints'), group: 'Redrob', run: () => a.run(t('aiQuickKeyPointsPrompt')) },
  ]
}

/**
 * The PDF's simplified toolbar: Ask Redrob, highlight, underline,
 * strikethrough, edit text, rotate, convert to Word, print, then Summarize
 * and Key points. Every other tool is in Classic.
 */
export function SimpleToolbar({
  actions: a,
  canEdit,
  editingText,
}: {
  actions: PdfActions
  canEdit: boolean
  editingText: boolean
}): ReactElement {
  const { t } = useI18n()
  const off = !canEdit
  return (
    // Every button carries its text label (size "lg"): icon-only buttons read as
    // unlabeled glyphs to people who do not know the icon set.
    <Toolbar label={t('pdfSimpleToolbar')} className="pdf-simple-toolbar">
      <ToolbarGroup>
        <ToolbarButton size="lg" label={t('pdfSimpleAsk')} icon={<Icon name="sparkle" size={16} />} keepFocus={false} onClick={a.ask} />
      </ToolbarGroup>
      <ToolbarGroup>
        <ToolbarButton size="lg" label={t('highlight')} icon={<Icon name="edit" size={16} />} disabled={off} onClick={() => a.markup('highlight')} />
        <ToolbarButton size="lg" label={t('underline')} icon={<Icon name="underline" size={16} />} disabled={off} onClick={() => a.markup('underline')} />
        <ToolbarButton size="lg" label={t('strikeout')} icon={<Icon name="strikethrough" size={16} />} disabled={off} onClick={() => a.markup('strikeout')} />
        <ToolbarButton size="lg" label={t('editText')} icon={<Icon name="fileText" size={16} />} pressed={editingText} disabled={off} onClick={a.editText} />
      </ToolbarGroup>
      <ToolbarGroup>
        <ToolbarButton size="lg" label={t('rotateLeft')} icon={<Icon name="undo" size={16} />} disabled={off} onClick={a.rotateLeft} />
        <ToolbarButton size="lg" label={t('rotateRight')} icon={<Icon name="redo" size={16} />} disabled={off} onClick={a.rotateRight} />
        <ToolbarButton size="lg" label={t('convertToWord')} icon={<Icon name="arrowRight" size={16} />} keepFocus={false} onClick={a.toWord} />
        <ToolbarButton size="lg" label={t('print')} icon={<Icon name="layout" size={16} />} keepFocus={false} onClick={a.print} />
      </ToolbarGroup>
      <ToolbarSpacer />
      <ToolbarGroup label="Redrob">
        <ToolbarButton size="lg" label={t('aiQuickSummary')} icon={<Icon name="fileText" size={16} />} keepFocus={false} onClick={() => a.run(t('aiQuickSummaryPrompt'))} />
        <ToolbarButton size="lg" label={t('pdfSimpleKeyPoints')} icon={<Icon name="list" size={16} />} keepFocus={false} onClick={() => a.run(t('aiQuickKeyPointsPrompt'))} />
      </ToolbarGroup>
    </Toolbar>
  )
}
