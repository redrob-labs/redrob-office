// Keystroke-to-paint benchmark (spec R4.4, task 1.9), in the Chromium renderer
// so painting goes through the same canvas path the editor uses.
//
// For each keystroke: insert one syllable through the engine, then repaint the
// page the caret is on, as EditorView does on a change. The time from the
// insert call to the end of the repaint is one sample.
import init, { HwpDocument } from 'fidelity://repo/packages/hwp-core/wasm/rhwp.js'

async function post(path, body) {
  await fetch(`fidelity://${path}`, { method: 'POST', body })
}

function pct(sorted, p) {
  return sorted[Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length))]
}

async function main() {
  await init({ module_or_path: 'fidelity://repo/packages/hwp-core/wasm/rhwp_bg.wasm' })
  const job = await (await fetch('fidelity://job/')).json()
  const results = []
  for (const [i, item] of job.items.entries()) {
    const bytes = new Uint8Array(await (await fetch(`fidelity://doc/${i}`)).arrayBuffer())
    const t0 = performance.now()
    const doc = new HwpDocument(bytes)
    const pages = doc.pageCount()
    const openMs = performance.now() - t0
    const canvas = document.createElement('canvas')
    const scale = job.scale ?? 1
    const sections = doc.getSectionCount()
    const para = Math.floor(doc.getParagraphCount(0) / 2)
    let offset = doc.getParagraphLength(0, para)
    const samples = []
    const parts = { insert: [], rect: [], paint: [] }
    const syllables = '대한민국헌법제일조'
    for (let k = 0; k < (job.keystrokes ?? 200); k++) {
      const s = performance.now()
      const r = JSON.parse(doc.insertText(0, para, offset, syllables[k % syllables.length]))
      const t1 = performance.now()
      offset = r.charOffset
      const rect = JSON.parse(doc.getCursorRect(0, para, offset))
      const t2 = performance.now()
      doc.renderPageToCanvas(rect.pageIndex, canvas, scale)
      const t3 = performance.now()
      parts.insert.push(t1 - s)
      parts.rect.push(t2 - t1)
      parts.paint.push(t3 - t2)
      samples.push(t3 - s)
    }
    // Deferred: the same keystrokes in batch mode (no repagination per key),
    // then one pagination at idle; verify it lands on the same result.
    const doc2 = new HwpDocument(bytes)
    let off2 = doc2.getParagraphLength(0, para)
    const deferred = []
    doc2.beginBatch()
    for (let k = 0; k < (job.keystrokes ?? 200); k++) {
      const s = performance.now()
      const r = JSON.parse(doc2.insertText(0, para, off2, syllables[k % syllables.length]))
      off2 = r.charOffset
      const rect = JSON.parse(doc2.getCursorRect(0, para, off2))
      doc2.renderPageToCanvas(rect.pageIndex, canvas, scale)
      deferred.push(performance.now() - s)
    }
    const f0 = performance.now()
    doc2.endBatch()
    const flushMs = performance.now() - f0
    const same = doc2.pageCount() === doc.pageCount() && [...Array(doc.pageCount()).keys()].every((p) => doc2.getPageLayerTree(p) === doc.getPageLayerTree(p))
    deferred.sort((a, b) => a - b)
    doc2.free()
    samples.sort((a, b) => a - b)
    const p95of = (xs) => +pct([...xs].sort((a, b) => a - b), 95).toFixed(2)
    results.push({
      id: item.id,
      pages,
      sections,
      openMs: Math.round(openMs),
      keystrokes: samples.length,
      p50: +pct(samples, 50).toFixed(2),
      p95: +pct(samples, 95).toFixed(2),
      max: +samples[samples.length - 1].toFixed(2),
      deferredP95: +pct(deferred, 95).toFixed(2),
      deferredFlushMs: +flushMs.toFixed(1),
      deferredSameAfterFlush: same,
      p95Parts: { insert: p95of(parts.insert), cursorRect: p95of(parts.rect), paint: p95of(parts.paint) },
    })
    doc.free()
  }
  await post('meta/0', JSON.stringify(results))
  await fetch('fidelity://done/')
}

main().catch(async (e) => {
  await post('log', `ERROR bench: ${e && e.stack ? e.stack : e}`)
  await fetch('fidelity://done/')
})
