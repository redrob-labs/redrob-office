// Fonts on this machine (spec task 1.3, E8; R2.4 and R2.5).
//
// The core lays text out with its own metrics and paints it with a font chain
// per run: the face the document asks for, then fallbacks, then a generic
// family. The browser draws with the first face in that chain it has. When the
// asked-for face is missing, the page is drawn with another face, so it cannot
// match 한글 and must not claim to.
//
// This module answers, for the open document:
//   - which faces it uses that this machine cannot draw, and what draws them
//     instead (`missing()`);
//   - whether a given page is drawn only with the faces it asks for (`page()`).
// A host font provider can fill a gap before that: given a face name it may
// return font bytes (the app looks in the folders 한컴오피스 keeps its own
// fonts in). Those are loaded as a FontFace and count as available.
import type { HwpCoreDocument } from '@genoffice/hwp-core'
// Korean face names and the other name the same face is known by, from the
// engine's measured table (engines/rhwp/src/serializer/doc_info.rs,
// FONT_DEFAULT_NAMES). An OS may list a face under either.
import aliasPairs from './font-aliases.json'

const ALIASES = new Map<string, string[]>()
for (const [a, b] of aliasPairs as [string, string][]) {
  ALIASES.set(a, [...(ALIASES.get(a) ?? []), b])
  ALIASES.set(b, [...(ALIASES.get(b) ?? []), a])
}
/** The names a face is known by, its own first. */
export function fontNames(face: string): string[] {
  return [face, ...(ALIASES.get(face) ?? [])]
}

/** Whether this machine can draw a face (installed, or provided). */
export type FontCheck = (face: string) => boolean
/** Bytes for a face this machine lacks, or null. */
export type FontProvider = (face: string) => Promise<Uint8Array | null>

export interface MissingFont {
  face: string
  /** the face that draws it instead, or null when only a generic family is left */
  paintedWith: string | null
}

export interface PageFonts {
  page: number
  /** faces this page asks for */
  faces: string[]
  missing: MissingFont[]
  /** false when any face on the page is drawn with another */
  faithful: boolean
}

const GENERIC = new Set(['serif', 'sans-serif', 'monospace', 'cursive', 'fantasy', 'system-ui'])
// Hangul, hanja and Latin, so a face that covers only one script still measures differently.
const SAMPLE = '한글漢字永Wmg10'

/**
 * Availability by measuring. `document.fonts.check` is no use: Chromium answers
 * true for any family. A family the browser cannot resolve takes the generic
 * fallback's exact metrics.
 */
export function measureFontCheck(): FontCheck {
  const cache = new Map<string, boolean>()
  let cx: CanvasRenderingContext2D | null | undefined
  return (face) => {
    const hit = cache.get(face)
    if (hit !== undefined) return hit
    if (cx === undefined) {
      try {
        cx = document.createElement('canvas').getContext('2d')
      } catch {
        cx = null
      }
    }
    if (!cx) return true // cannot tell; claim nothing either way
    const c = cx
    const q = `"${face.replace(/"/g, '')}"`
    const width = (stack: string) => {
      c.font = `16px ${stack}`
      return c.measureText(SAMPLE).width
    }
    const ok = width(`${q}, monospace`) !== width('monospace') || width(`${q}, serif`) !== width('serif')
    cache.set(face, ok)
    return ok
  }
}

export class FontEnvironment {
  /** faces loaded from the provider */
  readonly provided = new Set<string>()
  private readonly asked = new Set<string>()
  private readonly chains = new Map<string, string[]>()
  private readonly pages = new Map<number, { seq: number; chains: string[][] }>()

  constructor(
    private readonly doc: () => HwpCoreDocument,
    private readonly opts: {
      check: FontCheck
      provider?: FontProvider
      /** where provided faces are added (the page's `document.fonts`) */
      fonts?: { add(face: FontFace): unknown }
      /** builds a loadable face; tests pass a stand-in */
      makeFace?: (family: string, bytes: Uint8Array) => FontFace
      /** a sequence that moves on whenever the document changes (Session.changeSeq) */
      seq?: () => number
    },
  ) {}

  /** Whether this machine draws the face itself, under any of its names. */
  available(face: string): boolean {
    return fontNames(face).some((n) => this.provided.has(n) || this.opts.check(n))
  }

  /** Faces the document uses. */
  faces(): string[] {
    return this.doc().info().fontsUsed
  }

  /** The chains this page is painted with (cached until the document changes). */
  chainsOf(page: number): string[][] {
    const seq = this.opts.seq?.() ?? 0
    const hit = this.pages.get(page)
    if (hit && hit.seq === seq) return hit.chains
    let chains: string[][] = []
    try {
      chains = this.doc().pageFontChains(page)
    } catch {
      /* mid-relayout; asked again on the next render */
    }
    this.pages.set(page, { seq, chains })
    for (const c of chains) if (c[0] && !this.chains.has(c[0])) this.chains.set(c[0], c)
    return chains
  }

  private chainFor(face: string): string[] | undefined {
    if (!this.chains.has(face)) {
      const n = this.doc().pageCount()
      for (let p = 0; p < n && !this.chains.has(face); p++) this.chainsOf(p)
    }
    return this.chains.get(face)
  }

  private substitute(face: string): MissingFont {
    const chain = this.chainFor(face) ?? [face]
    const same = new Set(fontNames(face))
    const paintedWith = chain.slice(1).find((f) => !GENERIC.has(f.toLowerCase()) && !same.has(f) && this.available(f)) ?? null
    return { face, paintedWith }
  }

  /** Faces the document uses that this machine draws with another face. */
  missing(): MissingFont[] {
    return this.faces()
      .filter((f) => !this.available(f))
      .map((f) => this.substitute(f))
  }

  /** Whether a page is drawn only with the faces it asks for. */
  page(page: number): PageFonts {
    const faces = [...new Set(this.chainsOf(page).map((c) => c[0]!).filter((f) => !GENERIC.has(f.toLowerCase())))]
    const missing = faces.filter((f) => !this.available(f)).map((f) => this.substitute(f))
    return { page, faces, missing, faithful: missing.length === 0 }
  }

  /**
   * Ask the provider for each missing face once, and load what it returns.
   * Resolves to the faces loaded; repaint after a non-empty result.
   */
  async provide(): Promise<string[]> {
    const { provider } = this.opts
    if (!provider) return []
    // `FontFaceSet.add` is missing from this TypeScript DOM library; every browser has it.
    const fonts = this.opts.fonts ?? (typeof document !== 'undefined' ? (document.fonts as unknown as { add(face: FontFace): unknown }) : undefined)
    const make = this.opts.makeFace ?? ((family: string, bytes: Uint8Array) => new FontFace(family, bytes.slice().buffer))
    if (!fonts) return []
    const loaded: string[] = []
    for (const face of this.faces()) {
      if (this.available(face) || this.asked.has(face)) continue
      this.asked.add(face)
      try {
        const bytes = await provider(face)
        if (!bytes || !bytes.length) continue
        const ff = make(face, bytes)
        await ff.load()
        fonts.add(ff)
        this.provided.add(face)
        loaded.push(face)
      } catch {
        /* a file the browser cannot read stays missing, and is reported */
      }
    }
    return loaded
  }
}
