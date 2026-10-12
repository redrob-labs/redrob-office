/**
 * Ribbon icons the design system has no counterpart for, drawn as 16 px line
 * art in the kit's style (1.5 px strokes, round caps, currentColor), so they
 * follow the theme and render on every machine.
 *
 * Unicode symbols were used here before; most are missing from the chrome
 * fonts, so ✂, ⬚, ⤓, ▔ and the like drew as blank buttons. A command with a
 * kit icon uses that instead (see HangulRibbon.tsx).
 */
import type { ReactElement, ReactNode } from 'react'

function Svg({ size = 16, children }: { size?: number; children: ReactNode }): ReactElement {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {children}
    </svg>
  )
}

export const RibbonIcon = {
  cut: (s?: number) => (
    <Svg size={s}>
      <circle cx="4.5" cy="11.5" r="2" />
      <circle cx="11.5" cy="11.5" r="2" />
      <path d="M6 10 12 2.5M10 10 4 2.5" />
    </Svg>
  ),
  selectAll: (s?: number) => (
    <Svg size={s}>
      <path d="M2.5 5V2.5H5M11 2.5h2.5V5M13.5 11v2.5H11M5 13.5H2.5V11" />
      <path d="M5.5 6h5M5.5 8h5M5.5 10h3" />
    </Svg>
  ),
  pageBreak: (s?: number) => (
    <Svg size={s}>
      <path d="M3.5 2v3.5h9V2M3.5 14v-3.5h9V14" />
      <path d="M1.5 8h2M6 8h1.5M10.5 8h1.5M14.5 8h-2" />
    </Svg>
  ),
  columnBreak: (s?: number) => (
    <Svg size={s}>
      <path d="M2 3h4.5M2 6h4.5M2 9h4.5M2 12h3M9.5 3H14M9.5 6H14" />
      <path d="M8 1.5v1.5M8 5.5v1.5M8 9.5v1.5M8 13.5V15" />
    </Svg>
  ),
  field: (s?: number) => (
    <Svg size={s}>
      <rect x="1.5" y="4" width="13" height="8" rx="1.5" />
      <path d="M4.5 6.5v3" />
    </Svg>
  ),
  fieldRemove: (s?: number) => (
    <Svg size={s}>
      <rect x="1.5" y="4" width="9" height="8" rx="1.5" />
      <path d="M12 6l3 3M15 6l-3 3" />
    </Svg>
  ),
  rectangle: (s?: number) => (
    <Svg size={s}>
      <rect x="2" y="3.5" width="12" height="9" rx="0.5" />
    </Svg>
  ),
  ellipse: (s?: number) => (
    <Svg size={s}>
      <ellipse cx="8" cy="8" rx="6" ry="4.5" />
    </Svg>
  ),
  line: (s?: number) => (
    <Svg size={s}>
      <path d="M2.5 13.5 13.5 2.5" />
    </Svg>
  ),
  textBox: (s?: number) => (
    <Svg size={s}>
      <rect x="1.5" y="2.5" width="13" height="11" rx="1" />
      <path d="M5 5.5h6M8 5.5v5.5" />
    </Svg>
  ),
  footnote: (s?: number) => (
    <Svg size={s}>
      <path d="M2 3h8M2 6h8M2 13h5" />
      <path d="M2 10.5h12" strokeWidth={1} />
      <path d="M12 2v4" />
    </Svg>
  ),
  endnote: (s?: number) => (
    <Svg size={s}>
      <path d="M2 3h8M2 6h8" />
      <path d="M2 9h12" strokeWidth={1} />
      <path d="M2 12h5M2 14.5h3M12 1.5v4" />
    </Svg>
  ),
  header: (s?: number) => (
    <Svg size={s}>
      <rect x="2.5" y="1.5" width="11" height="13" rx="1" />
      <path d="M2.5 5h11" />
      <path d="M5 3.3h3" strokeWidth={1.2} />
    </Svg>
  ),
  footer: (s?: number) => (
    <Svg size={s}>
      <rect x="2.5" y="1.5" width="11" height="13" rx="1" />
      <path d="M2.5 11h11" />
      <path d="M5 12.8h3" strokeWidth={1.2} />
    </Svg>
  ),
  fitWidth: (s?: number) => (
    <Svg size={s}>
      <path d="M1.5 8h13M4 5.5 1.5 8 4 10.5M12 5.5l2.5 2.5-2.5 2.5" />
    </Svg>
  ),
  fitPage: (s?: number) => (
    <Svg size={s}>
      <rect x="4" y="1.5" width="8" height="13" rx="1" />
      <path d="M6 5h4M6 7.5h4M6 10h2.5" />
    </Svg>
  ),
  rowAbove: (s?: number) => (
    <Svg size={s}>
      <rect x="1.5" y="8" width="13" height="6" rx="1" />
      <path d="M1.5 11h13M8 1.5V6M5.8 3.7 8 1.5l2.2 2.2" />
    </Svg>
  ),
  rowBelow: (s?: number) => (
    <Svg size={s}>
      <rect x="1.5" y="2" width="13" height="6" rx="1" />
      <path d="M1.5 5h13M8 14.5V10M5.8 12.3 8 14.5l2.2-2.2" />
    </Svg>
  ),
  colLeft: (s?: number) => (
    <Svg size={s}>
      <rect x="8" y="1.5" width="6" height="13" rx="1" />
      <path d="M11 1.5v13M1.5 8H6M3.7 5.8 1.5 8l2.2 2.2" />
    </Svg>
  ),
  colRight: (s?: number) => (
    <Svg size={s}>
      <rect x="2" y="1.5" width="6" height="13" rx="1" />
      <path d="M5 1.5v13M14.5 8H10M12.3 5.8 14.5 8l-2.2 2.2" />
    </Svg>
  ),
  deleteRow: (s?: number) => (
    <Svg size={s}>
      <rect x="1.5" y="5" width="13" height="6" rx="1" />
      <path d="M6 7l4 2M10 7 6 9" strokeWidth={1.2} />
    </Svg>
  ),
  deleteCol: (s?: number) => (
    <Svg size={s}>
      <rect x="5" y="1.5" width="6" height="13" rx="1" />
      <path d="M7 6l2 4M9 6l-2 4" strokeWidth={1.2} />
    </Svg>
  ),
  cellProps: (s?: number) => (
    <Svg size={s}>
      <rect x="1.5" y="1.5" width="13" height="13" rx="1" />
      <path d="M1.5 6h13M1.5 10.5h13M6 1.5v13M10.5 1.5v13" strokeWidth={1.1} />
    </Svg>
  ),
  forward: (s?: number) => (
    <Svg size={s}>
      <rect x="5.5" y="5.5" width="9" height="9" rx="1" />
      <path d="M1.5 10V2.5a1 1 0 0 1 1-1H10" strokeDasharray="1.5 1.5" />
    </Svg>
  ),
  backward: (s?: number) => (
    <Svg size={s}>
      <rect x="1.5" y="1.5" width="9" height="9" rx="1" />
      <path d="M14.5 6v7.5a1 1 0 0 1-1 1H6" strokeDasharray="1.5 1.5" />
    </Svg>
  ),
  equation: (s?: number) => (
    <Svg size={s}>
      <path d="M12 3H4l4.5 5L4 13h8" />
    </Svg>
  ),
} as const
