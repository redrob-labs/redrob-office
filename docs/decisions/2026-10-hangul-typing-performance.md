# Hangul typing performance: defer pagination while typing, stay on the main thread

Status: decided for spec task 1.9 (R4.4), 2026-10-07.

## Measurement

`pnpm --filter @genoffice/hangul-fidelity bench` runs in Electron (Chromium canvas, the editor's
paint path) on this repository's Linux build machine (8 cores), at zoom 1.5. Each keystroke inserts
one syllable mid-document, then repaints the caret's page. Results:

| Document | Pages | p95 per keystroke, engine as-is | p95 by step | p95, pagination deferred |
| --- | --- | --- | --- | --- |
| generated (`--pages 100`) | 102 | **122–126 ms** | insert 105 ms, cursor 4 ms, paint 13–15 ms | **19 ms** (settle pass: 99 ms) |
| upstream `aift.hwpx` | 74 | 14 ms | insert 2.4 ms | 12 ms |
| upstream `hwp3-sample16-hwp5.hwp` | 65 | 38 ms | — | — |

A native profile (`RHWP_2424_PROFILE=1`) shows where the time goes. After every keystroke the
engine re-typesets the whole edited section: 45–49 ms native and about 105 ms in wasm for 1,321
paragraphs. That happens even when the edit can't move a page break. The two upstream samples are
fast because they have many short sections.

## Decision

- **Defer pagination while a person types.** `Session.edit` puts the engine in batch mode for
  user-origin typing commands (insert, delete, split). `EditorView` settles 150 ms after the last
  keystroke.
- **Everything else settles first:** formatting, undo/redo, export/save, AI and remote edits.
  These always see exact pages.
- **Correctness check.** The benchmark and `deferred-pagination.test.ts` both verify that the settled
  document has the same pages and the same layer trees as typing without deferral. The benchmark
  gates on this path: p95 ≤ 50 ms and an identical result.
- **No worker.** At 19 ms the main thread is within budget. A worker would need an
  `OffscreenCanvas` change in the engine (design §3.2) for no gain here.

## Known cost and follow-up

- **Lagging page breaks.** Until the settle (≤ 150 ms idle), a line that crosses a page boundary is
  drawn where the previous pagination put it. The caret and text are current; only page breaks lag.
- **The settle pass is still ~100 ms on a single 100-page section.** It runs at idle, so it doesn't
  add to keystroke latency. It is a candidate for an engine change that typesets from the edited
  page and stops once breaks converge. Upstream already detects convergence (`find_convergence`)
  but doesn't use it to skip work. That change is worth offering upstream.
- **Reference machine.** These numbers come from the build machine. R4.4 names a reference machine,
  which should be one of the Windows runner's specs.
