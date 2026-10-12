import react from '@vitejs/plugin-react'
import { defineConfig, externalizeDepsPlugin } from 'electron-vite'

export default defineConfig({
  main: {
    // @genoffice/* workspace packages ship TS source (no build step, no
    // compiled entry point) — externalizing them makes Node's ESM loader try
    // to resolve their relative imports at runtime and fail. Bundle those;
    // externalize everything else (Electron, zod, node builtins).
    plugins: [
      externalizeDepsPlugin({
        exclude: [
          '@genoffice/ai-provider',
          '@genoffice/agent-core',
          '@genoffice/ai-search',
          '@genoffice/docx-engine',
          '@genoffice/file-parse',
          '@genoffice/electron-utils',
          '@genoffice/i18n',
        ],
      }),
    ],
  },
  preload: {
    // A sandboxed preload can require only electron and a few Node builtins,
    // so every workspace package it imports must be bundled, not externalized.
    // Leaving one out makes the preload throw and the editor opens blank.
    // scripts/check-preload-bundles.mjs checks the built output in CI.
    plugins: [
      externalizeDepsPlugin({
        exclude: ['@genoffice/electron-utils', '@genoffice/facts'],
      }),
    ],
  },
  renderer: {
    plugins: [react()],
  },
})
