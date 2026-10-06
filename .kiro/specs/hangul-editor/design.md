# Design: Hangul editor on a forked rhwp core

## 1. Principles

1. **The Core owns fidelity.** Parsing, layout, pagination, painting and serialization stay in
   rhwp's Rust code. The Editor never measures or paints document content. Anything that would move
   document pixels is a Core change with a fidelity test.
2. **The Editor owns interaction.** Input, IME, caret, selection, commands, history, chrome, AI,
   comments, revisions and collaboration are ours, in TypeScript, on `@genoffice/ui`.
3. **Native formats, not side files.** Comments are HWP Memos, suggestions are HWP Revisions, and
   ids live where the format allows. A file that leaves Redrob carries its review state into 한글 2024.
4. **Patch, don't regenerate.** Saving keeps unknown records. This mirrors the Docs paragraph-patch
   rule and the `meta.base` live rule.
5. **Measured, not asserted.** Every fidelity claim is backed by the Corpus harness against 한글 2024.

## 2. What exists today (facts the design builds on)

**Engine surface.** The vendored WASM exposes `HwpDocument` with 294 methods, including:

| Area | Methods |
| --- | --- |
| Paint | `renderPageToCanvas(page, canvas, scale)`, `getPageLayerTree(page)` |
| Hit testing and geometry | `hitTest(page, x, y)` and footnote/header-footer variants, `getCursorRect*`, `getSelectionRects*` |
| Text | `insertText`, `deleteRange`, `getTextRange`, `searchText` |
| Formatting and structure | `applyCharFormat`, `applyParaFormat`, table, object, note and header/footer commands |
| History | `saveSnapshot`, `restoreSnapshot`, `discardSnapshot` |
| Save | `exportHwp`, `exportHwpx`, and their password variants |

**Engine gaps.** The binary has no API for Memos, Revisions, stable node ids, or a structured change
stream. Its model does carry memo and revision data for round-trip; strings for `memo_index`,
`memo_paragraphs`, `MEMO` fields, `RevisionDelete` and `RevisionSimpleChange` are present.

**Upstream.** rhwp is 0.8.7 (released 2026-10-06), MIT, with 85 contributors. Its Rust core uses a
CQRS layout: `src/document_core/commands`, `queries`, `serializer`, `renderer`. rhwp-studio is 287
TypeScript files, which we will not reuse at runtime but may read for reference (MIT).

**Host infrastructure we reuse:**

| Area | Where |
| --- | --- |
| Frame | `EditorFrame` (`packages/genoffice-ui/src/frame`) |
| AI loop | `AgentLoop` and `AgentSkill` (`packages/agent-core`) |
| Redrob panel parts | `RedrobParts` |
| Versions | `packages/versions` |
| Sync | `packages/sync-client` plus `services/sync` (Hocuspocus/Yjs) |
| Live rooms | the shell's `LiveHub` |
| Shell-side services | `share-service.ts`, `versions-service.ts` |

## 3. Architecture

```
┌──────────────────────────── apps/hangul (renderer, React) ─────────────────────────────┐
│ EditorFrame: toolbars · dialogs · AI panel · comments rail · versions · share · faces   │
│        │ commands / state (no document pixels)                                          │
│ ┌──────▼──────────────── packages/hwp-editor (TS, framework-free) ───────────────────┐ │
│ │ Session  ·  NodeIndex  ·  Selection/Caret  ·  Input+IME  ·  CommandBus  ·  History  │ │
│ │ ChangeStream ──► dirty · AI anchors · comments · live binding (y-hwp)               │ │
│ │ PageView: page canvases (Core paints) + OverlayLayer (we paint)                     │ │
│ └──────┬─────────────────────────────────────────────────────────────────────────────┘ │
│        │ typed wrapper (sync calls, JSON decoded once)                                  │
│ ┌──────▼──────── packages/hwp-core (WASM from redrob-labs/rhwp fork) ────────────────┐ │
│ │ parse · layout · paint · serialize · commands · queries · + our extensions (§4)    │ │
│ └────────────────────────────────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────────────────────────────┘
 main: hangul-main.ts (files, atomic save, grants) · shell: LiveHub, versions, share, identity
 node: packages/file-parse uses hwp-core (WASM runs in Node) for attachments and AI ingestion
```

