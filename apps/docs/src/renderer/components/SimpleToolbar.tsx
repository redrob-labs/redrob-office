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
import type { Block } from '@genoffice/docx-engine'
import { fontFamiliesFor, isEastAsianFontName } from '../font-list'
import { useI18n, type TFunc } from '../i18n/locale'
import type { RibbonFormatState } from './ribbon-format-state'
import { applyParagraphStyle } from './ribbon-tabs'

/** the font sizes the simplified toolbar offers (Word's common ones) */
export const SIMPLE_FONT_SIZES = [8, 9, 10, 10.5, 11, 12, 14, 16, 18, 20, 24, 28, 36, 48, 72] as const

type StyleKey = 'p' | 'h1' | 'h2' | 'h3'

export interface DocsCommands {
  bold: () => void
  italic: () => void
  underline: () => void
  strike: () => void
  bullets: () => void
  numbering: () => void
  alignLeft: () => void
  alignCenter: () => void
  font: (name: string) => void
  size: (pt: number) => void
  style: (key: StyleKey) => void
}

/** the formatting commands both toolbars and the title bar search run */
export function docsCommands(
  editor: Editor,
  allocateNumId: (kind: 'bullet' | 'ordered') => string | null,
  blocks: readonly Block[],
): DocsCommands {
  const chain = () => editor.chain().focus()
  const numIdOf = (kind: 'bullet' | 'ordered') =>
    blocks.find((b) => b.type === 'listItem' && b.list?.kind === kind)?.list?.numId ??
    allocateNumId(kind)
  const toggleList = (kind: 'bullet' | 'ordered') => {
    if (editor.isActive('docListItem', { kind })) chain().setNode('docParagraph').run()
    else chain().setNode('docListItem', { kind, numId: numIdOf(kind), ilvl: 0 }).run()
  }
  const align = (value: 'left' | 'center') =>
    chain()
      .updateAttributes('docParagraph', { align: value })
      .updateAttributes('docHeading', { align: value })
      .updateAttributes('docListItem', { align: value })
      .run()
  return {
    bold: () => chain().toggleMark('bold').run(),
    italic: () => chain().toggleMark('italic').run(),
    underline: () => chain().toggleMark('underline').run(),
    strike: () => chain().toggleMark('strike').run(),
    bullets: () => toggleList('bullet'),
    numbering: () => toggleList('ordered'),
    alignLeft: () => align('left'),
    alignCenter: () => align('center'),
    // font picks target only their script's slot (Word never flattens the other one)
    font: (name) =>
      chain()
        .setMark('docTextStyle', isEastAsianFontName(name) ? { font: name } : { fontAscii: name })
        .run(),
    size: (pt) => chain().setMark('docTextStyle', { sizeHalfPoints: Math.round(pt * 2) }).run(),
    style: (key) => applyParagraphStyle(editor, key),
  }
}

export interface RedrobActions {
  /** open the panel */
  ask: () => void
  /** run a request in the panel */
  run: (prompt: string) => void
  comment: () => void
}

/** every command, by name, for the title bar search (Alt+Q) */
export function docsTools(t: TFunc, cmd: DocsCommands, redrob: RedrobActions, canEdit: boolean): FrameTool[] {
  const edit = !canEdit
  return [
    { id: 'ask', label: t('appSimpleAsk'), keywords: ['redrob', 'ai'], run: redrob.ask },
    { id: 'summarize', label: t('appSimpleSummarize'), group: 'Redrob', run: () => redrob.run(t('appSimpleSummarizePrompt')) },
    { id: 'risks', label: t('appSimpleCheckRisks'), group: 'Redrob', run: () => redrob.run(t('appSimpleCheckRisksPrompt')) },
    { id: 'polish', label: t('appSimplePolish'), group: 'Redrob', run: () => redrob.run(t('appSimplePolishPrompt')), disabled: edit },
    { id: 'bold', label: t('ribbonBoldTip'), keywords: ['strong'], run: cmd.bold, disabled: edit },
    { id: 'italic', label: t('ribbonItalicTip'), run: cmd.italic, disabled: edit },
    { id: 'underline', label: t('ribbonUnderlineTip'), run: cmd.underline, disabled: edit },
    { id: 'strike', label: t('ribbonStrikethrough'), run: cmd.strike, disabled: edit },
    { id: 'bullets', label: t('ribbonBullets'), keywords: ['list'], run: cmd.bullets, disabled: edit },
    { id: 'numbering', label: t('ribbonNumbering'), keywords: ['list', 'numbers'], run: cmd.numbering, disabled: edit },
    { id: 'align-left', label: t('appScAlignLeft'), run: cmd.alignLeft, disabled: edit },
    { id: 'align-center', label: t('appScAlignCenter'), run: cmd.alignCenter, disabled: edit },
    { id: 'h1', label: t('ribbonStyleHeading1'), keywords: ['title', 'style'], run: () => cmd.style('h1'), disabled: edit },
    { id: 'h2', label: t('ribbonStyleHeading2'), keywords: ['style'], run: () => cmd.style('h2'), disabled: edit },
    { id: 'normal', label: t('ribbonStyleNormal'), keywords: ['style', 'body'], run: () => cmd.style('p'), disabled: edit },
    { id: 'comment', label: t('appNewComment'), run: redrob.comment },
  ]
}

export interface SimpleToolbarProps {
  fs: RibbonFormatState
  cmd: DocsCommands
  redrob: RedrobActions
  canEdit: boolean
  /** the selection is not empty: Polish works on it, otherwise on the whole document */
  hasSelection: boolean
}

