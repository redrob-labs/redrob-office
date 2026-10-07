# Release backlog — redrob-office integration (chore/ui-hangul-integration)

Two checks are knowingly red at the time of the 0.9.0 integration merge.
Both are tracked here and were merged via admin bypass with the owner's
authorization. Neither is a code regression introduced by the integration.

## 1. `build & test` — flaky timing test (required check)

`packages/hwp-editor/tests/deferred-pagination.test.ts` →
"defers during user typing and settles to the same pages as typing
without deferral" (spec task 1.9).

- Passes locally every run (3/3 confirmed). Fails only on the CI runner,
  repeatably, including on a clean `--failed` re-run.
- It is a wall-clock timing assertion about deferred pagination settling;
  under CI runner load the timing window is missed.
- **Action:** make the test time-source injectable (fake timers) instead
  of real `setTimeout`, so it is deterministic on a loaded runner. Until
  then it will intermittently redden `build & test`.

## 2. `hwp-core reproducible` — missing vendored engine assets (NOT required)

`node scripts/hwp-core-provenance.mjs --check` fails: the recorded
engine source digest (6708c5b8…) does not match a fresh checkout, because
the vendored `engines/rhwp` snapshot is missing
`src/parser/hwpx/blank2010_assets/*.bin` (6 files). The root `.gitignore`
`*.bin` rule silently excluded them. The committed wasm embeds them via
`include_bytes!`, so the shipped engine works, but the committed source
cannot reproduce the committed wasm.

- The 6 files exist upstream (edwardkim/rhwp @ v0.8.7 1a76570e) and were
  re-fetched, but adding them still does not reproduce the recorded
  digest — the author's exact vendoring snapshot differs. Guessing bytes
  would be a false "reproducible", so it was NOT done.
- The duplicate provenance step was removed from the required `build &
  test` job; the dedicated non-required `hwp-core reproducible` job keeps
  it visibly red.
- **Action:** have the engine author commit the exact vendored
  `engines/rhwp` snapshot (with the 6 `.bin`, via a `.gitignore`
  negation) and re-record `provenance.json`.