### 3.1 Packages

| Package | Role | Notes |
| --- | --- | --- |
| `redrob-labs/rhwp` (new repository, fork) | Rust source of the Core, with our extensions on a `redrob` branch | MIT. Rebased onto upstream tags. Generic fixes go upstream. |
| `packages/hwp-core` | Built WASM, generated `.d.ts`, thin typed wrapper, provenance record | Artifact committed. A CI job rebuilds it from the pinned fork commit and compares checksums (Requirement 10.2). |
| `packages/hwp-editor` | Session, input, selection, commands, history, overlays, change stream, y-hwp binding | No React and no Electron, so it can be unit-tested in Vitest with the WASM in Node. |
| `apps/hangul` | React UI on `EditorFrame`, AI skill, comments UI, dialogs, IPC | The existing main and preload are kept. `studio-serve.ts`, `studio-origin.ts`, `studio-theme.ts` and the iframe go at cutover. |
| `packages/file-parse` | New `hwp` and `hwpx` case returning text with Node ids | Feeds attachments, @mentions and Home. |

This respects `AGENTS.md`: engines live in packages, chrome comes from `@genoffice/ui`, and IPC
contracts stay in `apps/hangul/src/shared/ipc.ts`.

### 3.2 Where the WASM runs

Phase 1 starts on the renderer main thread, as rhwp-studio does today. That is the simplest path,
and `renderPageToCanvas` needs an `HTMLCanvasElement`.

If the latency budget in Requirement 4.4 fails, the Core moves to a worker that paints to an
`OffscreenCanvas`. That move needs a Core change to accept an `OffscreenCanvas`, and should be
decided by measurement in task 1.9.

## 4. Core extensions in the fork

Each extension is a Rust module behind WASM bindings, with Rust tests and a fidelity test.

| # | Extension | Purpose | Notes |
| --- | --- | --- | --- |
| E1 | **Stable Node ids** for paragraphs, tables, cells, objects, notes, headers and footers | AI addressing, comments, live binding, edit-queue anchors | Engine-session identities assigned at parse and kept through every edit. **Never written to the file**: format ids (`instanceId`, `hp:p@id`) are a pattern 한글 depends on, not unique ids (research finding 1). Re-established from the base bytes across reloads and collaborators. |
| E2 | **Change stream**: every command returns a structured `Op` (node, range, before/after digest, kind) and bumps `changeSeq` | Dirty tracking, undo grouping, AI receipts, live binding | Replaces today's agent-only `onDocumentChanged`. |
| E3 | **Structured read**: `getOutline()` (sections → nodes, with type, preview and Node id) and `readNodes(ids)` (runs with resolved char/para properties) | AI context and `read_blocks` equivalents | Builds on `getTextRange` and `getCharPropertiesAt`. |
| E4 | **Memo API**: list, create, edit and delete memos anchored to a range; a reply is a memo on the same range | Requirement 7 | Built on the engine's existing memo model (`%%me` field and `MEMO_LIST` in HWP 5.0; `fieldBegin type="MEMO"` with a `subList` in HWPX). Thread metadata goes in a Redrob package part, to be checked on the runner (research finding 2). |
| E5a | **Revision preservation**: HWPX `insertBegin`/`deleteBegin` marks and `trackChanges`/`trackChangeAuthors`, and HWP 5.0 revision data, survive open, edit and save | R3.3 | A fidelity fix. Today the marks are dropped (research finding 3; pinned by `known-gaps.test.ts`). |
| E5b | **Revision API**: record insert, delete and format revisions with author and time; list, accept and reject | Requirements 8 and 6.4 | Includes a recording mode on the command layer, so suggesting mode records automatically. HWP 5.0 record layouts are learned from files saved by 한글 2024. |
| E6 | **Deterministic remote apply**: apply an `Op` from another client, addressed by Node id and offset | Live typing (§8) | — |
| E7 | **Range snapshot export/import** (`exportRange`/`importRange` of nodes with resources) | Clipboard, AI insert of rich content, live binding | Upstream `paragraph_block/import` already exists. Extend it, don't duplicate it. |
| E8 | **Font provider hook**: the host supplies font bytes for a face name; substitution decisions are reported | Requirement 2.4 and 2.5 | Upstream 0.8.7 added a host font provider. Adopt and extend it. |

