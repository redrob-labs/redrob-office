import { resolve } from 'node:path'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// UI-only standalone build of the markdown renderer (was electron-vite).
export default defineConfig({
  root: resolve(__dirname, 'src/renderer'),
  plugins: [react()],
  server: { host: '127.0.0.1', port: Number(process.env.MARKDOWN_DEV_PORT) || 5201 },
  build: {
    outDir: resolve(__dirname, 'dist'),
    emptyOutDir: true,
    rollupOptions: { input: { index: resolve(__dirname, 'src/renderer/index.html') } },
  },
})
