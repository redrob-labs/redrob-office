# Upstream

Redrob Office is a port of [GenOffice](https://github.com/genspark-ai/genoffice) by
Mainfunc, Inc., which is licensed under the Apache License, Version 2.0. This file
records where the port came from, how upstream work is taken, and what keeps the
licence obligations from rotting.

## What kind of fork this is

Not a git fork. The office applications and their supporting packages were ported
in wholesale at `476e7598` ("Merge PR #34: Port GenOffice wholesale into Redrob"),
on top of a repository that already existed, so **this repository shares no commit
ancestry with upstream** and `git merge-base HEAD upstream/main` resolves to
nothing. Every upstream change is taken file by file, never by three-way merge.

That has one practical consequence worth stating plainly: nothing in git tells us
how far behind upstream we are. `upstream-base.json` does, and it is only as
honest as the last person who updated it.

## The measured base

`upstream-base.json` records the upstream commit this tree was measured against:

| | |
| --- | --- |
| commit | `99dfbc1fdfb8d83961d78799e36459da7c9fc99f` |
| date | 2026-09-06 |
| subject | feat(ai-panels): RTL-aware chrome and auto-direction messages in slides/sheets/pdf/markdown (part of #13) (#203) |
| shared blobs | 1780 of 2242 tracked files in this tree |

It was measured, not remembered. The method: intersect the set of blob hashes in
this tree with the set in every upstream first-parent commit, and take the peak.
Two cheaper methods do not work here and were rejected:

- **Path-keyed comparison** — the port renamed directories, so identical files
  compare as missing on both sides and every commit scores zero.
- **`git diff --name-only` counting** — the brand sweep edited most files, so the
  count is dominated by our own changes rather than by upstream's movement.

Three upstream commits tied at 1780 shared blobs; the newest in first-parent order
was taken, because the port landed on 2026-09-06.

## Taking upstream work

```bash
node scripts/upstream-sync.mjs setup    # add or repoint the upstream remote
node scripts/upstream-sync.mjs fetch    # network
node scripts/upstream-sync.mjs report   # commits not taken yet
node scripts/upstream-sync.mjs files    # paths they touch that we also ship
```

`report` and `files` only read. Nothing is applied automatically: a port has no
merge semantics, so applying upstream diffs unattended would silently revert
Redrob changes that live in the same files (the AI provider path, the brand
strings, the Console wiring).

After taking anything:

1. Run `pnpm check:upstream-boundary`.
2. Run `pnpm typecheck`, `pnpm test`, `pnpm build`.
3. Set `lastSyncedUpstream` in `upstream-base.json` to the upstream commit you
   stopped at. Leave `base` alone — it is the measurement of the import, not a
   pointer that moves.

Use a `sync/upstream-<date>` branch, and a merge commit rather than a squash, so
the range you took stays legible in the history.

## What the boundary guard enforces

`scripts/check-upstream-boundary.mjs` (`pnpm check:upstream-boundary`) fails the
build when:

1. `upstream-base.json` is missing, unparseable, or has no upstream remote or base
   commit.
2. A file listed under `attribution` is gone, or no longer contains a string it
   must contain. Today that means `NOTICE` must still name GenOffice and
   Mainfunc, Inc. alongside Redrob, and `LICENSE` must still be Apache-2.0.
3. A tracked file appears under an `excludedPrefixes` entry — an upstream tree we
   deliberately do not ship. The list is empty today because upstream has no
   separately-licensed directory; `excludedReason` says so on the record, and the
   guard fails if that reason is blank.

The rule the guard exists to defend is one sentence: **add your copyright line,
never remove upstream's.** Apache-2.0 section 4 requires the notice to travel with
every copy, and a rebrand sweep is exactly the kind of change that deletes it
without breaking a test.

## Third-party notices

`THIRD-PARTY-NOTICES.txt` is generated at packaging time by
`tools/gen-third-party-notices.mjs` and is not checked in. It ships inside the
application bundle (`Contents/Resources` on macOS, `resources/` on Windows). Run
that generator from a source checkout if you need to read it.