Upstream policy: E1, E2, E3, E7 and E8 are generic and are proposed upstream first. E4, E5 and E6
may stay in the fork if upstream doesn't want them.

## 5. Editing core (`packages/hwp-editor`)

**Session.** Owns one `HwpDocument`, the `NodeIndex` (Node id → location, rebuilt incrementally from
the change stream), and the dirty state derived from `changeSeq` against the saved sequence.

**PageView.**
- Virtualized pages: only visible pages ±2 hold canvases.
- Each page canvas is painted by the Core.
- Device-pixel-ratio aware; zoom re-renders through the Core at the new scale and never
  CSS-scales a bitmap.

**OverlayLayer.** One absolutely positioned layer per page holding:
- caret and selection rectangles (`getCursorRect*`, `getSelectionRects*`);
- the IME preedit;
- comment highlights and suggestion marks;
- remote carets, AI pending-edit highlights, table cell selection, and object handles.

It is pure DOM or SVG and never touches document pixels.

**Input.**
- A hidden `contenteditable` textarea proxy, focused and positioned at the caret, receives keyboard
  and `beforeinput`/composition events.
- During composition the preedit is drawn in the overlay at the caret using the run's resolved font.
- On `compositionend` one `insertText` command is issued.
- This is the standard proxy pattern. It avoids the jamo loss and doubling that direct key handling
  causes. Platform IME quirks for Windows MS-IME, macOS 2-Set and Linux ibus/fcitx are covered by the
  IME test matrix (task 1.5).

**Hit testing.** Mouse position → `hitTest` → caret position. Drag extends the selection. Selection
modes are text, cell, and object.

**CommandBus.**
- Every user-facing action is a named command with `isEnabled`, `execute(params)` and a state query.
- Toolbars, shortcuts, the command search, AI tools and the live binding all go through it.
- One undo group per command.

**History.** One `saveSnapshot` per command group, capped and discarded by an LRU policy. When live,
undo becomes the y-hwp binding's per-person undo, matching the Docs rule.

**Clipboard.**
- Internal copy uses E7 range snapshots.
- External HTML and Office paste goes through upstream's `html_import` and `foreign_paste`.
- Plain text is always placed alongside as a fallback.

## 6. Chrome and design parity (`apps/hangul`)

**Frame.** `EditorFrame` gets every slot Docs fills (Requirement 5.1). The Ribbon tabs mirror 한글
2024's grouping:

| Tab | Covers |
| --- | --- |
| 편집 (Edit) | clipboard, find |
| 입력 (Insert) | table, picture, shape, equation, chart, footnote, header/footer, field, bookmark, hyperlink |
| 서식 (Format) | character, paragraph, styles, numbering |
| 쪽 (Page) | page setup, columns, borders, master page |
| 검토 (Review) | memos, track changes, compare |
| 보기 (View) | — |

The Simple toolbar mirrors Docs' SimpleToolbar.

**Dialogs.** Character shape (글자 모양) with per-language fonts, 자간, 장평, relative size and
position; paragraph shape (문단 모양); style; page setup (편집 용지); table and cell properties;
object properties; find and replace.

All dialogs are built in `@genoffice/ui`. The coverage list for Requirement 5.3 is generated in
task 0.6 from 한글 2024's menus and the Core's settable properties.

## 7. AI (`apps/hangul/src/renderer/ai`)

**Skill.** `createHangulSkill(session)` implements `AgentSkill` and is composed with the files,
search and image skills.

**Addressing.** Every tool addresses content by Node id, never by index, so Docs' "indexes shift
after edits" class of bug doesn't arise.

**Context.**
- `buildContext()` returns the outline skeleton (E3), the selection resolved to Node ids and text,
  and document stats.
- The selection is frozen for the run, as in `docs-skill.ts`.

