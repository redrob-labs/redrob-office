# Requirements: Hangul editor (`.hwp` / `.hwpx`) on an owned editor and a forked rhwp engine

## Introduction

Redrob Hangul today embeds the prebuilt rhwp-studio web app in an iframe and drives it through the
`@rhwp/editor` postMessage SDK (`apps/hangul`, `packages/rhwp-editor`). That gives correct HWP
layout but no Redrob chrome inside the page, no AI, no comments, no suggesting mode, no versions
wiring, and no live typing.

This spec replaces rhwp-studio with an editor we own (option D in the research) on top of a fork of
the rhwp Rust/WASM core (`edwardkim/rhwp`, MIT). rhwp stays responsible for parsing, layout,
painting and saving, which is where Hancom fidelity lives. Everything above it is ours: input,
caret, selection, Korean IME, toolbars and dialogs, AI, comments, track changes, versions and
collaboration.

Calibrated decisions (from the user, 2026-10-06):

- Both visual parity and feature parity with Docs are required.
- Output must be pixel-perfect against **Hancom Office 한글 2024**, because government users use Hancom.
- `.hwp` and `.hwpx` have equal priority.
- AI must reach Docs-level depth from the first release, including tables, headers and footers,
  and tracked suggestions.
- Models are cloud models through the Redrob engine.
- The cutover is one go: rhwp-studio is removed when the new editor ships, with no user-facing
  fallback.
- An entirely new HWP engine is out of scope unless the engine fitness gate (Requirement 1) shows
  that one would serve users better.

## Glossary

- **Core**: our fork of the rhwp Rust crate, built to WASM, which parses, lays out, paints and serializes.
- **Editor**: our TypeScript/React editor in `apps/hangul` that drives the Core.
- **Corpus**: the fidelity reference set of real `.hwp`/`.hwpx` documents.
- **Hancom reference**: a rendering of a Corpus document produced by 한글 2024 on Windows through
  one fixed output path.
- **Node id**: a stable identifier of a paragraph, table, cell or object that survives edits, saves and reloads.
- **Memo**: HWP's native comment (`MEMO` field plus memo shape in HWP 5.0, and the equivalent in OWPML/HWPX).
- **Revision**: HWP's native tracked change (변경 추적).

## Requirements

### Requirement 1: Engine fitness gate

**User story:** As the product owner, I want evidence that rhwp can reach Hancom 2024 fidelity
before we build on it, so that we don't commit to an engine with a ceiling.

#### Acceptance criteria

1. WHEN the Corpus and Hancom references exist THEN the system SHALL produce a per-page, per-document
   pixel-diff report of the Core against the Hancom references.
2. The report SHALL classify every failing page by cause: font, line breaking, table, object
   placement, equation, numbering, or other.
3. IF any failure class is caused by a Core architecture limit rather than a bug or missing
   feature THEN the team SHALL record a written decision on whether to continue with rhwp or build
   a new engine before Phase 2 starts.
4. The gate SHALL also measure no-op save fidelity: open, save unchanged, render in 한글 2024, and
   compare with the original.

### Requirement 2: Rendering fidelity

**User story:** As a government user, I want a document to look exactly as it does in 한글 2024, so
that what I approve is what gets filed.

#### Acceptance criteria

1. The Editor SHALL paint document content only through the Core's renderer. Editor code SHALL NOT
   lay out or paint document text, tables or objects itself.
2. WHEN a Corpus document is opened THEN each page SHALL match its Hancom reference within the
   agreed threshold. The default is 0 differing pixels after anti-aliasing tolerance at 150 dpi;
   the threshold is ratified in Phase 0.
3. Overlays (caret, selection, comment highlights, suggestion marks, remote carets) SHALL be drawn
   on a separate layer and SHALL NOT change the document pixels.
4. WHEN a document uses a font that is not installed THEN the Editor SHALL show which font was
   substituted and SHALL NOT claim fidelity for that page.
