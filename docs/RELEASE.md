# Releases

Everything ships through GitHub Releases: the files a person downloads and the feed
the app updates from are the same assets on the same release. There is no CDN.

Pushing a `v*` tag runs one workflow, `.github/workflows/release-desktop.yml`, against
that tag. Its `version` job refuses a tag that is not contained in `main`, and refuses a
tag that does not equal the version in `apps/shell/package.json` **at that tag**
(`v0.8.3` ↔ `0.8.3`), so a mistyped tag, or a tag that only exists on `develop`, fails
before anything is built. It resolves the tag to one commit and every build job checks
out exactly that commit.

A release is therefore cut by promoting `develop` into `main` and tagging `main` — not
by dispatching a workflow from a working branch. v0.8.3 was published that way by
mistake: the desktop workflow used a bare checkout, so it built `develop` and attached
the result under a version `main` had never seen.

The promotion pull request is an ordinary working branch and takes an ordinary type
prefix (`chore/release-0.8.4`). There is no `release` branch type in this repository;
the tag, not the branch name, is what makes a release.

## The shape

```
tag v<version> on main  ->  version  ->  windows / macos / linux  ->  publish
```

The parts every redrob-labs repository shares are not in this repository; they are
called from [redrob-labs/.github](https://github.com/redrob-labs/.github):

- `actions/sign-windows` — Authenticode through Azure Artifact Signing, with its own
  verification (`signtool verify /pa`, Status `Valid`, signer CN `McKinley Rice, Inc.`).
- `.github/workflows/release-publish.yml` — downloads the `release-*` artifacts, writes
  `SHA256SUMS.txt` and `redrob-launcher.json`, creates the release and publishes it as
  latest (prerelease when the version carries a `-`). It never overwrites a published
  release: bump and tag again.

### Windows

Builds the suite, logs in to Azure with the job's OpenID Connect token (`azure/login`,
**after** the build and right before signing, because the token lives minutes), signs the
Redrob Code sidecar with the shared action, then packages with electron-builder, whose
`win.sign` hook (`scripts/win-sign.cjs`) runs the same shared `sign.ps1` — checked out at
`.redrob-shared` — for every executable it produces. One `signtool verify /pa` over the
installer and the packaged sidecar closes the job. There is no certificate file and no
client secret anywhere; `ARTIFACT_SIGNING_*` and `AZURE_*` are plain organization IDs.

### macOS

Signs with the Developer ID certificate, packages the dmg and the updater zip, notarises
and staples. Unchanged by the shared pieces.

### Linux

Builds the unsigned AppImage, deb and rpm. It installs `rpmbuild` first, because
electron-builder does not vendor it.

### Publish

Runs only on a tag and only when every build job succeeded. The signed bytes are
attached, never rebuilt: a rebuild produces a different, unsigned file. A
`workflow_dispatch` with `dry_run` builds and signs the dispatched commit under the
version `apps/shell/package.json` declares and stops before this job, which is how a
change to the workflow is exercised without a tag.

## The update feed

`latest.yml`, `latest-mac.yml` and `latest-linux.yml` **are** the feed. The app reads
them through electron-updater's GitHub provider, so a release missing them installs
correctly and then never updates — which is why every build job uploads its feed file
with the installers rather than relying on electron-builder's own publish step.

The provider is written into the app at build time from `GENOFFICE_UPDATE_REPO`
(`owner/repo`), which the release workflow sets to `${{ github.repository }}`:

- On this repository, builds update from this repository's releases.
- On a fork that runs the same workflows, builds update from **that fork's** releases,
  not from ours. A fork's users should not be moved onto our builds.
- With the variable unset — plain local packaging, a PR smoke build —
  `apps/shell/electron-builder.cjs` writes no publish config at all, electron-builder
  bakes no `app-update.yml`, and in-app auto-update stays disabled.

Only published releases feed the updater (`releaseType: 'release'`), so a draft or a
prerelease cannot reach people who installed a stable build.

## Checksums

The publish job writes `SHA256SUMS.txt` over every asset on the release. Verify with:

```bash
sha256sum --ignore-missing -c SHA256SUMS.txt
```

Windows installers are also Authenticode-signed; the signature is the integrity check
there, and the release carries the `.blockmap` the differential updater uses.

## Releases before this change

Versions up to `v0.8.3` were published while the CDN was the download host, and those
releases live in the private predecessor repository (`redrob-office-old`). This
repository's release history starts fresh; the first tag cut here is the first release
carrying its own assets.