**Tools**, named to match Docs where the meaning is the same:

| Tool | Behaviour |
| --- | --- |
| `get_document_context` | outline (Node id, type, preview), stats, selection |
| `read_blocks` | runs and properties for Node ids, as restricted HTML (same dialect as Docs), paged |
| `replace_blocks` | rewrite nodes from HTML. Formatting is inherited per role, using Docs' `inheritBlockFormatting` principle mapped to HWP char/para shapes. |
| `insert_content` | insert HTML after a node |
| `apply_commands` | batch of CommandBus commands: char/para format, style, table structure, cell format, move nodes |
| `set_header_footer` | header or footer per section and page type |
| `read_revisions` / `accept_revision` / `reject_revision` | through E5 |
| `read_comments` / `reply_comment` / `resolve_comment` | through E4 |
| `insert_image`, `generate_image`, `image_search`, `insert_chart`, `edit_chart`, `web_search`, `create_document`, `read_attachment` | shared skills or Core object commands |

**Tracked AI edits.** When `AiTrack` is set or the mode is suggesting, the Revision recording mode
(E5) is on for the duration of the tool call. One AI change is one undo group and one receipt entry.

**Rollback.** `captureSnapshot` = `saveSnapshot`; receipts roll back by snapshot.

**Plan or Run, status, receipts.** Wired exactly as in Docs (`RedrobParts`, `useRedrobPrefs`). The
preload must expose `getOfficePrefs` and `onOfficePrefsChanged`.

**Navigation and edit queue.**
- `docnav://node/<id>` links navigate to the cited node.
- Edit-queue anchors are Node id plus offset, re-resolved through the change stream. A deleted node
  resolves to null, as in Docs.

**Ingestion.** `file-parse` gets an `hwp`/`hwpx` case that runs `hwp-core` in Node and emits
markdown-like text with Node ids, so citations from attachments map back to nodes.

## 8. Collaboration: the y-hwp binding

The goal is convergence over HWP with the existing Hocuspocus/Yjs stack. The candidate design is to
mirror the editable structure into a Y.Doc, the same way y-prosemirror mirrors ProseMirror:

**Y.Doc layout**

| Key | Holds |
| --- | --- |
| `meta.base` | the version id of the base bytes. This is the existing rule. |
| `shapes` | char shapes, para shapes and styles created during the session, keyed by content hash, so concurrent creators converge on one id |
| `sections` | `Y.Array<NodeId>` per section |
| `nodes` | `Y.Map` keyed by `NodeId`, holding `{type, props, text: Y.Text (attributes = shape ids), children?}` |
| `comments` | memos, using Docs' `comments` map semantics |

**Binding**
- Local Core `Op`s (E2) become Y transactions.
- Remote Y events become Core commands applied with E6.
- Records the session didn't change are never in the Y.Doc. They come from the base bytes, so every
  view patches the same original, as Docs does.

**Fallback.** A server-ordered `Op` log, where clients rebase pending ops onto acknowledged ones. This
is simpler but needs our own transform rules for concurrent ops on the same node.

**Decision gate (task 0.5).** A spike runs both designs on a two-client fuzz test (random concurrent
edits, then convergence check and 한글 2024 open check). Pick the one that converges with fewer Core
changes.

Presence, remote carets and role rules (view/comment read-only, undo per person, others' typing
never marks a view unsaved) follow `AGENTS.md` "Sharing and live documents".

## 9. Versions and sharing

- The Hangul save path calls a hook equivalent to `setDocSavedHook`, recording versions and
  uploading for shared files.
- Restore writes a copy beside the file.
- Catch-up on open compares the Node-id outlines of the last-seen and current versions.

## 10. Fidelity harness

**Corpus**
- Public documents: government forms, court documents, school documents published as HWP/HWPX.
- rhwp's own samples where licensed.
- Customer documents stored outside the repo (Requirement 10.5).
- Each document is tagged with its features (tables, multi-column, equations, master page, vertical
  text, 장평/자간, memos, revisions, password).

