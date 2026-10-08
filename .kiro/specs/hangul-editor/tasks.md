# Tasks: Hangul editor on a forked rhwp core

Requirement references are in brackets, e.g. [R2.1].

## Ground rules

- Each task lands as a PR on a `feat/hangul-*` branch.
- Every PR runs `pnpm typecheck`, `pnpm test`, `pnpm build`, `check:licenses`, `check:ui-tokens`
  and `check:upstream-boundary`.
- 🚦 marks a decision gate: work after it waits for a recorded decision in
  `docs/decisions/2026-10-hangul-*.md`.

**Prerequisites. Phase 0 cannot complete without these, and they need people, not code:**

- [ ] P-1 A self-hosted Windows runner with a licensed 한글 2024 and COM automation enabled.
- [x] P-2 ~~Create the `redrob-labs/rhwp` repository~~: GitHub refused (403); the fork lives in `engines/rhwp` (see its REDROB.md).
- [ ] P-3 Corpus sources: public documents identified; a storage location for customer documents
  outside the repo.
- [ ] P-4 Counsel engaged for the trademark, font and specification-terms review [R10.7].

## Phase 0: Foundations and gates

- [x] 0.1 Fork rhwp at tag v0.8.7. Build the WASM in Docker. Add `packages/hwp-core` with the
  artifact, generated types and `provenance.json`. Add the `hwp-core reproducible` CI job.
  [R10.1, R10.2]
- [x] 0.2 Add `cargo-deny` licence checks to the fork's CI. Extend the root `NOTICE` for rhwp core
  (MIT). [R10.3]
- [x] 0.3 Fidelity harness:
  - Corpus manifest with feature tags.
  - Hancom reference generator: COM open → fixed PDF path → PDFium 150 dpi.
  - Electron offscreen renderer for the Core.
  - pixelmatch diff and HTML report.
  [R1.1, R1.2, R2.2]
- [x] 0.4 No-op save round trip for `.hwp` and `.hwpx` through 한글 2024 in the harness. [R1.4, R3.1]
- [x] 0.5 Live-collaboration spike: y-hwp mirror versus server-ordered op log. Two-client fuzz test;
  check convergence and that 한글 2024 opens the result. [R9.4]
- [x] 0.6 Generate (baseline in `coverage/`, from rhwp-studio plus the 검토 tab; reconcile per row on the runner) the 한글 2024 formatting coverage list for every supported object [R5.3] and the
  shortcut map [R4.2].
- [x] 0.7 Research (findings in `docs/decisions/2026-10-hangul-format-research.md`; 한글 2024-saved
  golden files for R2 and R3 wait for P-1):
  - R1: Node id slots in HWP 5.0 and HWPX.
  - R2: Memo records in files saved by 한글 2024, both formats.
  - R3: Revision records, both formats.
  Each produces golden fixture files and a written finding. [R7.1, R8.2]
- [ ] 0.8 🚦 **Engine fitness decision**: continue with rhwp or build a new engine, based on the
  reports from 0.3 and 0.4, with failure causes classified. [R1.3]
- [ ] 0.9 🚦 **Collaboration design decision** from 0.5 (decided: one Y.Text per section, `docs/decisions/2026-10-hangul-collaboration.md`). Fidelity threshold ratified for R2.2 (waits for P-1).

## Phase 1: Core extensions and editing core

- [x] 1.1 E1 stable Node ids (Rust, with round-trip tests in both formats). Propose upstream. [R6.1]
- [x] 1.2 E2 change stream (`Op`, `changeSeq`). Implemented at the editor's single mutation entry (`Session.edit`) instead of inside the engine's edit calls; see `packages/hwp-editor/src/session.ts`. [R4.5]
- [ ] 1.3 E3 `getOutline` and `readNodes`. E8 font provider hook with a substitution report.
  [R2.4, R2.5, R6.1]
