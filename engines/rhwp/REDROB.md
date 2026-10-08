# engines/rhwp: Redrob's fork of the rhwp engine

> 본 제품은 한글과컴퓨터의 한글 문서 파일(.hwp) 공개 문서를 참고하여 개발하였습니다.
> (Hancom's HWP specification requires this statement in a product's source, user interface,
> manual and help; see `docs/decisions/2026-10-hangul-format-research.md`, finding 4.)

This directory holds the Rust source of [rhwp](https://github.com/edwardkim/rhwp) (MIT, Copyright
(c) 2025-2026 Edward Kim), the HWP/HWPX engine behind the Hangul editor. It is built to WebAssembly
into `packages/hwp-core` (see `scripts/build-hwp-core.sh`).

The spec planned a separate `redrob-labs/rhwp` repository. Creating one was not possible from the
build environment (GitHub returned 403 for both fork and create), so the fork lives here instead.
Provenance is pinned the same way either way. If the repository is created later, this directory can
move there with its history intact.

## What was taken

From upstream tag `v0.8.7`, commit `1a76570e833917d15817415a53c09ad61ab3203f`:

| Path | What |
| --- | --- |
| `src/`, `crates/`, `vendor/`, `build.rs` | the engine and its in-tree crates |
| `Cargo.toml`, `Cargo.lock`, `rust-toolchain.toml`, `rustfmt.toml` | the build, toolchain-pinned |
| `LICENSE`, `THIRD_PARTY_LICENSES.md` | upstream's licence and its dependency licences |
| `llms.txt`, `mydocs/manual/…`, `mydocs/tech/agent_roadmap/atlas_r1_r200.md`, `assets/logo/logo-32.png`, `saved/blank2010.hwp`, `ttfs/opensource/NotoSansKR-Regular.ttf` | files the engine embeds with `include_str!` / `include_bytes!` |

Not taken: upstream's `samples/`, `tests/`, `tools/`, `rhwp-studio/`, browser extensions and the
rest of `mydocs/`. Upstream's 3,400+ Rust tests run in upstream's CI. Our tests of the engine live
in `packages/hwp-core/tests` and in the fork changes' own Rust tests.

`saved/blank2010.hwp` is upstream's blank 한글 2010 template, which the engine uses for new documents.
`NotoSansKR-Regular.ttf` is SIL OFL 1.1.

## What was changed

| Change | Why |
| --- | --- |
| `Cargo.toml`: workspace members reduced to `.` and `crates/*`; test and example targets removed | Those targets point at directories not taken |
| `Cargo.lock`: 324 lines of packages used only by the removed members pruned. No version changed. | Keeps `--locked` builds working |
| **E1/E3** `src/document_core/node_ids.rs` (new); `Paragraph.node_id` (`#[serde(skip)]`, reset on split); `DocumentCore.next_node_id`; `ir_field_sweep.rs` ignores the field; WASM `getOutline`, `locateNode`, `nodeIdAt`, `nodeIdInCell`, `readNodes` | Session node ids, never written to a file, and a structured outline for AI and anchors. Upstream's 3,874 lib tests pass with the change. |
| **Fix** `paginate_pass` (`src/document_core/queries/rendering.rs`), `DocumentCore.pagination_carry_in` | A clean section kept cached page numbers after an earlier section gained or lost pages, so new pages showed the previous page's number until reopen (on screen only; the saved file was right). A section is now repaginated when its incoming page-number carry changed. Found by the edit scenarios; `packages/hwp-core/tests/page-numbers.test.ts`. Upstream's 3,874 lib tests pass. Candidate for upstream. |
| **Perf** `apply_char_format_native`, `apply_para_format_native`, `set_para_shape_id_native` and both branches of `apply_style_native` (`src/document_core/commands/formatting.rs`) call `rebuild_paragraph_deferred_in_batch` instead of `rebuild_section` | They repaginated the whole section on every call even in batch mode, about 2 s each on a 763-page document, so one AI paragraph rewrite took 14 s. In batch mode they now mark the section dirty and recompose the paragraph, and `endBatch` paginates once (1.9 s for the same rewrite). Outside a batch nothing changes. `packages/hwp-core/tests/batch-format.test.ts` checks that batched and unbatched edits give identical pages and saved formatting. Upstream's 3,874 lib tests pass. Candidate for upstream. |

The WASM built from this trimmed tree is byte-identical to the one built from upstream's full tree
at the same commit (`rhwp_bg.wasm` SHA-256 `4341553724c8…`), so trimming changed nothing in the engine.

Engine extensions from the spec (E1–E8) are added here as separate commits. Each is listed in this
table when it lands.

## Rebasing on a new upstream tag

1. Clone upstream at the new tag.
2. Replace the taken paths above.
3. Re-apply the commits listed under "What was changed".
4. Run `pnpm --filter @genoffice/hwp-core build:wasm` and `pnpm --filter @genoffice/hwp-core test`.
5. Update `upstream` in `packages/hwp-core/provenance.json` and the commit in `NOTICE`.

## Upstreaming

Generic changes (stable ids, change stream, structured read, range export, font provider) are meant
to be offered upstream. Upstream takes PRs against `devel`.
