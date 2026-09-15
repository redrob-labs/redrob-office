# anydoc for document → markdown

Date: 2026-08-07
Status: evaluated, adoption recommended for the non-PDF intake path

Evaluation of [`firecrawl/anydoc`](https://github.com/firecrawl/anydoc) as the
converter behind "read this file". The numbers below come from
`office/scripts/anydoc-eval.mjs`, which builds its own fixtures and runs both
pipelines side by side, so they can be re-measured rather than trusted.

anydoc is not a dependency of this repo. It was installed into a scratch
directory for the measurement, and this document is the argument for adding it,
not a record of having added it.

## What we do today

Three unrelated things, none of which is "any document to markdown":

| Path | Does | Covers |
| --- | --- | --- |
| `packages/extract` `decodeSourceFile` | text for field-fill | `.txt` `.md` `.json`, `.pdf` via pdf-parse, `.docx` via mammoth |
| `packages/generate` `parseDocument` | markdown for the Hangul editor | HWP, HWPX via kordoc |
| `office/src/main/docs` + LibreOffice | converts foreign formats *to* OOXML, and OOXML to a PDF preview | doc, odt, rtf, hwp, xls, ods, csv, ppt, odp |

The gap is specific. `decodeSourceFile` throws on `.xlsx`, `.pptx` and `.csv`:

```
binary decode not yet implemented for .xlsx
```

Those are the three formats a recruiting or finance intake sees most after
docx and pdf. LibreOffice can open them, but it produces another binary, not
text a model can read.

## Measurements

Median of nine runs after one warm run, Node 22 on linux-x64,
`@firecrawl/anydoc@0.1.7`.

| Fixture | anydoc | today | today's output |
| --- | --- | --- | --- |
| `jd.docx` (headings + 3×3 table) | **0.30 ms** | 1.98 ms (mammoth) | table flattened to loose lines |
| `candidates.xlsx` | **0.35 ms** | refused | — |
| `plan.pptx` (2 slides) | **0.12 ms** | refused | — |
| `rows.csv` | **0.13 ms** | refused | — |
| `offer.pdf` (text PDF) | 0.17 ms | 1.86 ms (pdf-parse) | **pdf-parse keeps 5 lines, anydoc keeps 2** |
| `big.xlsx` (20k rows, 530 KB) | 111 ms, 957 KB markdown | refused | — |

### The docx table is the result that matters

Both decoders read the same file. mammoth's `extractRawText` returns the cells
as separate paragraphs:

```
Band

Base

Equity

L4

KRW 78,000,000

0.05%
```

anydoc returns the table:

```
| Band | Base | Equity |
| --- | --- | --- |
| L4 | KRW 78,000,000 | 0.05% |
| L5 | KRW 96,000,000 | 0.09% |
```

For field-fill this is not a cosmetic difference. The flattened version has
lost which base salary belongs to which band; a model reading it has to guess
the row association from ordering, and it will sometimes guess wrong. This is
the single strongest argument for the change, and it is worth more than the
6× speed-up next to it.

### PDF goes the other way

anydoc detected the heading (`# Offer letter`) and was ~10× faster, but ran the
three body lines together into one paragraph. pdf-parse kept them apart.

Line structure is load-bearing here: the field-fill grammar has a `lineRefs`
field type, and the confidence path quotes locators back to the reader. Losing
line boundaries to gain 1.7 ms is a bad trade.

**So: keep pdf-parse for PDFs.** anydoc's own documentation is consistent with
this — Firecrawl ships a separate PDF engine (`pdf-inspector`) and describes
anydoc as the everything-else half.

### It does not block the event loop

The 20k-row workbook took 111 ms and a 5 ms interval timer fired 21 times
during the call. Conversion really does run on the libuv thread pool. That is
a prerequisite, not a nicety: this would run in the Electron main process,
which also serves every IPC handler in the app.

Resident memory reached 322 MB producing 957 KB of markdown from a 530 KB
workbook. Not alarming for a one-off conversion, but a folder intake that
converts hundreds of files should do them one at a time rather than mapping
over `Promise.all`.

### It refuses honestly

```
corrupt   malformed document: not a readable zip archive: invalid Zip archive: Could not find EOCD
missing   io error: No such file or directory (os error 2)
unknown   unsupported input: unrecognized file content and extension
```

Typed, readable, and thrown rather than returned as empty output. A native
module that aborts the process on bad input would have ended the evaluation
here; this one does not.

Format detection reads the bytes, not the extension. A `.docx` file containing
xlsx bytes converted correctly as a spreadsheet — which is the common shape of
a mislabeled export.

## Can it replace LibreOffice?

No, and the two are not really candidates for the same job.

LibreOffice is used for two things here, and anydoc can do neither:

| LibreOffice does | anydoc |
| --- | --- |
| Converts a foreign format **into an editable document** — `.hwp` → `.docx`, `.ods` → `.xlsx` — so the Documents tab can open it (`document-io.ts`) | Emits markdown. It cannot write a `.docx`. |
| Renders a document **to PDF** for the layout preview (`preview/libreoffice.ts`) | Emits no pixels. |

anydoc is a one-way road to text. Everything LibreOffice is here for needs a
document or a page image at the other end, so replacing it is not a trade-off
to weigh — it is not possible.

What does change is **when the 214 MB install is required**. Today reading a
`.csv`, `.ods` or `.hwp` means converting it to OOXML first, so a machine that
only ever reads documents still has to install LibreOffice. With anydoc on the
read path, reading is a local library call and LibreOffice becomes needed only
to *edit* a foreign format or to *preview* a layout.

That is worth having — it moves a 214 MB prerequisite off the most common path
— but it is a change in when the dependency bites, not a removal of it.
LibreOffice stays required for the editor, and
`docs/decisions/2026-08-libreoffice-managed-install.md` is unaffected.

The one exception worth naming: HWP and HWPX. anydoc does not read them at all,
so for the formats where dropping LibreOffice would matter most in this
product's first market, it does not even reach the starting line.

## What it does not cover

**HWP and HWPX are unsupported.** `formatFromExtension` returns null for both.
This is the deciding constraint on scope: Hangul formats are the first-priority
market in the README, and `kordoc` stays exactly where it is. anydoc is an
addition to the intake path, never a replacement for `parseDocument`.

**No `win32-arm64` binary.** Published targets are darwin x64/arm64, linux
x64/arm64 (gnu and musl) and win32-x64-msvc. Windows on ARM would get no
prebuilt binary, so any adoption has to treat the converter as optional and
fall back to today's decoders rather than assume it loaded.

**No OCR.** Scanned pages are out of reach, same as now.

## Cost of adopting it

- **A native module in the packaged app.** ~7.7 MB installed for the matching
  platform. It has to be unpacked from the asar to be loadable, which is
  another entry in `electron-builder.yml` alongside the existing native deps.
- **It is four days old.** The repository was created 2026-08-03 and the
  package is at `0.1.7`, with seven versions published in that window. The
  library is fast and its failure modes are clean, but nothing about it is
  settled yet. Pin the exact version rather than a caret range.
- **A second markdown dialect.** anydoc emits GitHub-Flavored Markdown;
  `MarkdownBody` already renders GFM through `marked`, so this costs nothing at
  the render end. It does mean the extract path starts seeing tables and
  headings where it previously saw flat text, and the field-fill prompts assume
  prose. That is an improvement, but it is a change to model input and should
  be measured against the fixtures in `packages/extract/fixtures` before it
  ships, not after.

## Recommendation

Adopt it for `decodeSourceFile`, scoped:

1. `.xlsx`, `.pptx`, `.csv`, `.odt`, `.ods`, `.odp`, `.rtf`, `.epub`, `.doc`,
   `.xls`, `.ppt` — formats that are refused outright today. Pure gain; there is
   no output to regress.
2. `.docx` — replaces mammoth, for the table result above. Gate on a re-run of
   `pnpm check-extract` against the resume fixtures, since this changes what the
   model reads.
3. `.pdf` — **no.** Keep pdf-parse; anydoc loses line structure.
4. HWP/HWPX — **no.** Keep kordoc.
5. LibreOffice — stays. See above: it is not a candidate for replacement, only
   for being needed less often.

Load it lazily and treat a failed load as "this format is unavailable", so a
platform with no prebuilt binary degrades to today's behaviour instead of
failing to boot.

## When to revisit

- **If anydoc gains HWP/HWPX**, `kordoc` becomes a candidate for removal and
  the Hangul editor path is worth re-examining. Only then; format-preserving
  patching of HWP is a separate capability anydoc does not claim.
- **If `win32-arm64` is published**, the optional-load fallback can be dropped.
- **If pdf-inspector ships Node bindings**, re-run the PDF row of this table.
  The line-structure result is the only thing keeping pdf-parse.