- [x] 1.4 `packages/hwp-editor`: Session, NodeIndex, PageView (virtualized, DPR-aware zoom),
  OverlayLayer. [R2.1, R2.3]
- [ ] 1.5 Input proxy and IME: preedit overlay, composition commit. Automated composition tests done (`view.test.ts`); still open: the manual matrix for Windows MS-IME, macOS 2-Set and Linux ibus/fcitx. [R4.1]
- [x] 1.6 Hit testing, caret and selection (text, cell, object). Keyboard navigation and the
  shortcut map from 0.6. [R4.2]
- [ ] 1.7 CommandBus and History (snapshot groups); editing in the body, tables, headers and
  footers, notes and text boxes; object move and resize. [R4.2, R4.3]
- [x] 1.8 Clipboard: E7 range export and import (extending upstream `paragraph_block/import`), HTML
  and Office paste. [R4.2]
- [x] 1.9 Performance benchmark (decision: `docs/decisions/2026-10-hangul-typing-performance.md`; main thread, deferred pagination; no worker) on a 100-page Corpus document. Decide whether to move the Core into
  a worker. [R4.4]
- [x] 1.10 Open, save and Save As through the existing main and preload: atomic writes, password
  documents, dirty tracking from `changeSeq`. Add the development flag `REDROB_HANGUL_EDITOR=next`.
  Until E5a lands, refuse an in-place save of a document with tracked changes, and offer Save As.
  [R3.4, R3.6, R4.5, R11.1]
- [x] 1.11 Harness: scripted edit scenarios (engine half; findings in `docs/decisions/2026-10-hangul-edit-scenarios.md`; the 한글 2024 open check waits for P-1) saved and checked in 한글 2024 for both formats. Run in
  CI nightly. [R3.2, R3.3, R3.5]

