/**
 * Set Up Show: the deck-wide slide show settings PowerPoint keeps in
 * ppt/presProps.xml (<p:showPr>). Archive surgery like sections.ts: only the
 * showPr element is rebuilt; its pen colour and extensions, and everything
 * else in the part, pass through untouched. A deck without the part gets one,
 * registered in [Content_Types].xml and presentation.xml.rels.
 */
import type { OpenedPptx } from './index'
import { appendRelationship } from './notes'
import { resolveTarget, type PackageArchive } from './zip'

const XMLDECL = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\r\n'
const NS_A = 'http://schemas.openxmlformats.org/drawingml/2006/main'
const NS_R = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships'
const NS_P = 'http://schemas.openxmlformats.org/presentationml/2006/main'
const PRES_PATH = 'ppt/presentation.xml'
const DEFAULT_PATH = 'ppt/presProps.xml'
const PRES_PROPS_REL = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/presProps'
const PRES_PROPS_CT = 'application/vnd.openxmlformats-officedocument.presentationml.presProps+xml'

/** Which slides the show plays; slide numbers are 1-based, as PowerPoint writes them. */
export type ShowRange =
  | { kind: 'all' }
  | { kind: 'slides'; from: number; to: number }
  /** a named custom show the file defines (kept, not edited here) */
  | { kind: 'custom'; id: string }

export interface ShowSettings {
  /** presented by a speaker (full screen), or browsed at a kiosk (full screen, loops, timings only) */
  type: 'speaker' | 'kiosk'
  /** loop continuously until Esc */
  loop: boolean
  /** advance on saved slide timings when a slide has one */
  useTimings: boolean
  /** play narration recorded on slides */
  showNarration: boolean
  range: ShowRange
}

export const DEFAULT_SHOW_SETTINGS: ShowSettings = {
  type: 'speaker',
  loop: false,
  useTimings: true,
  showNarration: true,
  range: { kind: 'all' },
}

/** the presProps part the presentation points at (normally ppt/presProps.xml) */
export function presPropsPath(archive: PackageArchive): string | null {
  for (const rel of archive.readRels(PRES_PATH).values()) {
    if (rel.type === PRES_PROPS_REL) return resolveTarget(PRES_PATH, rel.target)
  }
  return archive.entries.has(DEFAULT_PATH) ? DEFAULT_PATH : null
}

const attr = (tag: string, name: string): string | null => {
  const m = new RegExp(`\\b${name}="([^"]*)"`).exec(tag)
  return m ? m[1]! : null
}
const bool = (v: string | null, dflt: boolean) => (v === null ? dflt : v === '1' || v === 'true')

/** The show settings a presProps part holds (PowerPoint's defaults for anything absent). */
export function parseShowSettings(xml: string | null | undefined): ShowSettings {
  const show = xml ? /<p:showPr\b([^>]*?)(\/>|>([\s\S]*?)<\/p:showPr>)/.exec(xml) : null
  if (!show) return { ...DEFAULT_SHOW_SETTINGS, range: { kind: 'all' } }
  const attrs = show[1] ?? ''
  const body = show[3] ?? ''
  const kiosk = /<p:kiosk\b/.test(body)
  let range: ShowRange = { kind: 'all' }
  const rg = /<p:sldRg\b[^>]*>/.exec(body)
  const cust = /<p:custShow\b[^>]*>/.exec(body)
  if (rg) {
    const from = Number(attr(rg[0], 'st'))
    const to = Number(attr(rg[0], 'end'))
    if (Number.isInteger(from) && Number.isInteger(to) && from >= 1 && to >= from) range = { kind: 'slides', from, to }
  } else if (cust) {
    const id = attr(cust[0], 'id')
    if (id && /^\d+$/.test(id)) range = { kind: 'custom', id }
  }
  return {
    type: kiosk ? 'kiosk' : 'speaker',
    // a kiosk always loops (PowerPoint greys the box out and treats it as on)
    loop: kiosk || bool(attr(attrs, 'loop'), false),
    useTimings: bool(attr(attrs, 'useTimings'), true),
    showNarration: bool(attr(attrs, 'showNarration'), true),
    range,
  }
}

export function getShowSettings(opened: OpenedPptx): ShowSettings {
  const path = presPropsPath(opened.archive)
  return parseShowSettings(path ? opened.archive.readText(path) : null)
}

