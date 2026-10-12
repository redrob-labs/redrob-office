import type { ReactElement } from 'react'
import { Icon, Toolbar, ToolbarButton, ToolbarGroup, ToolbarSpacer, type FrameTool } from '@genoffice/ui'
import { useI18n, type TFunc } from '../i18n/locale'
import type { FormatCmd } from './ribbon-shared'

export interface SlidesActions {
  addSlide: () => void
  textbox: () => void
  picture: () => void
  /** text formatting applies only while a text box is being edited */
  format: (cmd: FormatCmd) => void
  present: () => void
  ask: () => void
  run: (prompt: string) => void
}

export function slidesTools(t: TFunc, a: SlidesActions, s: { hasDoc: boolean; editingText: boolean }): FrameTool[] {
  const noDoc = !s.hasDoc
  const noText = !s.editingText
  return [
    { id: 'ask', label: t('appSimpleAsk'), keywords: ['redrob', 'ai'], run: a.ask },
    { id: 'new-slide', label: t('ribbonNewSlide'), keywords: ['add'], run: a.addSlide, disabled: noDoc },
    { id: 'textbox', label: t('ribbonInsertTextBoxTip'), keywords: ['text'], run: a.textbox, disabled: noDoc },
    { id: 'picture', label: t('ribbonPicture'), keywords: ['image', 'photo'], run: a.picture, disabled: noDoc },
    { id: 'bold', label: t('ribbonBold'), run: () => a.format('bold'), disabled: noText },
    { id: 'italic', label: t('ribbonItalic'), run: () => a.format('italic'), disabled: noText },
    { id: 'underline', label: t('ribbonUnderline'), run: () => a.format('underline'), disabled: noText },
    { id: 'present', label: t('ribbonFromBeginning'), keywords: ['slideshow', 'present', 'play'], run: a.present, disabled: noDoc },
    { id: 'check', label: t('appSimpleCheck'), group: 'Redrob', keywords: ['fact'], run: () => a.run(t('aiFactCheckPrompt')), disabled: noDoc },
    { id: 'tighten', label: t('appSimpleTighten'), group: 'Redrob', run: () => a.run(t('appSimpleTightenPrompt')), disabled: noDoc },
    { id: 'notes', label: t('appSimpleNotes'), group: 'Redrob', run: () => a.run(t('appSimpleNotesPrompt')), disabled: noDoc },
  ]
}

/**
 * Slides' simplified toolbar (handoff 05-deck): Ask Redrob, New slide, text
 * box, picture, B I U (while editing text), Present, then Check the figures,
 * Tighten and Speaker notes.
 */
export function SimpleToolbar({
  actions: a,
  hasDoc,
  editingText,
}: {
  actions: SlidesActions
  hasDoc: boolean
  editingText: boolean
}): ReactElement {
  const { t } = useI18n()
  const noDoc = !hasDoc
  const noText = !editingText
  return (
    <Toolbar label={t('appSimpleToolbar')} className="slides-simple-toolbar">
      <ToolbarGroup>
        <ToolbarButton size="lg" label={t('appSimpleAsk')} icon={<Icon name="sparkle" size={16} />} keepFocus={false} onClick={a.ask} />
      </ToolbarGroup>
      <ToolbarGroup>
        <ToolbarButton size="lg" label={t('ribbonNewSlide')} icon={<Icon name="plus" size={16} />} disabled={noDoc} keepFocus={false} onClick={a.addSlide} />
        <ToolbarButton label={t('ribbonInsertTextBoxTip')} icon={<Icon name="fileText" />} disabled={noDoc} keepFocus={false} onClick={a.textbox} />
        <ToolbarButton label={t('ribbonPictureTip')} icon={<Icon name="image" />} disabled={noDoc} keepFocus={false} onClick={a.picture} />
      </ToolbarGroup>
      <ToolbarGroup>
        <ToolbarButton label={t('ribbonBold')} icon={<Icon name="bold" />} disabled={noText} onClick={() => a.format('bold')} />
        <ToolbarButton label={t('ribbonItalic')} icon={<Icon name="italic" />} disabled={noText} onClick={() => a.format('italic')} />
        <ToolbarButton label={t('ribbonUnderline')} icon={<Icon name="underline" />} disabled={noText} onClick={() => a.format('underline')} />
      </ToolbarGroup>
      <ToolbarGroup>
        <ToolbarButton size="lg" label={t('appSimplePlay')} icon={<Icon name="play" size={16} />} disabled={noDoc} keepFocus={false} onClick={a.present} />
      </ToolbarGroup>
      <ToolbarSpacer />
      <ToolbarGroup label="Redrob">
        <ToolbarButton size="lg" label={t('appSimpleCheck')} icon={<Icon name="flag" size={16} />} disabled={noDoc} keepFocus={false} onClick={() => a.run(t('aiFactCheckPrompt'))} />
        <ToolbarButton size="lg" label={t('appSimpleTighten')} icon={<Icon name="edit" size={16} />} disabled={noDoc} keepFocus={false} onClick={() => a.run(t('appSimpleTightenPrompt'))} />
        <ToolbarButton size="lg" label={t('appSimpleNotes')} icon={<Icon name="comment" size={16} />} disabled={noDoc} keepFocus={false} onClick={() => a.run(t('appSimpleNotesPrompt'))} />
      </ToolbarGroup>
    </Toolbar>
  )
}
