import type { ReactElement } from 'react'
import type { IconName } from '@redrob-labs/ui'
import { Icon } from './Icon'

/**
 * The editors' toolbar glyphs, by their legacy component names, mapped to the
 * Redrob icon that replaces each one. The editors' own icon modules build
 * their components from this table, so a glyph changes suite-wide in one place.
 *
 * Glyphs with no kit counterpart are listed in KIT_ICON_FALLBACKS with the
 * reason, and stay drawn by the app until the kit gains one.
 */
export const KIT_ICON_MAP = {
  IconSave: 'save',
  IconUndo: 'undo',
  IconRedo: 'redo',
  IconCopy: 'copy',
  IconCaret: 'chevronDown',
  IconBold: 'bold',
  IconItalic: 'italic',
  IconUnderline: 'underline',
  IconStrike: 'strikethrough',
  IconInlineCode: 'code',
  IconLink: 'link',
  IconBullets: 'list',
  IconNumbered: 'listOrdered',
  IconTaskList: 'checklist',
  IconIndentInc: 'indent',
  IconIndentDec: 'outdent',
  IconAlignLeft: 'alignLeft',
  IconAlignCenter: 'alignCenter',
  IconAlignRight: 'alignRight',
  IconAlignJustify: 'alignJustify',
  IconTable: 'grid',
  IconPicture: 'image',
  IconHr: 'minus',
  IconProperties: 'sliders',
  IconSearch: 'search',
  IconPrint: 'print',
  IconComment: 'comment',
  IconHighlight: 'highlight',
  IconZoomIn: 'zoomIn',
  IconZoomOut: 'zoomOut',
} as const satisfies Record<string, IconName>

export type KitIconKey = keyof typeof KIT_ICON_MAP

/**
 * Toolbar glyphs the kit has no icon for. They remain app-drawn on the same
 * grid and stroke; each line says why no kit glyph fits.
 */
export const KIT_ICON_FALLBACKS = {
  IconQuoteMark: 'blockquote bar + lines; the kit has no quotation glyph',
  IconHeaderRow: 'table with a filled header row; the kit grid has no header state',
  IconRowInsertAbove: 'table row with a plus above; no kit table-structure glyphs',
  IconRowInsertBelow: 'table row with a plus below; no kit table-structure glyphs',
  IconColInsertLeft: 'table column with a plus to the left; no kit table-structure glyphs',
  IconColInsertRight: 'table column with a plus to the right; no kit table-structure glyphs',
  IconRowDelete: 'table row struck out; no kit table-structure glyphs',
  IconColDelete: 'table column struck out; no kit table-structure glyphs',
  IconTableDelete: 'table with a cross; no kit table-structure glyphs',
  AiFeatureIcon: 'the AI summarize / polish / tidy marks pair a document glyph with the AI spark',
} as const

export interface KitGlyphProps {
  size?: number
}

/** A legacy-named glyph component drawn with its kit icon. */
export function kitGlyph(key: KitIconKey): (props: KitGlyphProps) => ReactElement {
  const name = KIT_ICON_MAP[key]
  function KitGlyph({ size = 16 }: KitGlyphProps): ReactElement {
    return <Icon name={name} size={size} />
  }
  KitGlyph.displayName = key
  return KitGlyph
}
