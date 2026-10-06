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
- [ ] P-2 Create the `redrob-labs/rhwp` repository as a fork of `edwardkim/rhwp`.
- [ ] P-3 Corpus sources: public documents identified; a storage location for customer documents
  outside the repo.
- [ ] P-4 Counsel engaged for the trademark, font and specification-terms review [R10.7].

## Phase 0: Foundations and gates

- [ ] 0.1 Fork rhwp at tag v0.8.7. Build the WASM in Docker. Add `packages/hwp-core` with the
  artifact, generated types and `provenance.json`. Add the `hwp-core reproducible` CI job.
  [R10.1, R10.2]
- [ ] 0.2 Add `cargo-deny` licence checks to the fork's CI. Extend the root `NOTICE` for rhwp core
  (MIT). [R10.3]
- [ ] 0.3 Fidelity harness:
  - Corpus manifest with feature tags.
  - Hancom reference generator: COM open → fixed PDF path → PDFium 150 dpi.
  - Electron offscreen renderer for the Core.
  - pixelmatch diff and HTML report.
  [R1.1, R1.2, R2.2]
- [ ] 0.4 No-op save round trip for `.hwp` and `.hwpx` through 한글 2024 in the harness. [R1.4, R3.1]
- [ ] 0.5 Live-collaboration spike: y-hwp mirror versus server-ordered op log. Two-client fuzz test;
  check convergence and that 한글 2024 opens the result. [R9.4]
- [ ] 0.6 Generate the 한글 2024 formatting coverage list for every supported object [R5.3] and the
  shortcut map [R4.2].
- [ ] 0.7 Research:
  - R1: Node id slots in HWP 5.0 and HWPX.
  - R2: Memo records in files saved by 한글 2024, both formats.
  - R3: Revision records, both formats.
  Each produces golden fixture files and a written finding. [R7.1, R8.2]
- [ ] 0.8 🚦 **Engine fitness decision**: continue with rhwp or build a new engine, based on the
  reports from 0.3 and 0.4, with failure causes classified. [R1.3]
- [ ] 0.9 🚦 **Collaboration design decision** from 0.5. Fidelity threshold ratified for R2.2.

## Phase 1: Core extensions and editing core

- [ ] 1.1 E1 stable Node ids (Rust, with round-trip tests in both formats). Propose upstream. [R6.1]
- [ ] 1.2 E2 change stream (`Op`, `changeSeq`). Propose upstream. [R4.5]
- [ ] 1.3 E3 `getOutline` and `readNodes`. E8 font provider hook with a substitution report.
  [R2.4, R2.5, R6.1]
- [ ] 1.4 `packages/hwp-editor`: Session, NodeIndex, PageView (virtualized, DPR-aware zoom),
  OverlayLayer. [R2.1, R2.3]
- [ ] 1.5 Input proxy and IME: preedit overlay, composition commit. Automated composition tests plus
  a manual matrix for Windows MS-IME, macOS 2-Set and Linux ibus/fcitx. [R4.1]
- [ ] 1.6 Hit testing, caret and selection (text, cell, object). Keyboard navigation and the
  shortcut map from 0.6. [R4.2]
- [ ] 1.7 CommandBus and History (snapshot groups); editing in the body, tables, headers and
  footers, notes and text boxes; object move and resize. [R4.2, R4.3]
- [ ] 1.8 Clipboard: E7 range export and import (extending upstream `paragraph_block/import`), HTML
  and Office paste. [R4.2]
- [ ] 1.9 Performance benchmark on a 100-page Corpus document. Decide whether to move the Core into
  a worker. [R4.4]
- [ ] 1.10 Open, save and Save As through the existing main and preload: atomic writes, password
  documents, dirty tracking from `changeSeq`. Add the development flag `REDROB_HANGUL_EDITOR=next`.
  [R3.4, R3.6, R4.5, R11.1]
- [ ] 1.11 Harness: scripted edit scenarios saved and checked in 한글 2024 for both formats. Run in
  CI nightly. [R3.2, R3.3, R3.5]

## Phase 2: Chrome and design parity

- [ ] 2.1 Fill every `EditorFrame` slot that Docs fills: undo/redo, save status, search with Ask,
  file menu, mode, banner, status line. [R5.1]