- [x] 1.12 Finding C from 1.11: page-number carry across sections fixed (#73); the remaining case is a deliberate omission of stored line layout for engine-laid-out paragraphs (finding C2), labelled by the harness. [R3.2]
- [ ] 1.13 On the 한글 2024 runner: open the C2 files, compare 한글's page count with rhwp's in-memory and reopened layouts, and fix whichever side disagrees. Waits for P-1. [R3.2]

## Phase 2: Chrome and design parity

- [ ] 2.1 Fill every `EditorFrame` slot that Docs fills: undo/redo, save status, search with Ask,
  file menu, mode, banner, status line. [R5.1]
- [x] 2.2 Classic Ribbon (검토 tab arrives with Phase 4): 편집 / 입력 / 서식 / 쪽 / 검토 / 보기 tabs on `Toolbar`, driven by
  CommandBus state. Simple toolbar. [R5.1, R5.3]
- [x] 2.3 Dialogs on `@genoffice/ui`. Done: character shape (per-script font, 자간, 장평, relative size, position, attributes), paragraph shape (alignment, margins, indent, spacing, line spacing, pagination), find and replace, page setup, table and cell properties (표/셀 속성: margins, page breaks, header repeat, placement, caption; cell size, inside margins, alignment, header, protection; borders and fill over the selected cells), object properties (개체 속성 for pictures and drawing objects: size, position, wrapping, margins, line, fill, picture effect; click to select, Delete, arrange), style editor (스타일, F6: create, rename, next style, character and paragraph settings, delete to 바탕글; editing a style restyles its paragraphs). [R5.3]
- [x] 2.4 Insert flows. Done: table, picture, equation, footnote and endnote, header/footer, bookmark. shape (rectangle, ellipse, line, text box at the caret at a default size; 한글's drag-to-draw is not done). hyperlink (insert over the selection or as new text, edit, remove; web and mail addresses only; Ctrl+click opens through the main process), field (누름틀 with guide, help text and name; remove). chart (engine E7: clustered column, clustered bar, line with markers, pie; data sheet to insert and to edit rows and series; both formats). Open: fields and links inside table cells; 한글 2024 opening a new chart (runner). [R5.3]
- [ ] 2.5 Done: i18n and accessibility pass (`apps/hangul/tests/a11y-i18n.test.tsx`: en and ko keys,
  placeholders and authored Korean; every ribbon tab and dialog in both locales checked for named
  controls, dangling ARIA references, duplicate ids, named modal dialogs, selected tabs and English
  left in Korean chrome; fixes: `TabbedPanels`, the document body's localized name, the equation
  hint); visual specs `tests/visual/specs/hangul-next.spec.ts` (editor and 표/셀 속성, both themes).
  Open: committing their four Linux baselines from the CI `visual-baselines` artifact, which
  AGENTS.md reserves for a person. [R5.4, R5.5]
- [x] 2.7 Hancom attribution (Settings > About in every locale, the Hangul editor status line, NOTICE and source; a printed manual, if one ships, must carry it too) in the Hangul About and help surfaces, in both locales: 「본 제품은
  한글과컴퓨터의 한글 문서 파일(.hwp) 공개 문서를 참고하여 개발하였습니다.」 Required by the HWP
  specification's terms (research finding 4) and part of the cutover checklist. [R10.7]
- [ ] 2.6 Coverage check: every item from 0.6 is reachable, verified by an automated test over
  CommandBus. Done: `apps/hangul/tests/command-coverage.test.ts` checks every listed command and
  shortcut against the bus and the host command table (`host-commands.ts`); 146 of 176 reachable
  (from 66), floor raised to 146. Open: the 30 in `NOT_YET`, each with its reason (Home owns
  opening files; print and exports; header/footer and note editing modes; multi-object selection;
  several dialogs). [R5.3]

## Phase 3: AI

- [x] 3.1 `createHangulSkill`: context, selection frozen per run, Node-id addressing. Compose it
  with the files, search and image skills. [R6.1]
- [x] 3.2 Read tools: `get_document_context`, `read_blocks` (the Docs restricted-HTML dialect
  mapped to HWP shapes). [R6.1, R6.2]
- [x] 3.3 Write tools: `replace_blocks` and `insert_content` with formatting inheritance;
  `apply_commands`; `set_header_footer`; tables and cells; text boxes. [R6.2, R6.3]
- [x] 3.4 Media and shared tools: images, charts, search, attachments, `create_document`. [R6.1]
  (`insert_chart` waits for chart creation in the engine, Phase 2 charts; `edit_chart` works on existing charts.)
- [x] 3.5 AI panel on the Agent parts: Plan or Run, status line, receipts with rollback by
  snapshot, fail-closed errors. Preload exposes `getOfficePrefs` and `onOfficePrefsChanged`.
  [R6.5, R6.6]
- [x] 3.6 `docnav://node/<id>` navigation and edit-queue anchors that move with edits. [R6.7]
- [x] 3.7 `file-parse` case for hwp and hwpx (hwp-core in Node). Turn Home's `ai: false` on for
  Hangul. Composer and attachment tests. [R6.8]
- [x] 3.8 AI evaluation set on Corpus documents: tasks for rewrite, restructure, tables and
  headers, checked by a fidelity diff after a 한글 2024 open. [R6.2, R3.2]
  Harness, tasks and CI checks done (`apps/hangul/eval`). The live run on the Corpus and the 한글 2024 open/diff of its saved files wait on P-3 and P-1.
- [ ] (Tracked AI edits are task 4.4, because they depend on E5.)

## Phase 4: Comments and track changes

- [x] 4.1 E4 Memo API in the Core, byte-level golden tests against the R2 fixtures, and a 한글 2024
  two-way round trip. [R7.1]
  API and engine fixes done (`document_core/memos.rs`). Byte-level goldens against R2 fixtures and the
  한글 2024 two-way round trip wait for the runner (P-1).
- [x] 4.2 Comments UI: rail, threads, replies, resolve, @mentions, @Redrob; storage for thread
  metadata that has no native slot (decided in this task). AI `read_comments`, `reply_comment` and
  `resolve_comment`. [R7.2, R6.1]
  Storage decided: memos for the comments, a Redrob package part for thread state. Checking that 한글 2024
  opens files carrying the part (HWPX entry, HWP 5.0 stream) waits for the runner (P-1).
- [x] 4.0 E5a revision preservation in the engine (HWPX marks and tables; HWP 5.0 raw data kept on
  the right paragraphs through edits). Flip `known-gaps.test.ts` to assert preservation. Can land
  before Phase 4. [R3.3]
  HWPX done. HWP 5.0: the raw records are kept by the engine; checking that they stay on the right
  paragraphs through edits needs files 한글 2024 writes with tracked changes (P-1).
- [x] 4.3 E5b Revision API with recording mode, golden tests against the R3 fixtures, and a 한글 2024
  two-way accept/reject test. [R8.1, R8.2]
  HWPX done (`document_core/revisions.rs`, `hwp-editor/src/revisions.ts`). Goldens against R3 fixtures, the 한글 2024
  two-way accept/reject test, HWP 5.0 revisions and tracked paragraph breaks wait for the runner (P-1).
- [x] 4.4 Suggesting and viewing modes; revision marks in the overlay; review actions; tracked AI
  edits and the AI `read_revisions`, `accept_revision` and `reject_revision` tools. [R8.1, R8.3, R6.4]
  HWPX documents. Suggesting on `.hwp` waits for HWP 5.0 revisions (P-1); formatting changes and paragraph
  breaks are not tracked yet.

## Phase 5: Versions, sharing, live typing

- [x] 5.1 Saved hook for Hangul: versions, catch-up by outline diff, restore to a copy. [R9.1]
- [x] 5.2 Share upload on first invite and on owner or editor save; open "Shared with you" Hangul
  files. [R9.2]
- [x] 5.3 E6 deterministic remote apply in the Core (A2: a remote change is a text diff applied
  through `Session.edit` with origin `remote`, so the engine needed no new entry; fuzzed in
  `packages/hwp-editor/tests/live.test.ts`). [R9.4]
- [x] 5.4 Collaboration binding (A2, one `Y.Text` per section) over `LiveHub` IPC; `meta.base`
  patching; per-person undo (`Y.UndoManager` over the local origin). Limit: only body text and
  paragraph breaks travel live; formatting, tables and memos arrive with the next save, when a clean
  view reloads the new base. [R9.3, R9.4, R9.5]
- [ ] 5.5 Done: presence faces, remote carets and selections in body text, read-only for view and
  comment roles. Open: live comment sync (comments reach others with saves). [R9.3, R9.5, R7.3]
- [ ] 5.6 Done: multi-client fuzz in CI (`packages/hwp-editor/tests/live-fuzz.test.ts`: 2 to 5
  views, late, reordered, duplicated and held-offline updates, a late joiner, undo and redo, and a
  save-and-reopen check; 16 rounds per pull request, 400 in the weekly run). Open: the same run
  against the Compose sync stack, and a 한글 2024 open check on the converged files (Windows runner).
  [R9.4]

## Phase 6: Cutover

- [ ] 6.1 Acceptance run: the R2–R9 suites green on the full Corpus, nightly, for 14 consecutive
  days. [R11.2]
- [ ] 6.2 Counsel sign-off recorded (trademarks, fonts, specification terms). [R10.7]
- [ ] 6.3 One PR that flips the default and removes `packages/rhwp-editor`,
  `resources/rhwp-studio`, the loopback studio server, the theme injection and their tests, and
  updates `NOTICE`, `AGENTS.md`, `README` and `CHANGELOG`. The fast fidelity subset becomes a
  required check. [R11.3]
- [ ] 6.4 Upstream status report: which extensions were accepted upstream and which stay in the
  fork, and the rebase plan for the next upstream tag. [R10.6]
