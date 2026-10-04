import type { ReactElement } from 'react'
import iconDocx from '../assets/file-docx.svg'
import iconXlsx from '../assets/file-xlsx.svg'
import iconPptx from '../assets/file-pptx.svg'
import iconPdf from '../assets/file-pdf.svg'
import iconMd from '../assets/file-md.svg'
import iconHwp from '../assets/file-hwp.svg'
import type { StartKind } from './formats'

const ICONS: Record<StartKind, string> = {
  docx: iconDocx,
  xlsx: iconXlsx,
  pptx: iconPptx,
  hwp: iconHwp,
  md: iconMd,
  pdf: iconPdf,
}

/** the format's own icon, decorative: the button beside it carries the name */
export function FormatIcon({ kind, size = 18 }: { kind: StartKind; size?: number }): ReactElement {
  return (
    <span className="home-fmt-icon" aria-hidden="true">
      <img src={ICONS[kind]} width={size} height={size} alt="" />
    </span>
  )
}
