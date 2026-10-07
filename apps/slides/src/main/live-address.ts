/**
 * Live Slides addresses a text box by ids that every copy of the file agrees
 * on: the slide part ("s_3" for ppt/slides/slide3.xml) and the shape's own
 * <p:cNvPr id> ("e_12"), with a group child written "e_4>e_12". Parse-time
 * element ids differ between windows, and the creationId form can change
 * mid-session when a save mints one, so neither is used. The cNvPr form stays
 * an alias the op layer resolves (matchesElementRef / resolveGroupChildId).
 */
import { elementCNvPrId, matchesElementRef, slideDurableId, type Slide, type SlideElement } from '@genoffice/pptx-engine'

export interface LiveTextAddress {
  slideId: string
  shapeId: string
}

export interface ResolvedLiveText {
  slideIndex: number
  /** the op target: the shape's (or group child's) cNvPr ref */
  el: string
  /** the group's cNvPr ref when the shape sits in a group */
  group?: string
}

const REF = /^e_\d{1,10}$/
const SLIDE = /^s_[A-Za-z0-9_]{1,200}$/

function childrenOf(el: SlideElement | undefined): SlideElement[] {
  return (el as { children?: SlideElement[] } | undefined)?.children ?? []
}

export function liveTextAddress(
  slides: readonly Slide[],
  slideIndex: number,
  sourceId: string,
  groupId?: string,
): LiveTextAddress | null {
  const slide = slides[slideIndex]
  if (!slide) return null
  const slideId = slideDurableId(slide)
  if (groupId) {
    const grp = slide.elements.find((e) => e.type === 'group' && matchesElementRef(e, groupId))
    const child = childrenOf(grp).find((c) => c.id === sourceId || matchesElementRef(c, sourceId))
    const g = grp ? elementCNvPrId(grp) : null
    const c = child ? elementCNvPrId(child) : null
    return g && c ? { slideId, shapeId: `${g}>${c}` } : null
  }
  const el = slide.elements.find((e) => matchesElementRef(e, sourceId))
  const ref = el ? elementCNvPrId(el) : null
  return ref ? { slideId, shapeId: ref } : null
}

/** Where someone else's text box is in this copy; null when this copy does not have it. */
export function resolveLiveText(slides: readonly Slide[], address: LiveTextAddress): ResolvedLiveText | null {
  if (!SLIDE.test(address.slideId)) return null
  const parts = address.shapeId.split('>')
  if (parts.length > 2 || !parts.every((p) => REF.test(p))) return null
  const slideIndex = slides.findIndex((s) => slideDurableId(s) === address.slideId)
  if (slideIndex < 0) return null
  const slide = slides[slideIndex]!
  if (parts.length === 2) {
    const [g, c] = parts as [string, string]
    const grp = slide.elements.find((e) => e.type === 'group' && elementCNvPrId(e) === g)
    if (!grp || !childrenOf(grp).some((ch) => elementCNvPrId(ch) === c)) return null
    return { slideIndex, el: c, group: g }
  }
  const el = slide.elements.find((e) => elementCNvPrId(e) === parts[0])
  if (!el || (el.type !== 'text' && el.type !== 'shape')) return null
  return { slideIndex, el: parts[0]! }
}

/** Another person's paragraphs are untrusted: an array of plain objects, of a sane size. */
export function cleanLiveParagraphs(raw: unknown): unknown[] | null {
  if (!Array.isArray(raw) || raw.length > 5000) return null
  if (!raw.every((p) => typeof p === 'object' && p !== null && !Array.isArray(p))) return null
  return raw
}
