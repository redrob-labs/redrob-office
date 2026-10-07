# Hangul fidelity harness

Measures the Hangul core against 한글 2024 (spec R1–R3).

```sh
pnpm --filter @genoffice/hangul-fidelity fidelity all --out .fidelity                       # synthetic corpus
pnpm --filter @genoffice/hangul-fidelity fidelity all --corpus "$HANGUL_CORPUS_DIR" --out .fidelity
```

| Step | Runs on | What it checks |
| --- | --- | --- |
| `roundtrip` | Node | Opens each document, saves it unchanged in the same format, reopens it, and compares every page's layer tree, which is the engine's full paint description (R1.4, R3.1, engine side) |
| `render` | Electron (needs a display; use `xvfb-run` on Linux) | Paints every page through `renderPageToCanvas`, the path the editor uses, at `--dpi` (default 150) |
| `reference` | Windows runner with 한글 2024 | `src/hancom/reference.ps1` opens each file through COM (`HWPFrame.HwpObject`) and saves PDF through the fixed built-in filter. PDFium then rasterises it at the same dpi. Results are cached per document. |
| `compare` | anywhere | pixelmatch per page (threshold 0.1, anti-aliasing excluded, `--max-diff-pixels`, default 0) and the report |

## Corpus

Documents never go in this repository. Put them in a directory, set `HANGUL_CORPUS_DIR`, and add
a `manifest.json`:

```json
{ "entries": [
  { "id": "gov-form-001", "file": "forms/001.hwp", "format": "hwp",
    "tags": ["table", "header-footer"], "source": "https://www.example.go.kr/…", "permission": "public record" }
] }
```

Tags are listed in `src/corpus.ts` (`CORPUS_TAGS`).

For failures, `causes.json` in the same directory records a person's classification. It overrides
the heuristic:

```json
{ "gov-form-001": { "cause": "table", "nature": "architecture", "note": "…" } }
```

`nature: "architecture"` marks a failure that is a limit of the engine rather than a bug. The
report lists these, and they feed the engine fitness decision (task 0.8).

## The Windows runner

Prerequisite P-1 in the spec. The runner needs:

- 한글 2024, licensed.
- Hancom's automation security module (`FilePathCheckerModule`) registered, so COM can open files
  without a prompt.
- Node 22 and pnpm 9.15.
- The labels `self-hosted, windows, hancom-2024`.
- The environment variables `HANGUL_CORPUS_DIR` and `HANGUL_FIDELITY_CACHE`.

`reference.ps1` has not yet run against a real 한글 2024; this repository has no such machine. Expect
to adjust `SetMessageBoxMode` and the `Open` options on the first run.
