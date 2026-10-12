import { resolve } from 'node:path'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// UI-only standalone build of the hangul renderer (was electron-vite). The
// hwp-core WASM engine loads via new URL('../wasm/rhwp_bg.wasm', import.meta.url),
// which Vite emits as an asset automatically - the editor runs in the browser.
export default defineConfig({
  root: resolve(__dirname, 'src/renderer'),
  plugins: [react()],
  server: { host: '127.0.0.1', port: Number(process.env.HANGUL_DEV_PORT) || 5206 },
  build: {
    outDir: resolve(__dirname, 'dist'),
    emptyOutDir: true,
    target: 'esnext',
    rollupOptions: { input: { index: resolve(__dirname, 'src/renderer/index.html') } },
  },
})
