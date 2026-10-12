# Hangul engine: upstream status and rebase plan

Spec task 6.4 (R10.6). This report covers our fork of rhwp (`engines/rhwp`, from tag `v0.8.7`,
commit `1a76570e`) and upstream ([edwardkim/rhwp](https://github.com/edwardkim/rhwp), MIT). The
per-change record is `engines/rhwp/REDROB.md`. This page covers where each change stands upstream
and how the next rebase will go.

Measured on 2026-10-06 against the GitHub API.

## Upstream today

- The latest tag is still `v0.8.7`, the same as the fork. It was tagged on 2026-10-06.
- `devel`, where upstream takes pull requests, is 85 commits ahead of the tag. Most of those
  commits are working notes under `mydocs/`.
- The engine changes since the tag touch 30 files under `src/`, nearly all of them typesetting
  and layout: `renderer/typeset/**`, `float_placement.rs`, `table_layout.rs`, `inline_flow.rs` and
  the equation renderer. `crates/` and `Cargo.*` are unchanged.
- None of the 16 WASM entry points the fork adds exist on upstream's `devel`: `getOutline`,
  `readNodes`, `locateNode`, `nodeIdAt`, `nodeIdInCell`, `listMemos`, `addMemo`, `setMemoBody`,
  `removeMemo`, `listRevisions`, `addRevision`, `removeRevision`, `getRedrobComments`,
  `setRedrobComments`, `insertChart` and `setColumnWidths`. Upstream's `getOutlineNavigation` and `getStructure` are different things
  (outline numbering and clause structure), and neither collides with ours.

## Extensions accepted upstream

None. No change has been offered yet:

- A pull request to upstream needs a GitHub fork of `edwardkim/rhwp`.
- Creating `redrob-labs/rhwp` returned 403 for both fork and create (task P-2). So the changes live
  in `engines/rhwp`, and there is no branch to open a pull request from.
- None of upstream's latest 100 pull requests, open or closed, comes from Redrob.

## Each change, and where it should go

The design's policy is §4: E1, E2, E3, E7 and E8 are generic and are offered upstream first. E4, E5
and E6 may stay in the fork.

| Change | Engine code | Plan | Why |
| --- | --- | --- | --- |
| **E1/E3** node ids, `getOutline`, `readNodes`, plus the `split_at` id fix | `node_ids.rs` (new), `Paragraph.node_id`, `wasm_api.rs` | **Offer upstream** | Generic. The ids are never written to a file, and upstream's 3,874 lib tests pass with the change. |
| **E2** change stream | none (in `packages/hwp-editor` `Session.edit`) | Nothing to offer | It was built at the editor's single mutation entry, not in the engine. |
| **E6** remote apply | none (a text diff through `Session.edit`) | Nothing to offer | Same as E2. |
| **E7** range export/import | none (upstream's `paragraph_block` import, used as is) | Nothing to offer | — |
| **E8** font provider | none (`packages/hwp-editor/src/fonts.ts`, `apps/hangul/src/main/hancom-fonts.ts`) | Nothing to offer | Layout already uses the engine's metrics and embedded fonts. Upstream's `registerExactFontSource` and `getFontDecisionTrace` are used unchanged. |
| **E4** memo API, plus the HWP 5.0 memo-body fix | `memos.rs` (new), `parser/body_text.rs`, `serializer/body_text.rs`, `wasm_api/hyperlink.rs` | **Offer the parser fix; keep the API in the fork for now** | The fix (`attach_memo_tail`) is a fidelity bug upstream also has. The API is generic but shaped by our thread model, so offer it after the fix lands. |
| **E5a** HWPX revision preservation | `model/paragraph.rs`, `parser/hwpx/section.rs`, `parser/hwpx/header.rs`, `serializer/hwpx/*` | **Offer upstream** | A fidelity fix: tracked changes are dropped on save without it. |
| **E5b** revision API | `revisions.rs` (new) | Keep in the fork | It records with our authors and dates, and its HWP 5.0 layouts still wait for the 한글 2024 runner (P-1). |
| **4.2** Redrob comment part | `model/document.rs`, `parser/mod.rs`, `serializer/cfb_writer.rs`, `serializer/hwpx/mod.rs` | Keep in the fork | Redrob-specific: it writes `META-INF/redrob-comments.json` and `/RedrobComments`. |
| Chart creation (not a spec extension; `REDROB.md` called it E7 until this report) | `crates/rhwp-ooxml-chart/src/writer.rs` (new), `chart_create.rs` (new), the HWP fold | **Offer upstream** after the runner check | Generic. 한글 2024 has not opened the files yet (P-1). |
| **Fix** unequal column widths (HWPX absolute ↔ HWP 5.0 shares) | `text_editing.rs`, `serializer/control.rs`, `serializer/hwpx/section.rs`, `serializer/hwpx/context.rs` | **Offer upstream** after the runner check | A save bug in both directions. |
| **Fix** page numbers after an earlier section's page count changes | `queries/rendering.rs` (`paginate_pass`), `DocumentCore.pagination_carry_in` | **Offer upstream** | A screen-only stale page number. Upstream's layout work since the tag touches `rendering.rs`, so check first whether upstream fixed it another way. |
| **Perf** batch formatting rebuilds only the paragraph | `commands/formatting.rs` | **Offer upstream** | About 2 s saved per call on a 763-page document. Upstream changed `formatting.rs` since the tag, so rebase first. |
| Build trim (workspace members, `Cargo.lock` pruning) | `Cargo.toml`, `Cargo.lock` | Keep in the fork | It only exists because we did not take upstream's tests and tools. |

So seven changes are ready to offer upstream: E1/E3, E5a, the memo-body fix, the pagination fix,
the batch-formatting fix, and, after the runner check, chart creation and the column fix. Four stay
in the fork: E4's API (for now), E5b, the comment part and the build trim.

## Rebase plan for the next upstream tag

The fork and upstream's `devel` touch only two files in common:

- `src/document_core/queries/rendering.rs`: upstream changed it 4 times since the tag, and we
  changed `paginate_pass`.
- `src/document_core/commands/formatting.rs`: upstream changed it 3 times, and we changed the
  batch rebuild calls.

Every other fork change is in a file upstream has not touched since `v0.8.7`, or in a new file. A
rebase onto the next tag should therefore be mechanical except for those two files.

1. Wait for the next tag (`v0.8.8` or later). Do not rebase onto `devel`: the fork pins tags, and
   `provenance.json` records one.
2. Follow `engines/rhwp/REDROB.md` § "Rebasing on a new upstream tag": replace the taken paths,
   then re-apply the fork's commits in the order the table lists them.
3. In `rendering.rs`, check whether upstream's typesetting work already repaginates a section when
   its incoming page number changes. If it does, drop our fix and keep its regression test. If not,
   re-apply `pagination_carry_in`.
4. In `formatting.rs`, re-apply `rebuild_paragraph_deferred_in_batch` in place of
   `rebuild_section`, after reading upstream's changes to those functions.
5. Run upstream's lib tests (`cargo +1.93.1 test -p rhwp --lib --locked`; 3,888 pass on the fork
   today), then `pnpm --filter @genoffice/hwp-core build:wasm`, the `hwp-core`, `hwp-editor` and
   `hangul` suites, and the fidelity subset.
6. Update `packages/hwp-core/provenance.json`, the commit in `NOTICE` and the "What was taken"
   section of `REDROB.md`.

## What it takes to start upstreaming

- A GitHub fork of `edwardkim/rhwp` under an account that can push. It can also serve as the
  `redrob-labs/rhwp` home that P-2 planned.
- One pull request per change in the "Offer upstream" rows, against `devel`, following upstream's
  `CONTRIBUTING.md`. Each one carries its Rust tests.
- When a change is accepted, mark it in `REDROB.md`. The next rebase then takes it from upstream
  and drops our copy.
