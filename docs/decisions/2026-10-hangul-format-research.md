# Hangul format research: node ids, memos, tracked changes, specification terms

Status: findings for spec task 0.7 (R1, R2, R3), 2026-10-06. Updates the design for E1, E4 and E5.

## Sources

| Source | What it is |
| --- | --- |
| `engines/rhwp` (rhwp v0.8.7) | The engine's parser and serializer, and upstream's measurements against 한글 2022/2024 recorded in code comments |
| 한글 문서 파일 형식 5.0, revision 1.3 | Hancom's published HWP 5.0 specification. Upstream ships it as `samples/한글문서파일형식_5.0_revision1.3.hwp` (sha256 `f21edf21…efd1d`); it was read with our own engine. |
| [hancom-io/hwpx-owpml-model](https://github.com/hancom-io/hwpx-owpml-model) | Hancom's OWPML (HWPX, KS X 6101) object model, Apache-2.0 |
| Upstream samples | `field-01-memo.hwp` (`d991aad9…`), `issue5169_viewtext_changetracking.hwp` (`c003cdb0…`), `hwpx/aift.hwpx`, and a scan of all 579 HWPX samples |

Upstream's samples are third-party documents whose licences aren't recorded, so none was copied
into this repository. The one fixture added (`packages/hwp-core/tests/fixtures/tracked-changes.hwpx`)
is our own `sample.hwpx` with revision marks written by hand from the OWPML model.

## Finding 1: node ids (R1). Format ids are not identities.

**Paragraphs.**
- HWP 5.0 has a 4-byte `instanceId` in `PARA_HEADER`, and HWPX has `<hp:p id>`. The engine maps one
  onto the other (`parser/hwpx/section.rs`, Task #1058).
- Upstream's measurement against Hancom's output: 한글 writes `0` or `0x80000000` there for nearly
  every paragraph. The values are a pattern, not unique ids.
- 한글 also reacts to the value. A wrong one makes 한글 apply multi-level list numbering to the body
  when a footnote is added (Task #1058).

**Objects.** Tables, pictures, shapes and form objects carry a common `instance_id`. The engine
allocates new ones uniquely (`model/identity.rs`, `next_instance_id`), but files from 한글 can
contain duplicates, and the engine deliberately leaves those untouched.

**Decision for E1**
- Node ids are **engine-session identities**, assigned at parse and kept on the in-memory model
  through every edit, split, merge and undo.
- They are **never written to the file**: writing our own ids into `instanceId` or `hp:p@id`
  would change how 한글 behaves.
- Across a reload, or between collaborators, ids are re-established from the base bytes:
  - each node in a parsed base version gets the id derived from its position in that version;
  - live sessions share those ids through the Y.Doc (design §8), the same way Docs uses
    `docxIndex` against `meta.base`.
- Object `instance_id` is recorded alongside as a hint, not as the identity.

## Finding 2: memos (R2). Modelled for round trip, not exposed.

**HWP 5.0**
- A memo is a field control `%%me` (`FIELD_MEMO`) spanning the annotated text.
- Its command string is `MEMO/<memoShapeIDRef>/<number>/<id>/<id>/<author>/\;;`. Both samples confirm
  this; for example, `MEMO/65535/3/1801199504/30581076/User/\;;` in `issue5169`.
- Memo bodies and shapes live in `HWPTAG_MEMO_LIST` (tag 93) and `HWPTAG_MEMO_SHAPE` (tag 92).
  The specification says memo data is stored at the end of the last section.
- The engine preserves `MEMO_SHAPE` as a count plus raw data only.

**HWPX**
- A memo is `<hp:fieldBegin type="MEMO">` with parameters (`ID memo<N>`, `MemoShapeIDRef`, …) and a
  `subList` holding the memo's paragraphs.
- `<hh:memoProperties>` in the header holds the memo shapes.
- The engine models this (`Field.memo_index`, `Field.memo_paragraphs`, `memo_properties_xml`), and
  its serializer follows what 한글 2024 writes. Upstream checked this with SaveAs; see
  `serializer/hwpx/field.rs`.

**The API gap**
- `getFieldList` lists memo fields, but in HWP files their type comes back as `"unknown"`.
- No call reads a memo's body or author, or creates, edits or deletes a memo.
- `aift.hwpx` is the only HWPX sample with memos.

**Threads: none.** A Hancom memo is a single note with an author; replies don't exist in the format.

**Consequences for E4 and task 4.2**
- E4 adds memo read, create, edit and delete for both formats on top of the existing model.
- A reply becomes a second memo on the same range, with the same `<number>` linkage 한글 uses for
  memos sharing a span. In `issue5169`, numbers 1 and 3 annotate the same text.
- Resolve state, @mentions and thread order have no native slot. They are kept in a Redrob part of
  the package:
  - HWPX: an extra `Contents/redrob-comments.xml`, listed as an unrecognised item in
    `content.hpf`;
  - HWP 5.0: a `RedrobComments` storage in the compound file.
  
  Both must be checked to open cleanly in 한글 2024 before they ship, on the runner (P-1). If either
  is refused, the fallback is a sidecar keyed by memo number, valid only while the file is
  shared through Redrob.

## Finding 3: tracked changes (R3). Today they are lost on save.

**HWPX (OWPML, from Hancom's model)**
- In the header's `refList`:
  - `<hh:trackChanges>` holds `<hh:trackChange type="Insert|Delete|CharShape|ParaShape" date authorID hide id charshapeID? parashapeID?>`;
  - `<hh:trackChangeAuthors>` holds `<hh:trackChangeAuthor name mark color id>`;
  - `<hh:trackchageConfig flags>` holds the settings. The misspelling is Hancom's.
- In body text, inside `<hp:t>`: `<hp:insertBegin Id TcId/>`…`<hp:insertEnd Id TcId paraend/>` and
  `<hp:deleteBegin …/>`…`<hp:deleteEnd …/>`. `TcId` references the `trackChange` entry.

**HWP 5.0**
- `HWPTAG_TRACKCHANGE` is in DocInfo, and paragraph headers carry a tracked-change suffix
  (UINT16, 5.0.3.2 and later).
- The engine preserves both as raw bytes and doesn't interpret them.
- The record layouts are not in the specification's body text, and the specification's change
  history ends at revision 1.3. They have to be learned from files 한글 2024 writes.

**What the engine does**
- The HWPX parser ignores the tags inside `<hp:t>`. Their text becomes ordinary text: deleted text
  reads as if it were kept.
- The HWPX serializer writes neither the body marks nor `trackChanges`/`trackChangeAuthors`.
- `trackchageConfig flags` is preserved; upstream found that it affects layout.

Pinned by `packages/hwp-core/tests/known-gaps.test.ts`:
- opening `tracked-changes.hwpx` reads `"NEXT NEW OLDPARAGRAPH"`;
- saving it removes every revision mark.

**Update (E5a, task 4.0).** HWPX revision marks and the revision and author tables now survive
open, edit and save; the same test asserts it. Deleted text still reads as ordinary text until E5b.
HWP 5.0 revisions still need files 한글 2024 writes (P-1).

**This is a fidelity bug against R3.3** (unknown records must survive a save), not only a missing
feature. Until E5 lands, a Hangul document with tracked changes that our editor saves comes out with
every deletion silently kept. The current rhwp-studio-based app has the same loss.

**Samples.** None of upstream's 579 HWPX samples contains tracked changes. Only one HWP 5.0 sample
(`issue5169`) has the DocInfo record.

**Consequences for E5 and task 4.3**
1. Fix the loss first, as a separate engine change ahead of the full API: parse the HWPX marks into
   the model and write them back, and keep the HWP 5.0 raw data attached to the right paragraphs
   through edits.
2. Until the fix lands, the editor must refuse to save a document with tracked changes in place,
   and offer Save As. That is a guard in task 1.10.
3. Byte-level golden tests for HWP 5.0 revisions need files that 한글 2024 saves with tracked
   changes. That waits for the runner (P-1). HWPX can proceed from the OWPML model and be confirmed
   on the runner.

## Finding 4: the HWP specification's terms require an attribution

Hancom's copyright page in the specification (section 2, paragraphs 2–5, read from the document
itself) permits anyone to read, copy, distribute and use it. It also says that rights in a product
developed with reference to it belong to the developer, **on the condition that the product states
「본 제품은 한글과컴퓨터의 한글 문서 파일(.hwp) 공개 문서를 참고하여 개발하였습니다.」 in its user
interface, manual, help and source**, or in whichever of those the product has.

It also reserves Hancom's right to act against anyone who uses results obtained from the
specification to acquire exclusive rights and assert them against Hancom.

**What this repository now does**
- **Source:** the sentence is in `NOTICE`, `engines/rhwp/REDROB.md` and the `packages/hwp-core`
  source header.
- **User interface and help:** the editor's About surface and help must carry it. This is added to
  the spec as task 2.7, a cutover requirement.

Whether rhwp itself having followed this clause covers our own use is a question for counsel. The
safe course is to state it ourselves, which costs nothing.

The OWPML model is Apache-2.0 and was only read here, not copied. HWPX is KS X 6101.

## Spec changes that follow

| Item | Change |
| --- | --- |
| E1 | Session ids, never persisted; re-established from base bytes (finding 1) |
| E4 | API over the existing memo model; replies as memos on the same range; Redrob part for thread metadata, to be checked on the runner (finding 2) |
| E5 | Split into **E5a**, preserving HWPX and HWP 5.0 revisions through open, edit and save (a fidelity fix), and **E5b**, the full revision API (finding 3) |
| Task 1.10 | Guard: no in-place save of a document whose revisions the engine can't preserve, until E5a |
| Task 2.7 (new) | Hancom attribution in the editor's About and help (finding 4) |
