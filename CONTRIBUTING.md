# Contributing

**English** · [한국어](./CONTRIBUTING.ko.md)

Thanks for working on Redrob Office. This file is the short version of how work
lands here.

## The two fork rules

Redrob Office is a port of GenOffice (Apache-2.0). Two rules protect that
relationship, and breaking either one is a licence problem rather than a style
problem:

1. **Add your copyright line, never remove upstream's.** Apache-2.0 section 4
   requires the upstream notice to travel with every copy. `NOTICE` must keep
   naming GenOffice and Mainfunc, Inc.
2. **Record every upstream take.** When you bring code over from upstream, set
   `lastSyncedUpstream` in `upstream-base.json` to the commit you stopped at. This
   repository shares no ancestry with upstream, so that file is the only thing that
   knows how far behind we are.

`pnpm check:upstream-boundary` enforces rule 1 mechanically. Rule 2 is enforced in
review, because no script can tell a truthful pin from a stale one.

## Branch flow

- `main` is trunk. Everything lands through a pull request.
- Working branches are `<type>/<short-slug>`, where type is one of `feat`, `fix`,
  `chore`, `docs`, `test`, `refactor`, `perf`.
- Upstream syncs are `sync/upstream-<date>`.
- Release tags are cut from `main` as `v<major>.<minor>.<patch>`, matching the
  version in `apps/shell/package.json`.

`.github/workflows/gitflow.yml` now checks the two bullets above, because a rule
nothing checks is only a preference: branches have already appeared under a `kiro/`
prefix that no document here defines. The `branch name follows the convention` job
fails any pull request whose head branch does not start with `feat`, `fix`, `chore`,
`docs`, `test`, `refactor`, `perf` or `sync`, and lets `develop` and `main` through
because a promotion or back-merge branch is not named after a type. The
`main is contained in develop` job runs after `main` moves and fails while `main`
holds commits `develop` does not, which is the missed back-merge that left a sibling
repository's default branch unable to install for a month. This list is the
explanation; `ALLOWED_TYPES` in that workflow is the gate, so change both together.

## Commits

Conventional prefixes, imperative mood, lower-case subject, scope when it helps:

```
fix(sheets): reject out-of-grid Go To references at validation
```

Write commit messages and pull request bodies in English. They are a permanent
record other people read.

## Before you open a pull request

```bash
pnpm install
pnpm typecheck
pnpm test
pnpm build
pnpm check:upstream-boundary    # the fork rules
pnpm check:licenses             # dependency licence allowlist
```

If you touched anything user-visible, add the string to both locales in
`packages/i18n` rather than hard-coding English or Korean in a component.

## What CI checks today, and what it does not

| Workflow | Runs on | Status |
| --- | --- | --- |
| `CI` (Linux: typecheck, build, test, fork boundary, licences) | pull request, push to `main` | required |
| `CI` (Windows + macOS matrix) | weekly schedule, manual dispatch | not on pull requests |
| `release-desktop.yml`, `release-linux.yml` | `v*` tag, manual dispatch | release only |

The native matrix is expensive, so a pull request does not run it. If your change
is platform-specific, say so in the pull request and dispatch the matrix manually.

## Reviews

One concern per pull request. Squash-merge a working branch so `main` gets one
commit; use a merge commit for an upstream sync so the range you took stays
legible. A single maintainer may self-merge once CI is green.

## Reporting bugs and asking for features

Open an issue with the bug or feature template. For a bug, the version and the
system matter as much as the description: the Windows and Linux packages are built
by different workflows.

## Security

Do not open a public issue for a vulnerability. Mail `packages@redrob.ai` with what
you found and how to reproduce it.

## License of your contribution

By contributing you agree that your contribution is licensed under Apache-2.0, the
same terms as the rest of the repository, and that you keep the copyright to your
own work.