- [ ] 2.2 Classic Ribbon: 편집 / 입력 / 서식 / 쪽 / 검토 / 보기 tabs on `Toolbar`, driven by
  CommandBus state. Simple toolbar. [R5.1, R5.3]
- [ ] 2.3 Dialogs on `@genoffice/ui`: character shape (per-language font, 자간, 장평), paragraph
  shape, style, page setup, table and cell, object, find and replace. [R5.3]
- [ ] 2.4 Insert flows: table, picture, shape, equation, chart, footnote and endnote,
  header/footer, field, bookmark, hyperlink. [R5.3]
- [ ] 2.5 i18n strings in both locales; visual baselines in `tests/visual`; accessibility pass.
  [R5.4, R5.5]
- [ ] 2.6 Coverage check: every item from 0.6 is reachable, verified by an automated test over
  CommandBus. [R5.3]

## Phase 3: AI

- [ ] 3.1 `createHangulSkill`: context, selection frozen per run, Node-id addressing. Compose it
  with the files, search and image skills. [R6.1]
- [ ] 3.2 Read tools: `get_document_context`, `read_blocks` (the Docs restricted-HTML dialect
  mapped to HWP shapes). [R6.1, R6.2]
- [ ] 3.3 Write tools: `replace_blocks` and `insert_content` with formatting inheritance;
  `apply_commands`; `set_header_footer`; tables and cells; text boxes. [R6.2, R6.3]
- [ ] 3.4 Media and shared tools: images, charts, search, attachments, `create_document`. [R6.1]
- [ ] 3.5 AI panel on the Agent parts: Plan or Run, status line, receipts with rollback by
  snapshot, fail-closed errors. Preload exposes `getOfficePrefs` and `onOfficePrefsChanged`.
  [R6.5, R6.6]
- [ ] 3.6 `docnav://node/<id>` navigation and edit-queue anchors that move with edits. [R6.7]
- [ ] 3.7 `file-parse` case for hwp and hwpx (hwp-core in Node). Turn Home's `ai: false` on for
  Hangul. Composer and attachment tests. [R6.8]
- [ ] 3.8 AI evaluation set on Corpus documents: tasks for rewrite, restructure, tables and
  headers, checked by a fidelity diff after a 한글 2024 open. [R6.2, R3.2]
- [ ] (Tracked AI edits are task 4.4, because they depend on E5.)

## Phase 4: Comments and track changes

- [ ] 4.1 E4 Memo API in the Core, byte-level golden tests against the R2 fixtures, and a 한글 2024
  two-way round trip. [R7.1]
- [ ] 4.2 Comments UI: rail, threads, replies, resolve, @mentions, @Redrob; storage for thread
  metadata that has no native slot (decided in this task). AI `read_comments`, `reply_comment` and
  `resolve_comment`. [R7.2, R6.1]
- [ ] 4.3 E5 Revision API with recording mode, golden tests against the R3 fixtures, and a 한글 2024
  two-way accept/reject test. [R8.1, R8.2]
- [ ] 4.4 Suggesting and viewing modes; revision marks in the overlay; review actions; tracked AI
  edits and the AI `read_revisions`, `accept_revision` and `reject_revision` tools. [R8.1, R8.3, R6.4]

## Phase 5: Versions, sharing, live typing

- [ ] 5.1 Saved hook for Hangul: versions, catch-up by outline diff, restore to a copy. [R9.1]
- [ ] 5.2 Share upload on first invite and on owner or editor save; open "Shared with you" Hangul
  files. [R9.2]
- [ ] 5.3 E6 deterministic remote apply in the Core. [R9.4]
- [ ] 5.4 Collaboration binding (the design chosen in 0.9) over `LiveHub` IPC; `meta.base`
  patching; per-person undo. [R9.3, R9.4, R9.5]
- [ ] 5.5 Presence faces, remote carets, read-only enforcement for view and comment roles; live
  comment sync. [R9.3, R9.5, R7.3]
- [ ] 5.6 Multi-client fuzz suite in CI against the Compose sync stack, plus a 한글 2024 open check
  on the converged files. [R9.4]

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
