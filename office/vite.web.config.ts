import { resolve } from "node:path";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

/**
 * Standalone Vite config so the renderer can run in Cursor's browser
 * without Electron. See `pnpm --filter @redrob/office dev:web`.
 */
export default defineConfig({
  root: resolve("src/renderer"),
  publicDir: resolve("src/renderer/public"),
  plugins: [react()],
  resolve: {
    alias: {
      "@renderer": resolve("src/renderer/src"),
      "@redrob/ui": resolve(__dirname, "../packages/ui/src/index.ts"),
    },
  },
  server: {
    port: 5173,
    strictPort: true,
  },
});
