# Contributing

한국어: [CONTRIBUTING.ko.md](./CONTRIBUTING.ko.md)

The organization-wide rules live in
[redrob-labs/.github](https://github.com/redrob-labs/.github). This file says what
is true of **this** repository, which is the part a document cannot inherit.

## Setup

Node.js 20.x, Yarn 1.x.

```bash
yarn install
yarn build && yarn test
```

## Branches

`develop` is the default branch and every change lands there first. `main` is the released
state and only ever moves through a promotion pull request.

Working branches are `<type>/<short-slug>`. This repository's types, which are the list the
`gitflow` workflow enforces:

```
feat fix chore docs test refactor perf hotfix release
```

There is no `sync` type: this is not a fork, so nothing arrives from upstream.

The type list differs per repository across the organization, and the check fails a guess. The
gate is `ALLOWED_TYPES` in `.github/workflows/gitflow.yml`; this table is the explanation. If
the two ever disagree, the workflow is right and this file is stale.

A branch name says what the change is, not who or what made it. An agent or tool name is not a
type.

If the check already failed, renaming the branch is not enough on its own. A failed run stays
keyed to the commit, so amend the commit too, or the new pull request shows the old red X while
reporting itself mergeable.

## Merging

| Situation | Style |
|---|---|
| Working branch into `develop` | squash |
| `develop` into `main` promotion | merge commit |
| Hotfix into `main` | merge commit |

Never rebase-merge. Squashing a promotion destroys the relationship between the two branches
and the `back-merged` check then has nothing real to compare.

## Verifying a change

`yarn test` is the gate. It renders every component twice against the design system delivery's
own `preview.html` case - once from the reference bundle, once from our built `dist` - and
compares the markup.

```bash
yarn build       # tsc, then the style and font copies
yarn test        # every component vs the reference bundle
yarn test:self   # the reference vs itself, so a broken harness cannot look like a pass
```

Read the build's own exit code. `tsc` has no `noEmitOnError`, so it writes output **even when it
reports errors**, and the parity runner will happily read that broken output and pass. This has
happened twice in this repository. **Parity green with a red build is not a pass.**

Never weaken, skip or special-case the harness to make something pass. If the reference and our
implementation genuinely have to differ, say so in the pull request with the reason - a silent
exception makes the gate worthless for every component after it.

## Adding a component

1. Read the reference first: `sed -n '/^  function <Name>(/,/^  }$/p' reference/components/bundle.js`,
   plus `reference/components/index.d.ts` for the prop contract. Transcribe behaviour; do not
   improve it, because the gate compares markup.
2. `src/components/<Name>/<Name>.tsx`, written with `React.createElement` to keep the call shape
   the same as the reference's.
3. A typed props interface, and doc comments that say **why** - what it is for, what not to use it
   for, what a prop protects against. Never a comment that restates the code.
4. Export it from `src/index.ts` under its group heading, types included. That file is the entire
   public surface; a component not exported there does not exist to a consumer.
5. `yarn build && yarn test <Name>` until it passes, then `yarn test` for the whole set so nothing
   earlier regressed.

Styling is plain CSS on tokens. The class names come from the delivery's stylesheet
(`src/styles/system.css`); there is no Tailwind and no utility classes to add.

`src/icons/index.tsx` is generated - edit `tools/generate/icons.js`, never the file. CI checks it
with `yarn icons:check`.

Use `example.com` in placeholder data. Never a real person, and never an internal domain.
People in fixtures are placeholders from a fixed set - `John Doe`, `Jane Doe`, `Richard Roe`,
`Mary Major`, `John Stiles`, `Richard Miles`, and the Hangul `홍길동`, `김철수`, `이영희`, `박영수`.
Keep the script: a Hangul name exercises one-syllable initials and CJK wrapping, so replacing it
with a Latin one silently drops that coverage.

## Releasing

Versions are `v<major>.<minor>.<patch>`.

1. Bump `version` in `package.json` on `develop`.
2. Open a promotion pull request from `develop` into `main`, and merge it as a merge commit.
3. Tag `main` at that commit, then create the GitHub Release from the tag.

Publishing runs on `release: published`, not on a push. It refuses to publish when the tag is
not an ancestor of `main`, or when `package.json` disagrees with the tag, and it skips a
version that is already on the registry so a retry is safe. Publishing is immutable: a version
number is spent the moment it lands.

To rehearse without publishing, run the `publish` workflow manually with `dry_run` left on.

## Pull requests

The organization's pull request template applies. Two lines of it are the ones that get
skipped here:

- Any count, size or version in the description is re-measured from the built artifact in the
  same sitting, and says which surface produced it.
- No credential, token or `.env` file in the diff. `.npmrc` is gitignored for that reason;
  keep it that way.

## Reporting a vulnerability

Not in an issue. See the organization's
[security policy](https://github.com/redrob-labs/.github/blob/main/SECURITY.md).