5. The Editor SHALL use Hancom fonts installed on the user's machine when present. It SHALL bundle
   only fonts whose licences allow redistribution in Redrob Office.

### Requirement 3: Save fidelity, HWP and HWPX equally

**User story:** As a user who sends files to Hancom users, I want files I save to open in 한글 2024
exactly as intended, in either format.

#### Acceptance criteria

1. WHEN a `.hwp` or `.hwpx` file is opened and saved unchanged THEN 한글 2024 SHALL render it
   identically to the original.
2. WHEN a scripted edit scenario from the Corpus suite is applied and saved THEN 한글 2024 SHALL
   open it without repair prompts, and its rendering SHALL match the scenario's golden rendering.
3. Saving SHALL preserve every record the Editor does not understand, byte-for-byte where the format
   allows.
4. A save SHALL be atomic. The existing `atomicWriteFile` semantics SHALL be kept.
5. `.hwp` and `.hwpx` SHALL each pass the same fidelity suite. Neither format is degraded to favour
   the other.
6. Encrypted (password) documents SHALL open and save with their password protection intact.

### Requirement 4: Editing core

**User story:** As a Korean writer, I want typing, selection and editing to feel native.

#### Acceptance criteria

1. Hangul IME composition SHALL show the preedit text inline at the caret and commit without lost or
   doubled jamo, on Windows, macOS and Linux.
2. The Editor SHALL support:
   - caret movement and selection by mouse and keyboard, with the 한글 2024 default shortcuts where
     they don't conflict with the shell;
   - editing in the body, tables (including cell selection), headers and footers, footnotes and
     endnotes, and text boxes;
   - picture and shape selection, move and resize;
   - clipboard copy and paste within the app, from HWP, and from HTML and Office sources.
3. Undo and redo SHALL group edits per user action, and an AI change SHALL be one undo step.
4. On a 100-page Corpus document, keystroke-to-paint latency SHALL be ≤ 50 ms at the 95th
   percentile on the reference machine.
5. Every user edit SHALL mark the document dirty. This fixes the current agent-only dirty signal.

### Requirement 5: Redrob chrome and design parity

**User story:** As a user moving between Docs and Hangul, I want the same frame, toolbars and dialogs.

#### Acceptance criteria

1. The Editor SHALL fill every `EditorFrame` slot that Docs fills:
   - undo and redo, save status, presence faces, share, search with Ask, file menu;
   - mode (editing, suggesting, viewing), banner, simple and classic toolbars;
   - rail, AI panel, and status line.
2. All chrome SHALL be built from `@genoffice/ui` and SHALL pass `pnpm check:ui-tokens`. No
   rhwp-studio UI SHALL remain.
3. Every formatting capability that 한글 2024 exposes for a supported object SHALL be reachable from
   the classic toolbar, a dialog or the command search. This covers character (자간, 장평, 글꼴 per
   language), paragraph, style, page, table, cell and object formatting. The coverage list is fixed
   in Phase 0.
4. All user-visible strings SHALL be in both locales in `packages/i18n` or the app's i18n files.
5. The surfaces SHALL be covered by the visual regression suite in `tests/visual`.

### Requirement 6: AI at Docs-level depth

**User story:** As a user, I want Redrob to read, rewrite, restructure and format Hangul documents
as it does in Docs.

#### Acceptance criteria

1. Hangul SHALL provide an `AgentSkill` with tools equivalent to Docs':
   - context, read, insert, replace, and formatting/structure commands;
   - revisions and comments;
   - images, charts, headers and footers, search, attachments, and create document.
   Every tool SHALL address content by Node id.
2. The skill SHALL edit body paragraphs, tables, cells, headers and footers, footnotes, and text boxes.
3. WHEN the AI rewrites content THEN the formatting of the replaced content SHALL be inherited on
   the same principle as Docs' `inheritBlockFormatting`.
4. WHEN suggesting mode is on or the AI is set to track THEN AI changes SHALL be recorded as native
   HWP Revisions, visible and acceptable in 한글 2024.
