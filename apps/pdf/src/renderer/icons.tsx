import type { ReactElement, ReactNode } from 'react'
import { kitGlyph } from '@genoffice/ui'

/** Size override for a ribbon glyph (px). */
type GlyphSize = { size?: number | undefined }

// ── ribbon icons (aligned with slides' rb-big visual language) ──

/** Constant painted stroke instead of proportional scaling — same rule as the
 *  slides icons: ~1.5px lines at 20px+, ~1.25px on 13-19px glyphs, ~1.1px below.
 *  stroke-width is in 24-canvas units: units = painted-px × 24 / rendered-px. */
export function pinnedStroke(size: number): number {
  const painted = size >= 20 ? 1.5 : size >= 13 ? 1.25 : 1.1
  return (painted * 24) / size
}

export function Icon({
  size = 24,
  children,
}: {
  size?: number | undefined
  children: ReactNode
}): ReactElement {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={pinnedStroke(size)}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      {children}
    </svg>
  )
}

export const IconThumbs = kitGlyph('IconThumbs', 24)
export const IconHighlight = kitGlyph('IconHighlight', 24)
export const IconUnderline = kitGlyph('IconUnderline', 24)
export const IconStrike = kitGlyph('IconStrike', 24)
export const IconEditText = kitGlyph('IconEditText', 24)
export const IconInk = ({ size }: GlyphSize = {}) => (
  <Icon size={size}>
    <path d="M16.15 4.85 L19.15 7.85 L8.9 18.1 L4.9 19.1 L5.9 15.1 Z" />
    <path d="M14.15 6.85 L17.15 9.85" />
  </Icon>
)
export const IconRect = ({ size }: GlyphSize = {}) => (
  <Icon size={size}>
    <rect x="4.5" y="6.64" width="15" height="10.71" rx="1.07" />
  </Icon>
)
export const IconEllipse = ({ size }: GlyphSize = {}) => (
  <Icon size={size}>
    <ellipse cx="12" cy="12" rx="7.5" ry="5.57" />
  </Icon>
)
export const IconArrow = kitGlyph('IconArrow', 24)
export const IconNote = kitGlyph('IconNote', 24)
export const IconSign = kitGlyph('IconSign', 24)
export const IconPreviousField = ({ size }: GlyphSize = {}) => (
  <Icon size={size}>
    <rect x="6" y="4.5" width="12" height="15" rx="1.5" />
    <path d="M14.5 8 L10.5 12 L14.5 16" />
  </Icon>
)
export const IconNextField = ({ size }: GlyphSize = {}) => (
  <Icon size={size}>
    <rect x="6" y="4.5" width="12" height="15" rx="1.5" />
    <path d="M9.5 8 L13.5 12 L9.5 16" />
  </Icon>
)
export const IconCompleteForm = kitGlyph('IconCompleteForm', 24)
export const IconFormText = ({ size }: GlyphSize = {}) => (
  <Icon size={size}>
    <path d="M5 6 H19 M12 6 V19 M8.5 19 H15.5" />
  </Icon>
)
export const IconFormCheck = kitGlyph('IconFormCheck', 24)
export const IconFormCross = kitGlyph('IconFormCross', 24)
export const IconExportImg = kitGlyph('IconExportImg', 24)
export const IconConvertPdf = ({ size }: GlyphSize = {}) => (
  <Icon size={size}>
    <path d="M5.6 9.6 A 7.1 7.1 0 0 1 18.1 7.7" />
    <path d="M18.4 4.3 L18.4 7.9 L14.8 7.9" />
    <path d="M18.4 14.4 A 7.1 7.1 0 0 1 5.9 16.3" />
    <path d="M5.6 19.7 L5.6 16.1 L9.2 16.1" />
  </Icon>
)
export const IconInsertImage = kitGlyph('IconInsertImage', 24)
export const IconEditImage = ({ size }: GlyphSize = {}) => (
  <Icon size={size}>
    <rect x="4.5" y="6" width="12.5" height="10" rx="1" />
    <circle cx="8.3" cy="9.4" r="1.1" />
    <path d="M4.8 14 L8.3 11.4 L11.5 13.7 L13.8 12" />
    <path d="M14.2 18.9 L19.7 13.4 A1.06 1.06 0 0 0 18.2 11.9 L12.7 17.4 L12.2 19.4 Z" />
  </Icon>
)
export const IconNight = kitGlyph('IconNight', 24)
export const IconSpread = kitGlyph('IconSpread', 24)
export const IconSinglePage = kitGlyph('IconSinglePage', 24)
export const IconWatermark = ({ size }: GlyphSize = {}) => (
  <Icon size={size}>
    <rect x="4.5" y="5.04" width="15" height="13.93" rx="1.07" />
    <path d="M7.71 15.75 L15.75 7.71" />
    <path d="M7.71 11.46 L11.46 7.71 M12.54 15.75 L16.29 12" />
  </Icon>
)
export const IconProps = kitGlyph('IconProps', 24)
export const IconRotateL = ({ size }: GlyphSize = {}) => (
  <Icon size={size}>
    <path d="M8.28 10.3 L4.53 10.3 L4.53 6.55" />
    <path d="M4.75 9.98 A 7.5 7.5 0 1 1 4.53 12.98" />
  </Icon>
)
export const IconRotateR = ({ size }: GlyphSize = {}) => (
  <Icon size={size}>
    <path d="M15.72 10.3 L19.47 10.3 L19.47 6.55" />
    <path d="M19.25 9.98 A 7.5 7.5 0 1 0 19.47 12.98" />
  </Icon>
)
export const IconDeletePage = ({ size }: GlyphSize = {}) => (
  <Icon size={size}>
    <path d="M7.7 4.5 H13.7 L17.2 8 V18.5 A1 1 0 0 1 16.2 19.5 H7.7 A1 1 0 0 1 6.7 18.5 V5.5 A1 1 0 0 1 7.7 4.5 Z" />
    <path d="M13.7 4.5 V8 H17.2" />
    <path d="M9.7 11.75 L14.2 16.25 M14.2 11.75 L9.7 16.25" />
  </Icon>
)
export const IconExtract = ({ size }: GlyphSize = {}) => (
  <Icon size={size}>
    <path d="M7.2 4.5 H13.2 L16.7 8 V11.5" />
    <path d="M6.2 5.5 V18.5 A1 1 0 0 0 7.2 19.5 H11.2" />
    <path d="M14.95 13.5 V19 M12.2 16.5 L14.95 19.25 L17.7 16.5" />
  </Icon>
)
export const IconInsertPdf = kitGlyph('IconInsertPdf', 24)
export const IconInsertBlank = kitGlyph('IconInsertBlank', 24)
export const IconRotateAll = ({ size }: GlyphSize = {}) => (
  <Icon size={size}>
    <rect x="8.5" y="8.5" width="7" height="9" rx="0.8" />
    <path d="M6.2 6.2 A 8.2 8.2 0 0 1 17.8 6.2" />
    <path d="M17.8 3.4 L17.8 6.4 L14.8 6.4" />
    <path d="M17.8 17.8 A 8.2 8.2 0 0 1 6.2 17.8" />
    <path d="M6.2 20.6 L6.2 17.6 L9.2 17.6" />
  </Icon>
)
export const IconReverse = kitGlyph('IconReverse', 24)
export const IconSplitPdf = kitGlyph('IconSplitPdf', 24)
export const IconMergePdf = kitGlyph('IconMergePdf', 24)
export const IconMergePages = ({ size }: GlyphSize = {}) => (
  <Icon size={size}>
    <rect x="5" y="4.5" width="14" height="15" rx="1" />
    <path d="M12 4.5 V19.5 M5 12 H19" />
  </Icon>
)

