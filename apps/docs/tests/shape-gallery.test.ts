import { describe, expect, it } from 'vitest'

// Path adjusted for FEAT-002's directory rename: GenOffice's packages/ui was
// copied to packages/genoffice-ui in redrob-office (package name stays
// @genoffice/ui) so it can coexist with the existing @redrob/ui at packages/ui.
import { SHAPE_GALLERY_GROUPS } from '../../../packages/genoffice-ui/src/shape-gallery'
import { shapeBackgroundCss, shapePreviewPathD } from '../src/renderer/editor/shape-svg'

// The docs gallery (ribbon-tabs' DOC_SHAPE_GROUPS) is the full shared set, Lines included
const galleryPrsts = SHAPE_GALLERY_GROUPS.flatMap((group) =>
  group.shapes.map((shape) => shape.prst),
)

describe('shape gallery', () => {
  it('every gallery prst has preview and background geometry', () => {
    const missing = galleryPrsts.filter(
      (prst) =>
        !shapePreviewPathD(prst, 20, 20) || !shapeBackgroundCss(prst, 189, 113, '4472C4', '2F5496'),
    )
    expect(missing).toEqual([])
  })

  it('has no duplicate prsts', () => {
    expect(new Set(galleryPrsts).size).toBe(galleryPrsts.length)
  })

  it('background css is a data-uri svg with fill and stroke', () => {
    const css = shapeBackgroundCss('heart', 189, 113, '4472C4', '2F5496')!
    const encoded = /data:image\/svg\+xml,([^"]+)"/.exec(css)?.[1]
    expect(encoded).toBeTruthy()
    const svg = decodeURIComponent(encoded!)
    expect(svg).toContain('#4472C4')
    expect(svg).toContain('#2F5496')
  })
})
