import { createRequire } from 'node:module'
import { dirname, resolve } from 'node:path'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { viteStaticCopy } from 'vite-plugin-static-copy'

// UI-only standalone build of the pdf renderer (was electron-vite). The PDFium
// WASM is copied next to the bundle so the client-side viewer can load it.
// Resolve its real path through Node so pnpm's symlinked store layout is handled.
// (package.json is not in the package's exports map, so resolve the main entry
// and walk up to its dist/ instead.)
const require = createRequire(import.meta.url)
// vite-plugin-static-copy treats `src` as a glob; Windows backslashes break the
// match, so normalise to forward slashes.
const pdfiumWasm = resolve(dirname(require.resolve('@embedpdf/pdfium')), 'pdfium.wasm').replace(/\\/g, '/')

export default defineConfig({
  root: resolve(__dirname, 'src/renderer'),
  plugins: [
    react(),
    viteStaticCopy({ targets: [{ src: pdfiumWasm, dest: '.' }] }),
  ],
  server: { host: '127.0.0.1', port: Number(process.env.PDF_DEV_PORT) || 5202 },
  build: {
    outDir: resolve(__dirname, 'dist'),
    emptyOutDir: true,
    rollupOptions: { input: { index: resolve(__dirname, 'src/renderer/index.html') } },
  },
})
