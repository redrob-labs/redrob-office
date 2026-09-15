import { resolve } from "node:path";
import { defineConfig, externalizeDepsPlugin } from "electron-vite";
import react from "@vitejs/plugin-react";

/** Resolve to source so i18n/UI edits apply in dev without rebuilding dist. */
const uiSrc = resolve(__dirname, "../packages/ui/src/index.ts");

export default defineConfig({
  main: {
    plugins: [
      externalizeDepsPlugin({
        // Native / heavy Node deps must stay external (pulled via @redrob/generate/edit).
        include: ["kordoc", "onnxruntime-node", "sharp", "hwpx-js", "docx", "pptxgenjs"],
      }),
    ],
    build: {
      rollupOptions: {
        input: {
          index: resolve(__dirname, "src/main/index.ts"),
          "inference-sidecar": resolve(__dirname, "src/main/inference-sidecar.ts"),
          "asr-sidecar": resolve(__dirname, "src/main/asr-sidecar.ts"),
        },
      },
    },
  },
  preload: {
    plugins: [externalizeDepsPlugin()],
    build: {
      rollupOptions: {
        output: {
          // Package is "type": "module"; .cjs keeps Electron loading preload as CommonJS.
          format: "cjs",
          entryFileNames: "[name].cjs",
        },
      },
    },
  },
  renderer: {
    publicDir: resolve("src/renderer/public"),
    resolve: {
      alias: {
        "@renderer": resolve("src/renderer/src"),
        /** Source alias so i18n edits apply without rebuilding packages/ui/dist. */
        "@redrob/ui": uiSrc,
      },
    },
    plugins: [react()],
    optimizeDeps: {
      exclude: ["@redrob/generate", "@redrob/generate/edit", "kordoc", "onnxruntime-node", "sharp"],
    },
  },
});