5. Plan or Run, the status line, and receipts with a change count and rollback SHALL work as in Docs.
6. A failed engine turn SHALL be visible and SHALL NOT fall back silently (AGENTS.md fail-closed rule).
7. `docnav`-style citations SHALL navigate to the cited node, and edit-queue anchors SHALL move with edits.
8. `.hwp` and `.hwpx` SHALL be readable by `packages/file-parse`, so attachments, @mentions and the
   Home composer accept them. The Home `ai: false` flag for Hangul SHALL be removed.

### Requirement 7: Comments as native memos

**User story:** As a reviewer, I want comments that 한글 2024 users also see.

#### Acceptance criteria

1. Comments SHALL be stored as native Memos in both formats, and SHALL round-trip with 한글 2024 in
   both directions.
2. Threads, replies, resolve, @mentions and @Redrob SHALL work as in Docs. Thread metadata that has
   no native representation SHALL be stored without breaking 한글 2024 opening. The mechanism is
   decided in design.
3. Live comment sync SHALL follow Docs' shared `comments` map semantics when the file is shared.

### Requirement 8: Track changes and suggesting mode

**User story:** As an editor, I want to suggest changes that others accept or reject, here or in 한글 2024.

#### Acceptance criteria

1. Suggesting mode SHALL record insertions, deletions and formatting changes as native Revisions.
2. Revisions authored in 한글 2024 SHALL be shown and SHALL be acceptable or rejectable here, and the
   reverse SHALL also hold.
3. Viewing mode SHALL be read-only.

### Requirement 9: Versions, sharing and live typing

**User story:** As a team member, I want Hangul files to have the same history, sharing and live
editing as Docs files.

#### Acceptance criteria

1. Every Hangul save SHALL be recorded in `packages/versions` with catch-up on open. A restore SHALL
   write a copy and SHALL never overwrite the file.
2. Sharing SHALL upload on first invite and on owner or editor saves, as Docs does.
3. Live typing, remote carets and presence SHALL work through `services/sync` (Hocuspocus) and the
   shell's `LiveHub`. The token SHALL stay in main.
4. Concurrent edits SHALL converge. Every live view SHALL patch the same base bytes (the Docs
   `meta.base` rule), and the file on disk SHALL never be written behind an open editor.
5. View and comment roles SHALL be read-only when live. Undo SHALL be scoped to the person.

### Requirement 10: Fork provenance and IP hygiene

**User story:** As the company, I want our use of rhwp to be traceable and licence-clean.

#### Acceptance criteria

1. The fork SHALL start from a tagged upstream release (v0.8.7 or later) that is after upstream's
   font-history cleanup.
2. A provenance record SHALL pin the upstream commit and the fork commit, with checksums of the
   built WASM. CI SHALL fail when the shipped binary doesn't match the record.
3. `NOTICE` SHALL carry rhwp's MIT notice. `check:licenses` SHALL cover the Core's Rust and npm
   dependencies, through a Rust licence check such as `cargo-deny` against the same allowlist.
4. No Hancom-owned font, sample document or binary SHALL be committed unless its licence permits it.
5. Corpus documents from customers SHALL stay outside the repository.
6. Changes that are generic engine improvements SHALL be offered upstream where practical, to limit
   fork drift.
7. Counsel SHALL review, before release:
   - the product name "Redrob Hangul" against Hancom's "한글", "HWP" and "HWPX" trademarks;
   - Hancom font use;
   - the HWP/OWPML specification terms.

### Requirement 11: One-go cutover

**User story:** As the product owner, I want users to switch editors once.

#### Acceptance criteria

1. Until cutover, the new Editor SHALL be reachable only behind a development flag that is
   unavailable in packaged builds.
2. Cutover SHALL happen only when Requirements 2–9 pass their acceptance suites.
3. At cutover, `packages/rhwp-editor`, `apps/hangul/resources/rhwp-studio` and the loopback studio
   server SHALL be deleted, along with their tests, NOTICE entries and the `AGENTS.md` sections that
   describe them.