const styleKeyOf = (level: number | null): StyleKey =>
  level === 1 ? 'h1' : level === 2 ? 'h2' : level === 3 ? 'h3' : 'p'

/**
 * Docs' simplified toolbar (handoff 02-document-nda): Ask Redrob, font, size,
 * B I U S, lists, alignment, paragraph style, comment, then Summarize, Check
 * risks and Polish. The classic ribbon has everything else.
 */
export function SimpleToolbar({ fs, cmd, redrob, canEdit, hasSelection }: SimpleToolbarProps): ReactElement {
  const { t, lang } = useI18n()
  const off = !canEdit
  const fonts = fontFamiliesFor(lang)
  const fontOptions = (fonts.includes(fs.fontFamily) || !fs.fontFamily ? fonts : [fs.fontFamily, ...fonts]).map(
    (f) => ({ value: f, label: f }),
  )
  const sizeOptions = (
    SIMPLE_FONT_SIZES.includes(fs.fontSizePt as (typeof SIMPLE_FONT_SIZES)[number])
      ? [...SIMPLE_FONT_SIZES]
      : [fs.fontSizePt, ...SIMPLE_FONT_SIZES]
  ).map((s) => ({ value: String(s), label: String(s) }))
  return (
    <Toolbar label={t('appSimpleToolbar')} className="docs-simple-toolbar">
      <ToolbarGroup label={t('appSimpleAsk')}>
        <ToolbarButton
          size="lg"
          label={t('appSimpleAsk')}
          icon={<Icon name="sparkle" size={16} />}
          keepFocus={false}
          onClick={redrob.ask}
        />
      </ToolbarGroup>
      <ToolbarGroup label={t('ribbonGroupFont')}>
        <Dropdown
          className="docs-simple-font"
          ariaLabel={t('ribbonFontFamilyTip')}
          tip={t('ribbonFontFamilyTip')}
          disabled={off}
          value={fs.fontFamily}
          options={fontOptions}
          onPick={cmd.font}
        />
        <Dropdown
          className="docs-simple-size"
          ariaLabel={t('ribbonFontSizeTip')}
          tip={t('ribbonFontSizeTip')}
          disabled={off}
          value={String(fs.fontSizePt)}
          options={sizeOptions}
          onPick={(v) => cmd.size(Number(v))}
        />
        <ToolbarButton label={t('ribbonBoldTip')} icon={<Icon name="bold" />} pressed={fs.bold} disabled={off} onClick={cmd.bold} />
        <ToolbarButton label={t('ribbonItalicTip')} icon={<Icon name="italic" />} pressed={fs.italic} disabled={off} onClick={cmd.italic} />
        <ToolbarButton label={t('ribbonUnderlineTip')} icon={<Icon name="underline" />} pressed={fs.underline} disabled={off} onClick={cmd.underline} />
        <ToolbarButton label={t('ribbonStrikethrough')} icon={<Icon name="strikethrough" />} pressed={fs.strike} disabled={off} onClick={cmd.strike} />
      </ToolbarGroup>
      <ToolbarGroup label={t('ribbonGroupParagraph')}>
        <ToolbarButton label={t('ribbonBullets')} icon={<Icon name="list" />} pressed={fs.listBullet} disabled={off} onClick={cmd.bullets} />
        <ToolbarButton label={t('ribbonNumbering')} icon={<Icon name="listOrdered" />} pressed={fs.listOrdered} disabled={off} onClick={cmd.numbering} />
        <ToolbarButton label={t('appScAlignLeft')} icon={<Icon name="alignLeft" />} pressed={(fs.align ?? 'left') === 'left'} disabled={off} onClick={cmd.alignLeft} />
        <ToolbarButton label={t('appScAlignCenter')} icon={<Icon name="alignCenter" />} pressed={fs.align === 'center'} disabled={off} onClick={cmd.alignCenter} />
        <Dropdown
          className="docs-simple-style"
          ariaLabel={t('appSimpleStyle')}
          tip={t('appSimpleStyle')}
          disabled={off}
          value={styleKeyOf(fs.headingLevel)}
          options={[
            { value: 'p', label: t('ribbonStyleNormal') },
            { value: 'h1', label: t('ribbonStyleHeading1') },
            { value: 'h2', label: t('ribbonStyleHeading2') },
            { value: 'h3', label: t('ribbonStyleHeading3') },
          ]}
          onPick={(v) => cmd.style(v as StyleKey)}
        />
      </ToolbarGroup>
      <ToolbarGroup label={t('appSimpleComment')}>
        <ToolbarButton label={t('appNewComment')} icon={<Icon name="comment" />} disabled={!hasSelection} onClick={redrob.comment} />
      </ToolbarGroup>
      <ToolbarSpacer />
      <ToolbarGroup label="Redrob">
        <ToolbarButton size="lg" label={t('appSimpleSummarize')} icon={<Icon name="fileText" size={16} />} keepFocus={false} onClick={() => redrob.run(t('appSimpleSummarizePrompt'))} />
        <ToolbarButton size="lg" label={t('appSimpleCheckRisks')} icon={<Icon name="flag" size={16} />} keepFocus={false} onClick={() => redrob.run(t('appSimpleCheckRisksPrompt'))} />
        <ToolbarButton
          size="lg"
          label={t('appSimplePolish')}
          icon={<Icon name="edit" size={16} />}
          keepFocus={false}
          disabled={off}
          onClick={() => redrob.run(hasSelection ? t('appSimplePolishPrompt') : t('appSimplePolishAllPrompt'))}
        />
      </ToolbarGroup>
    </Toolbar>
  )
}
