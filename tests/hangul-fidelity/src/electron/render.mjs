// Renderer half of the Electron harness: open each document with the core and
// paint every page with renderPageToCanvas at dpi / 96, then send the PNGs back.
import init, { HwpDocument } from 'fidelity://repo/packages/hwp-core/wasm/rhwp.js'

async function post(path, body) {
  await fetch(`fidelity://${path}`, { method: 'POST', body })
}

async function main() {
  await init({ module_or_path: 'fidelity://repo/packages/hwp-core/wasm/rhwp_bg.wasm' })
  const job = await (await fetch('fidelity://job/')).json()
  const scale = job.dpi / 96
  await document.fonts.ready
  for (const [i, item] of job.items.entries()) {
    const t0 = performance.now()
    try {
      const bytes = new Uint8Array(await (await fetch(`fidelity://doc/${i}`)).arrayBuffer())
      const doc = item.password ? HwpDocument.openWithPassword(bytes, item.password) : new HwpDocument(bytes)
      const pages = doc.pageCount()
      const info = JSON.parse(doc.getDocumentInfo())
      for (let p = 0; p < pages; p++) {
        const canvas = document.createElement('canvas')
        doc.renderPageToCanvas(p, canvas, scale)
        const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/png'))
        await post(`page/${i}/${p}`, blob)
      }
      await post(`meta/${i}`, JSON.stringify({ id: item.id, pages, scale, fontsUsed: info.fontsUsed, fontSubstitutions: info.fontSubstitutions, ms: Math.round(performance.now() - t0) }))
      doc.free()
      await post('log', `rendered ${item.id}: ${pages} page(s)`)
    } catch (e) {
      await post('log', `ERROR ${item.id}: ${e && e.stack ? e.stack : e}`)
    }
  }
  await fetch('fidelity://done/')
}

main().catch(async (e) => {
  await post('log', `ERROR harness: ${e && e.stack ? e.stack : e}`)
  await fetch('fidelity://done/')
})
