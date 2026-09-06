import { useId } from 'react'
import type { ReactNode } from 'react'

export interface IconProps {
  size?: number
}

function Svg({ size = 16, children }: IconProps & { children: ReactNode }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.2"
      strokeLinecap="round"
      aria-hidden
    >
      {children}
    </svg>
  )
}

export function IconSend(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M2.2 8 13.8 2.6 11 13.4 7.6 9.6z" strokeLinejoin="round" />
      <path d="M7.6 9.6 13.8 2.6" />
    </Svg>
  )
}

export function IconStop(props: IconProps) {
  return (
    <Svg {...props}>
      <rect x="4" y="4" width="8" height="8" rx="1.5" fill="currentColor" stroke="none" />
    </Svg>
  )
}

/** return/enter arrow (↵) for the icon-only send button */
export function IconEnter(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M13 3.5v4a2.5 2.5 0 0 1-2.5 2.5H3.5" />
      <path d="M6.5 7 3.5 10l3 3" />
    </Svg>
  )
}


/**
 * The official Redrob brand mark, shared across every editor's AI panel and
 * ribbon so the identity is one canonical component, not five copied paths.
 *
 * Geometry + gradient stops are the same definition as
 * office/scripts/render-icons.mjs and office/src/renderer/public/logo.svg (the
 * source of the app icon and favicon), so the in-app mark cannot drift from the
 * packaged icon. It is the full-color gradient mark on a rounded tile (white by
 * default) rather than a flat monochrome glyph, so it reads as the brand at the
 * small sizes used in toolbars.
 *
 * The linearGradient id is made unique per instance with useId: multiple marks
 * on one page would otherwise share a fixed id and all sample the first
 * instance's gradient.
 */
export function RedrobMark({ size = 18, tile = 'light' }: IconProps & { tile?: 'light' | 'dark' }) {
  const gid = useId()
  const tileFill = tile === 'dark' ? '#000921' : '#FFFFFF'
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 20 20"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden
    >
      <defs>
        <linearGradient id={gid} x1="0" y1="0" x2="1" y2="1" gradientUnits="objectBoundingBox">
          <stop offset="0%" stopColor="#3E7BFF" />
          <stop offset="55%" stopColor="#2B58F0" />
          <stop offset="100%" stopColor="#101C63" />
        </linearGradient>
      </defs>
      <rect width="20" height="20" rx="4" fill={tileFill} />
      <g transform="translate(10 10) scale(0.62) translate(-10 -10)">
        <path
          d="M19.4887 7.59543V3.9548L16.5942 2.90175L9.99436 0.5L7.09706 1.55446L0.5 3.9548V7.59543L2.09788 8.17686L7.09565 9.99577V6.35795L9.99295 5.30349L11.4346 4.77837L12.8762 4.25326V9.99999V15.7411L9.99295 14.6909V14.6866V14.6895L7.09565 13.635V10.0028L2.10773 11.8189L0.5 12.4046V16.0452L9.99436 19.5L19.4887 16.0452V12.4046L17.881 11.8189L12.879 9.99858L17.8908 8.17404L19.4901 7.59261L19.4887 7.59543Z"
          fill={`url(#${gid})`}
        />
      </g>
    </svg>
  )
}
