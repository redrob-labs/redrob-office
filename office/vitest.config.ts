import { defineConfig } from "vitest/config";
import { resolve } from "node:path";

export default defineConfig({
  resolve: {
    alias: {
      "@redrob/store": resolve("../packages/store/src/index.ts"),
      "@redrob/kernel": resolve("../packages/kernel/src/index.ts"),
    },
  },
  test: {
    include: ["src/**/*.test.ts"],
    /*
     * These are integration tests: they open real SQLite databases and drive a
     * scripted office through several rounds of turns. That work costs about a
     * second on a developer's machine and roughly six on the Windows CI runner,
     * so vitest's 5s default fails on runner speed rather than on the code.
     * Generous enough to absorb a slow runner, still short enough that a test
     * which genuinely hangs fails the build rather than hanging it.
     */
    testTimeout: 30_000,
    hookTimeout: 30_000,
  },
});
