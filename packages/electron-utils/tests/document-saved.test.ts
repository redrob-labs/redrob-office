import { describe, expect, it, vi } from 'vitest'

import { emitDocumentSaved, onDocumentSaved, type DocumentSaved } from '../src/document-saved'

describe('document-saved bus', () => {
  it('delivers every save to every listener and unsubscribes', () => {
    const seen: DocumentSaved[] = []
    const off = onDocumentSaved((e) => seen.push(e))
    emitDocumentSaved({ path: '/a.xlsx', bytes: new Uint8Array([1]), auto: false, editor: 'sheets' })
    off()
    emitDocumentSaved({ path: '/b.docx', bytes: new Uint8Array([2]), auto: true, editor: 'docs' })
    expect(seen.map((e) => e.path)).toEqual(['/a.xlsx'])
  })

  it('a failing listener cannot fail the save or starve the others', () => {
    const seen: string[] = []
    const offA = onDocumentSaved(() => {
      throw new Error('boom')
    })
    const offB = onDocumentSaved((e) => seen.push(e.path))
    expect(() => emitDocumentSaved({ path: '/c.pptx', bytes: new Uint8Array(), auto: false, editor: 'slides' })).not.toThrow()
    expect(seen).toEqual(['/c.pptx'])
    offA()
    offB()
  })

  it('is shared between module copies through globalThis', async () => {
    const seen: string[] = []
    const off = onDocumentSaved((e) => seen.push(e.path))
    // a second module instance, as when each editor main bundles its own copy
    vi.resetModules()
    const copy = await import('../src/document-saved')
    copy.emitDocumentSaved({ path: '/d.md', bytes: new Uint8Array(), auto: false, editor: 'markdown' })
    off()
    expect(seen).toEqual(['/d.md'])
  })
})
