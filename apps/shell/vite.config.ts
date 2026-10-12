import { resolve } from 'node:path'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// UI-only standalone build of the shell renderer. The desktop app built this
// through electron-vite (main + preload + renderer); here only the renderer is
// built, as an ordinary browser SPA. The single entry is the home/host window;
// the auxiliary Electron windows (update, pdf-password) and their preloads are
// gone, so their html inputs are dropped.
export default defineConfig({
  root: resolve(__dirname, 'src/renderer'),
  plugins: [react()],
  server: {
    host: '127.0.0.1',
    port: Number(process.env.SHELL_DEV_PORT) || 5199,
  },
  build: {
    outDir: resolve(__dirname, 'dist'),
    emptyOutDir: true,
    rollupOptions: {
      input: {
        index: resolve(__dirname, 'src/renderer/index.html'),
      },
    },
  },
})
