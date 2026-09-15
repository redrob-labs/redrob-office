import { defineConfig } from "vitest/config";
import { resolve } from "node:path";

/**
 * The benchmark scripts have pure helpers worth testing on their own — reading a
 * workbook back, telling an upstream throttle from a wedged engine — and the
 * main config only looks under src/. This runs the tests that live beside the
 * scripts: `pnpm --filter @redrob/office exec vitest run -c vitest.scripts.config.ts`.
 */
export default defineConfig({
  resolve: {
    alias: {
      "@redrob/store": resolve("../packages/store/src/index.ts"),
      "@redrob/kernel": resolve("../packages/kernel/src/index.ts"),
    },
  },
  test: {
    include: ["scripts/**/*.test.ts"],
    testTimeout: 30_000,
  },
});