export const IconReplacePages = ({ size }: GlyphSize = {}) => (
  <Icon size={size}>
    <rect x="4.5" y="7.5" width="9" height="12" rx="1" />
    <rect x="10.5" y="4.5" width="9" height="12" rx="1" strokeDasharray="2.2 1.8" />
  </Icon>
)
export const IconSplitPages = ({ size }: GlyphSize = {}) => (
  <Icon size={size}>
    <rect x="5" y="4.5" width="14" height="15" rx="1" />
    <path d="M12 4.5 V19.5" strokeDasharray="2.2 1.8" />
    <path d="M8.2 12 L5.8 12 M6.6 10.8 L5.4 12 L6.6 13.2 M15.8 12 L18.2 12 M17.4 10.8 L18.6 12 L17.4 13.2" />
  </Icon>
)
export const IconCropPages = kitGlyph('IconCropPages', 24)
export const IconPageSize = ({ size }: GlyphSize = {}) => (
  <Icon size={size}>
    <rect x="4.5" y="4.5" width="15" height="15" rx="1" />
    <rect x="8.5" y="8.5" width="7" height="9" rx="0.8" strokeDasharray="2 1.6" />
  </Icon>
)
export const IconFitWidth = ({ size }: GlyphSize = {}) => (
  <Icon size={size}>
    <path d="M4.5 5.57 L4.5 18.43 M19.5 5.57 L19.5 18.43" />
    <path d="M7.71 12 L16.29 12 M10.07 9.64 L7.71 12 L10.07 14.36 M13.93 9.64 L16.29 12 L13.93 14.36" />
  </Icon>
)
export const IconFitPage = ({ size }: GlyphSize = {}) => (
  <Icon size={size}>
    <rect x="7" y="4.5" width="10" height="15" rx="1" />
    <path d="M12 8 L12 16 M9.8 10.2 L12 8 L14.2 10.2 M9.8 13.8 L12 16 L14.2 13.8" />
  </Icon>
)
export const IconOutline = kitGlyph('IconOutline', 24)
export const IconDrawColor = ({ size }: GlyphSize = {}) => (
  <Icon size={size}>
    <path d="M12 4.5 C14.2 7.3 17.25 9.2 17.25 12.4 C17.25 15.4 14.9 17.5 12 17.5 C9.1 17.5 6.75 15.4 6.75 12.4 C6.75 9.2 9.8 7.3 12 4.5 Z" />
  </Icon>
)
/* dropdown chevron, same glyph as slides' RbCaret */
export const RbCaret = () => (
  <svg className="rb-caret" width="10" height="10" viewBox="0 0 24 24" fill="none" aria-hidden>
    <path
      d="M5.5 9.25 12 15.75l6.5-6.5"
      stroke="currentColor"
      strokeWidth="2.6"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
)
export const IconSearch = kitGlyph('IconSearch', 24)
export const IconPrint = kitGlyph('IconPrint', 24)
/** Design-supplied glyphs on the 1:16 stroke:canvas ratio (24-canvas / 1.5 stroke),
 *  geometry shared with docs/slides/sheets. */
