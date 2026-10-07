# Hangul scripted edit scenarios: first results

Status: findings for spec task 1.11 (R3.2, R3.3, R3.5), 2026-10-07.

`tests/hangul-fidelity/src/scenarios.ts` runs eight edit scenarios through the editor core
(`Session` + `CommandBus`, the code the app runs): typing Korean, split and merge, adding
paragraphs, deleting across a break, bold and italic, HTML paste, editing a table cell, and undoing
everything. Each result is saved in both formats and reopened. The checks:
- the reopened text equals the edited text;
- in the source format, the reopened document paints the same glyphs (`paint.ts`);
- undoing every edit saves exactly what a no-op save writes.

CI runs it on the synthetic corpus (64 scenario × document × format cases): **all pass**.

## On real documents

Locally, I ran 30 documents from upstream rhwp's `samples/`, spread evenly across HWP and HWPX up
to 1.5 MB. They aren't copied into this repository because their licences aren't recorded.

**401 of 430 checks pass.** The 29 failures fall into three groups.

| Group | Checks | Documents | Caused by our edits? |
| --- | --- | --- | --- |
| A. Invisible characters change on save | 16 | `hwp3-table-grid-gap.hwp` | No. It happens after undoing every edit (a no-op save), in both formats. The paint is identical (the round trip in #62 passes); only control characters in the model text differ. This is the engine's HWP3-origin handling. |
| B. HWPX → HWP adds a space next to an equation | 7 | `eq-002.hwpx` | No. It also happens on a no-op cross-format save. This is in the engine's HWPX → HWP conversion. |
| C. Layout differs after an edit, save and reopen | 6 | `hwp3-sample10-hwpx.hwpx` (763 → 765 pages after an HTML paste), `hwp3-sample19-hwpx.hwpx`, `2024년 2분기 해외직접투자 보도자료ff.hwpx`, `table_giant_cell_overfill.hwpx` | **Yes.** It appears only after HTML paste, adding paragraphs, or editing a giant cell, and only in HWPX. The line layout the engine stores for edited paragraphs doesn't reproduce its own in-memory layout on reopen. 한글 trusts stored line layout, so 한글 may lay these files out differently as well. This is the most important finding for R3.2. |

Document hashes (sha256 prefix):

| Document | sha256 |
| --- | --- |
| `hwp3-table-grid-gap.hwp` | `3313829fceed…` |
| `eq-002.hwpx` | `ecb229b47bfa…` |
| `hwp3-sample10-hwpx.hwpx` | `3395e19bebea…` |
| `hwp3-sample19-hwpx.hwpx` | `bc66703c1db0…` |
| `2024년 2분기 해외직접투자 보도자료ff.hwpx` | `54f25292bdd3…` |
| `table_giant_cell_overfill.hwpx` | `5d7eb4a21e46…` |

## One harness bug found and fixed

Group D (5 checks) is no longer a failure. The fix is in `paint.ts`: undo of an edit then
undo-all looked like a paint change because image ops carry `sourceImageKey`
(`bin:<generation>:<id>:src`), the engine's image cache generation. A snapshot restore advances it
without changing any pixels. `paint.ts` now ignores that key, and the same fix is applied in the
collaboration spike.

## What follows

- **C goes into the engine work before cutover.** The saved line layout for edited paragraphs must
  be the one the engine lays out on reopen. The next step is to bring these four documents (or
  licence-cleared equivalents) into the Corpus with `causes.json` entries, then fix the HWPX
  serializer's line-segment output for reflowed paragraphs. It is then checked on the 한글 2024
  runner.
- **A and B are pre-existing engine fidelity issues**, and are candidates to report upstream.
- **The 한글 2024 half of R3.2** (opens without a repair prompt, renders like the golden) runs on
  the Windows runner from the files `runScenario(..., outDir)` writes.
