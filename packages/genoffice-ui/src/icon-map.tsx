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
  // pdf
  IconThumbs: 'sidebar',
  IconOutline: 'bookmark',
  IconEditText: 'edit',
  IconNote: 'comment',
  IconSign: 'signature',
  IconArrow: 'arrowUpRight',
  IconExportImg: 'download',
  IconInsertImage: 'image',
  IconInsertPdf: 'filePdf',
  IconInsertBlank: 'filePlus',
  IconSplitPdf: 'split',
  IconMergePdf: 'merge',
  IconCrop: 'crop',
  IconCropPages: 'crop',
  IconNight: 'moon',
  IconProps: 'info',
  IconSpread: 'columns',
  IconSinglePage: 'file',
  IconReverse: 'sort',
  IconTrash: 'trash',
  IconFormCheck: 'check',
  IconFormCross: 'close',
  IconCompleteForm: 'clipboardCheck',
  IconLayerUp: 'chevronsUp',
  IconLayerDown: 'chevronsDown',
  IconSwapImage: 'refresh',
  IconEye: 'eye',
  IconEyeOff: 'eyeOff',
  IconAlert: 'alert',
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
  IconAiSummarize: 'pdf AI summarize mark: a document glyph with the AI spark',
  IconAiKeyPoints: 'pdf AI key-points mark: a list glyph with the AI spark',
  IconInk: 'freehand pen stroke; the kit edit pencil already means "edit text"',
  IconRect: 'rectangle shape tool; no kit shape glyphs',
  IconEllipse: 'ellipse shape tool; no kit shape glyphs',
  IconFormText: 'text box insertion; no kit text-box glyph',
  IconPreviousField: 'form field with a back arrow; no kit form-navigation glyphs',
  IconNextField: 'form field with a forward arrow; no kit form-navigation glyphs',
  IconConvertPdf: 'PDF-to-Office conversion; no kit conversion glyph',
  IconEditImage: 'image with an edit pen; no kit image-edit glyph',
  IconWatermark: 'page with a diagonal stamp; no kit watermark glyph',
  IconRotateL: 'page rotated left; no kit rotate glyphs',
  IconRotateR: 'page rotated right; no kit rotate glyphs',
  IconRotateAll: 'all pages rotated; no kit rotate glyphs',
  IconRotateCw: 'image rotated clockwise; no kit rotate glyphs',
  IconRotateCcw: 'image rotated counter-clockwise; no kit rotate glyphs',
  IconDeletePage: 'page with a cross; the kit trash means "delete selection"',
  IconExtract: 'page lifted out of a stack; no kit extract glyph',
  IconMergePages: 'two pages joined into one sheet; distinct from merging files',
  IconReplacePages: 'page swapped for another; no kit replace glyph',
  IconSplitPages: 'one sheet cut into pages; distinct from splitting files',
  IconPageSize: 'paper size; no kit paper glyph',
  IconFitWidth: 'fit page width; no kit fit glyphs',
  IconFitPage: 'fit whole page; no kit fit glyphs',
  IconDrawColor: 'pen with a colour bar; the bar shows the current colour',
  IconFlipH: 'horizontal mirror; no kit flip glyphs',
  IconFlipV: 'vertical mirror; no kit flip glyphs',
  IconCutout: 'background removal; no kit cut-out glyph',
  IconOpacity: 'opacity checkerboard; no kit opacity glyph',
} as const

export interface KitGlyphProps {
  size?: number
}

/**
 * A legacy-named glyph component drawn with its kit icon. `defaultSize` is the
 * size the legacy component drew at when no size is passed (16 inline, 24 for
 * a tall ribbon button).
 */
export function kitGlyph(
  key: KitIconKey,
  defaultSize = 16,
): (props: KitGlyphProps) => ReactElement {
  const name = KIT_ICON_MAP[key]
  function KitGlyph({ size = defaultSize }: KitGlyphProps): ReactElement {
    return <Icon name={name} size={size} />
  }
  KitGlyph.displayName = key
  return KitGlyph
}