export const IconRatio = ({ size = 16, children }: { size?: number; children: ReactNode }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth={1.5}
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden
  >
    {children}
  </svg>
)
export const IconUndo = kitGlyph('IconUndo', 16)
export const IconRedo = kitGlyph('IconRedo', 16)
export const IconSave = kitGlyph('IconSave', 16)

// ── selection-popup icons (14px; bring-forward / send-backward / trash) ──

export const IconLayerUp = kitGlyph('IconLayerUp', 18)
export const IconLayerDown = kitGlyph('IconLayerDown', 18)
export const IconTrash = kitGlyph('IconTrash', 18)
export const IconRotateCw = ({ size = 18 }: GlyphSize = {}) => (
  <Icon size={size}>
    <path d="M18.5 8.5 A7.5 7.5 0 1 0 19.5 12" />
    <path d="M19 4 V8.5 H14.5" />
  </Icon>
)
export const IconRotateCcw = ({ size = 18 }: GlyphSize = {}) => (
  <Icon size={size}>
    <path d="M5.5 8.5 A7.5 7.5 0 1 1 4.5 12" />
    <path d="M5 4 V8.5 H9.5" />
  </Icon>
)
export const IconSwapImage = kitGlyph('IconSwapImage', 18)
export const IconFlipH = ({ size = 18 }: GlyphSize = {}) => (
  <Icon size={size}>
    <path d="M12 3.5 V20.5" strokeDasharray="2.6 2.2" />
    <path d="M8.5 7 V17 L3.5 17 Z" />
    <path d="M15.5 7 V17 L20.5 17 Z" />
  </Icon>
)
export const IconFlipV = ({ size = 18 }: GlyphSize = {}) => (
  <Icon size={size}>
    <path d="M3.5 12 H20.5" strokeDasharray="2.6 2.2" />
    <path d="M7 8.5 H17 L17 3.5 Z" />
    <path d="M7 15.5 H17 L17 20.5 Z" />
  </Icon>
)
export const IconCrop = kitGlyph('IconCrop', 18)
export const IconCutout = ({ size = 18 }: GlyphSize = {}) => (
  <Icon size={size}>
    <path d="M13.5 6.5 L17.5 10.5 L8 20 H4 V16 Z" />
    <path d="M16 4 L20 8" />
    <path d="M18.5 12.5 L19.4 14.6 L21.5 15.5 L19.4 16.4 L18.5 18.5 L17.6 16.4 L15.5 15.5 L17.6 14.6 Z" />
  </Icon>
)
export const IconOpacity = ({ size = 18 }: GlyphSize = {}) => (
  <Icon size={size}>
    <path d="M12 3.5 C12 3.5 5.5 10 5.5 14.5 A6.5 6.5 0 0 0 18.5 14.5 C18.5 10 12 3.5 12 3.5 Z" />
    <path d="M12 18.2 A3.7 3.7 0 0 1 8.3 14.5" />
  </Icon>
)

