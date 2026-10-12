import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    include: ['tests/**/*.test.ts'],
    // These tests do real .pptx work — open, edit, save, reopen, and compare
    // parts byte-for-byte — so a single one legitimately takes seconds. On
    // vitest's 5s default they passed locally (a heavy one measures ~216ms here)
    // and timed out on CI, where turbo runs 24 tasks at once: 5540ms observed
    // on one release, two tests on the next. That is runner contention, not a
    // hang, and it blocked two releases in a row.
    //
    // 20000 is not a new number: docx-engine, pdf2docx and file-parse — the
    // other document engines in this repo — already use it. This package was
    // simply the one left on the default.
    testTimeout: 20000,
  },
})