**Hancom references**
- Produced on a self-hosted Windows runner with a licensed 한글 2024.
- Automated through Hancom's COM automation object (`HWPFrame.HwpObject`): open the file, save it as
  PDF through **one fixed output path**, then rasterize at 150 dpi with PDFium.
- rhwp itself warns that Hancom's PDF output differs between Hancom tools and output paths, so the
  path is fixed and recorded.
- References are cached by document and Hancom build number.

**Our renderings.** Produced through the same path the Editor uses: Electron offscreen, the Core
painting to a canvas at the same dpi. A native-only render path could pass the test while the app
still differs, so it is not used.

**Diff.** pixelmatch with anti-aliasing tolerance, producing a per-page score and a cause tag
(manual or heuristic).

**Save checks.**
- No-op round trip: our save → 한글 2024 → reference diff.
- Scripted edit scenarios: our save → 한글 2024 open (no repair prompt, detected through COM) →
  golden diff.

**CI.** Each PR runs the fast subset on the Linux job, against cached Hancom references. The full
Corpus and fresh Hancom references run nightly and on demand on the Windows runner. Neither is a
required check until cutover, after which the fast subset becomes required.

## 11. Fonts

Pixel parity is impossible with substitute fonts, so:

1. Use installed Hancom fonts when present. Government PCs normally have them.
2. Bundle only fonts with redistribution rights, such as the open fonts rhwp already ships.
   Whether Hancom's freely distributed faces (e.g. 함초롬체) may be bundled is a counsel question
   (Requirement 10.7).
3. When a face is missing, show a non-blocking "fonts substituted" status with the list, and exclude
   those pages from fidelity claims.

## 12. Provenance and IP

**Fork base.** Upstream tag v0.8.7 or later. That is after upstream removed 83 mistakenly committed
copyrighted font files from history (Legal FAQ, Issue #63).

**Provenance record.** `packages/hwp-core/provenance.json` holds:
- upstream repository, tag and commit;
- fork commit;
- `wasm-pack` and Rust toolchain versions;
- SHA-256 of every shipped artifact.

The CI job `hwp-core reproducible` rebuilds from the fork commit in Docker (upstream's `docker
compose run wasm`) and compares checksums.

**Licences**
- `NOTICE` keeps rhwp's MIT notice, replacing the rhwp-studio entry at cutover.
- `cargo-deny` runs in the fork's CI against the same allowlist as `tools/check-licenses.mjs`.
- The fork stays MIT, so upstreaming remains possible and the Apache-2.0 product stays compatible.

**Upstream's legal position.** rhwp says it was built from Hancom's published HWP specification. It
records 27 specification errata that were corrected by reading real file bytes, and relies on the
Korean Copyright Act art. 101-4 (interoperability analysis). A new engine of ours would rely on
exactly the same basis.

## 13. Cutover

**Development flag.** `REDROB_HANGUL_EDITOR=next` selects the new renderer entry in development
builds only. Packaged builds ignore the flag (Requirement 11.1).

**Removal.** When the cutover checklist (task 6.x) passes, one PR deletes:
- `packages/rhwp-editor`;
- `apps/hangul/resources/rhwp-studio`;
- `studio-serve.ts`, `studio-origin.ts` and `studio-theme.ts`, with their tests;
- the matching `AGENTS.md` and `NOTICE` text.

The same PR flips the default.

## 14. Risks

| Risk | Mitigation |
| --- | --- |
| rhwp has a fidelity ceiling for 한글 2024 | Phase 0 gate (Requirement 1) before the large UI investment |
| Memo or revision formats are under-documented | Research tasks R2 and R3 on files saved by 한글 2024; byte-level golden tests |
| Live convergence over HWP structure | Phase 0 spike with fuzzing; fallback design ready |
| IME regressions | A proxy-input pattern from day one; manual matrix plus automated composition tests |
| Fork drift | Upstream generic extensions; rebase on every upstream tag; provenance check |
| Performance on large documents | Virtualized pages, incremental `NodeIndex`, worker fallback (§3.2) |
| No Hancom runner available | Hard prerequisite: Phase 0 cannot complete without it |
| Trademark or fonts | Counsel review (Requirement 10.7) before release, not before building |