/** Settings that make sense together: a kiosk loops and runs on timings; a range lies inside the deck. */
export function normalizeShowSettings(s: ShowSettings, slideCount: number): ShowSettings {
  const kiosk = s.type === 'kiosk'
  let range: ShowRange = s.range
  if (range.kind === 'slides') {
    const last = Math.max(1, slideCount)
    const from = Math.min(Math.max(1, Math.floor(range.from)), last)
    const to = Math.min(Math.max(from, Math.floor(range.to)), last)
    range = from === 1 && to === last ? { kind: 'all' } : { kind: 'slides', from, to }
  } else if (range.kind === 'custom' && !/^\d+$/.test(range.id)) {
    range = { kind: 'all' }
  }
  return {
    type: kiosk ? 'kiosk' : 'speaker',
    loop: kiosk || !!s.loop,
    useTimings: kiosk || !!s.useTimings,
    showNarration: !!s.showNarration,
    range,
  }
}

/** The <p:showPr> for these settings, keeping the old element's pen colour and extensions. */
export function showPrXml(s: ShowSettings, previous?: string): string {
  const keep = previous ? [/<p:penClr>[\s\S]*?<\/p:penClr>/, /<p:extLst>[\s\S]*?<\/p:extLst>/].map((re) => re.exec(previous)?.[0] ?? '') : ['', '']
  const attrs = [
    s.loop ? ' loop="1"' : '',
    s.showNarration ? ' showNarration="1"' : ' showNarration="0"',
    s.useTimings ? '' : ' useTimings="0"',
  ].join('')
  const type = s.type === 'kiosk' ? '<p:kiosk/>' : '<p:present/>'
  const range =
    s.range.kind === 'slides'
      ? `<p:sldRg st="${s.range.from}" end="${s.range.to}"/>`
      : s.range.kind === 'custom'
        ? `<p:custShow id="${s.range.id}"/>`
        : '<p:sldAll/>'
  return `<p:showPr${attrs}>${type}${range}${keep[0]}${keep[1]}</p:showPr>`
}

/** A presProps part with this showPr in schema order (htmlPubPr, webPr, prnPr, showPr, clrMru, extLst). */
export function withShowPr(xml: string | null | undefined, s: ShowSettings): string {
  if (!xml) {
    return (
      XMLDECL +
      `<p:presentationPr xmlns:a="${NS_A}" xmlns:r="${NS_R}" xmlns:p="${NS_P}">${showPrXml(s)}</p:presentationPr>`
    )
  }
  const old = /<p:showPr\b[^>]*?(\/>|>[\s\S]*?<\/p:showPr>)/.exec(xml)
  if (old) return xml.slice(0, old.index) + showPrXml(s, old[0]) + xml.slice(old.index + old[0].length)
  const next = showPrXml(s)
  // before the first element that follows showPr in the sequence
  const after = /<p:(clrMru|extLst)\b/.exec(xml)
  if (after) return xml.slice(0, after.index) + next + xml.slice(after.index)
  if (/<p:presentationPr\b[^>]*\/>/.test(xml)) return xml.replace(/<p:presentationPr\b([^>]*)\/>/, `<p:presentationPr$1>${next}</p:presentationPr>`)
  return xml.replace('</p:presentationPr>', `${next}</p:presentationPr>`)
}

/** Write Set Up Show into the deck; returns what was written (normalized). */
export function setShowSettings(opened: OpenedPptx, settings: ShowSettings): ShowSettings {
  const { archive } = opened
  const s = normalizeShowSettings(settings, opened.deck.slides.length)
  let path = presPropsPath(archive)
  if (!path) {
    path = DEFAULT_PATH
    const ctPath = '[Content_Types].xml'
    const ct = archive.readText(ctPath)
    if (ct && !ct.includes(`PartName="/${path}"`)) {
      archive.entries.set(ctPath, Buffer.from(ct.replace('</Types>', `<Override PartName="/${path}" ContentType="${PRES_PROPS_CT}"/></Types>`), 'utf8'))
    }
    if (![...archive.readRels(PRES_PATH).values()].some((r) => r.type === PRES_PROPS_REL)) {
      appendRelationship(archive, PRES_PATH, PRES_PROPS_REL, 'presProps.xml')
    }
  }
  archive.entries.set(path, Buffer.from(withShowPr(archive.readText(path), s), 'utf8'))
  return s
}

/**
 * The slides a show plays, as 0-based deck indexes: the range (or custom
 * show) first, then hidden slides skipped.
 */
export function showSlideIndexes(s: ShowSettings, slideCount: number): number[] {
  if (s.range.kind === 'slides') {
    const from = Math.max(1, s.range.from)
    const to = Math.min(slideCount, s.range.to)
    return Array.from({ length: Math.max(0, to - from + 1) }, (_, i) => from - 1 + i)
  }
  return Array.from({ length: slideCount }, (_, i) => i)
}
