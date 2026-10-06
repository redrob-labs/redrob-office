# Hangul live collaboration: one Y.Text per section, breaks as characters

Status: decided for spec task 0.9 (collaboration part), from the spike in task 0.5
(`tests/hangul-collab-spike`), 2026-10-06.

## Question

How do several people edit one `.hwp`/`.hwpx` file live, through the existing Hocuspocus/Yjs
service and the shell's `LiveHub`, while every view still saves through the engine?

## What was tried

Three designs, each driving real engine instances (`packages/hwp-core`) from three clients. The fuzz
ran 25 seeds × 12 rounds × 4 concurrent ops per client, with random delivery order and held-back
updates. Ops were insert, delete, paragraph split and paragraph merge.

| Design | How | Converges | Keeps intent | Cost |
| --- | --- | --- | --- | --- |
| A: `Y.Array<Y.Text>` per paragraph | Split = delete tail + new `Y.Text` | yes (25/25) | **no**: text typed concurrently into a moving tail stays behind in the first paragraph (`intent.test.ts`) | low |
| **A2: one `Y.Text` per section, `\n` as paragraph break** | Split = insert a break, merge = delete it | yes (25/25) | yes | low; no transform rules |
| B: server-ordered op log with client rebase | Server transforms each op against the ops ordered since its base | yes (25/25, without merge) | yes | `transform` needs a rule per ordered pair of op kinds: 9 for three kinds, growing quadratically with tables, cells, objects, notes and formatting |

## Decision

**A2.** It converges, keeps intent in the case that breaks A, and needs no hand-written transform
rules. Yjs owns convergence and the engine is a projection, so growing the edit vocabulary means
growing the mapping, not a quadratic table. It also reuses everything Docs already runs: Hocuspocus,
`LiveHub`, per-person `Y.UndoManager`, awareness for carets, and the `meta.base` rule.

Production shape:

- **Sections and text.** One `Y.Text` per section body; each paragraph break is a `\n` carrying the
  paragraph's properties (para shape, style) as Y formatting attributes. Runs carry char-shape ids as
  attributes. Shapes created during a session go in the `shapes` map keyed by content hash
  (design §8), so two people creating the same shape converge on one id.
- **Controls.** Tables, pictures, equations, footnotes and other controls are Y embeds that hold
  their own Y types. Table cells hold their own `Y.Text`.
- **Headers, footers, master pages, memos** each get their own `Y.Text`, keyed by Node id.

## Findings that bind the implementation

1. **Project from Y event deltas, not by diffing text.** The spike reconciles by text, which proves
   convergence but would move char shapes on untouched runs. The binding (task 5.4) applies each
   delta as engine commands, which is what E6 (deterministic remote apply) is for.
2. **Offsets differ.** The engine counts code points (an emoji is one); Yjs counts UTF-16 units.
   The binding maps between them. The spike stayed in the BMP.
3. **Convergence is judged on glyphs, not on the layer tree.** Two engines with the same text can
   group runs differently depending on edit history (`"가나" + "다"` is one run in one view and two in
   another) while every glyph lands on the same pixel. `src/paint.ts` compares positioned glyphs and
   non-text ops. Saved bytes may differ in run segmentation for the same reason, which is harmless to
   한글 but means byte-identical saves are not the test.
4. **Undo when live** is `Y.UndoManager` scoped to the local origin, as in Docs. The engine's
   snapshot history is off while live.

## Not decided here

Ratifying the fidelity threshold (the rest of task 0.9) needs 한글 2024 references from the runner
(P-1), as does the engine fitness decision (task 0.8).