/** One-click AI feature glyphs (same 24-canvas/1.5-stroke artwork as the docs ribbon) */
export const IconAiSummarize = () => (
  <svg
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.5"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden
  >
    <path d="M13.875 21H12H6.5C5.39543 21 4.5 20.1046 4.5 19V5C4.5 3.89543 5.39543 3 6.5 3H17.5C18.6046 3 19.5 3.89543 19.5 5V9V12V13" />
    <path d="M8.00001 7H16" />
    <path d="M8.00007 10.2032H14.0001" />
    <path d="M8.00007 13.4062H12.0001" />
    <path
      d="M17 14L17.2579 14.697C17.5961 15.611 17.7652 16.068 18.0986 16.4014C18.432 16.7348 18.889 16.9039 19.803 17.2421L20.5 17.5L19.803 17.7579C18.889 18.0961 18.432 18.2652 18.0986 18.5986C17.7652 18.932 17.5961 19.389 17.2579 20.303L17 21L16.7421 20.303C16.4039 19.389 16.2348 18.932 15.9014 18.5986C15.568 18.2652 15.111 18.0961 14.197 17.7579L13.5 17.5L14.197 17.2421C15.111 16.9039 15.568 16.7348 15.9014 16.4014C16.2348 16.068 16.4039 15.611 16.7421 14.697L17 14Z"
      strokeLinejoin="round"
    />
  </svg>
)
export const IconAiKeyPoints = () => (
  <svg
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.5"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden
  >
    <path d="M4 5H20" />
    <path d="M4 9H16" />
    <path d="M4 13H11" />
    <path d="M4 17H10" />
    <path
      d="M17 14L17.2579 14.697C17.5961 15.611 17.7652 16.068 18.0986 16.4014C18.432 16.7348 18.889 16.9039 19.803 17.2421L20.5 17.5L19.803 17.7579C18.889 18.0961 18.432 18.2652 18.0986 18.5986C17.7652 18.932 17.5961 19.389 17.2579 20.303L17 21L16.7421 20.303C16.4039 19.389 16.2348 18.932 15.9014 18.5986C15.568 18.2652 15.111 18.0961 14.197 17.7579L13.5 17.5L14.197 17.2421C15.111 16.9039 15.568 16.7348 15.9014 16.4014C16.2348 16.068 16.4039 15.611 16.7421 14.697L17 14Z"
      strokeLinejoin="round"
    />
  </svg>
)

// ── password dialog (Lucide eye / eye-off / alert, shared DS field icons) ──

export const IconEye = kitGlyph('IconEye', 16)

export const IconEyeOff = kitGlyph('IconEyeOff', 16)

export const IconAlert = kitGlyph('IconAlert', 13)
