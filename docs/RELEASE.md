# Releases

Everything ships through GitHub Releases: the files a person downloads and the feed
the app updates from are the same assets on the same release. There is no CDN.

Pushing a `v*` tag runs two workflows against the same tag. Both refuse to run if the
tag is not contained in `main`, and both refuse if the tag does not equal the version
in `apps/shell/package.json` **at that tag** (`v0.8.3` ↔ `0.8.3`), so a mistyped tag,
or a tag that only exists on `develop`, fails before anything is built.

A release is therefore cut by promoting `develop` into `main` and tagging `main` — not
by dispatching a workflow from a working branch. v0.8.3 was published that way by
mistake: the desktop workflow used a bare checkout, so it built `develop` and attached
the result under a version `main` had never seen.

The promotion pull request is an ordinary working branch and takes an ordinary type
prefix (`chore/release-0.8.4`). There is no `release` branch type in this repository;
the tag, not the branch name, is what makes a release.

## Windows and macOS — `.github/workflows/release-desktop.yml`

Signs the Windows installer, notarises the macOS build when that job is enabled, and
attaches every signed artifact to the release for the tag, along with `latest.yml` and
`latest-mac.yml`.

The signed bytes are attached, never rebuilt: a rebuild produces a different,
unsigned file. The signing jobs upload their output as workflow artifacts and the
release job downloads those and attaches them.

## Linux — `.github/workflows/release-linux.yml`

Builds the unsigned AppImage, deb and rpm, writes a `.sha256` beside each one, and
attaches them plus `latest-linux.yml` to the same release. It installs `rpmbuild`
first, because electron-builder does not vendor it.

`gh release upload --clobber` is used, so re-running the workflow replaces an asset
instead of failing on a name clash. That is what makes a `workflow_dispatch` repair of
one platform safe while the other platform's assets stay untouched.

## The update feed

`latest.yml`, `latest-mac.yml` and `latest-linux.yml` **are** the feed. The app reads
them through electron-updater's GitHub provider, so a release missing them installs
correctly and then never updates — which is why both workflows attach them explicitly
rather than relying on electron-builder's own publish step.

The provider is written into the app at build time from `GENOFFICE_UPDATE_REPO`
(`owner/repo`), which the release workflows set to `${{ github.repository }}`:

- On this repository, builds update from this repository's releases.
- On a fork that runs the same workflows, builds update from **that fork's** releases,
  not from ours. A fork's users should not be moved onto our builds.
- With the variable unset — plain local packaging, a PR smoke build —
  `apps/shell/electron-builder.cjs` writes no publish config at all, electron-builder
  bakes no `app-update.yml`, and in-app auto-update stays disabled.

Only published releases feed the updater (`releaseType: 'release'`), so a draft or a
prerelease cannot reach people who installed a stable build.

## Checksums

Linux packages carry a `.sha256` sidecar because a release asset has no checksum of
its own. Verify with:

```bash
sha256sum -c redrob_0.8.3_amd64.deb.sha256
```

Windows installers are Authenticode-signed; the signature is the integrity check
there, and the release also carries the `.blockmap` the differential updater uses.

## Releases before this change

Versions up to `v0.8.3` were published while the CDN was the download host, and those
releases live in the private predecessor repository (`redrob-office-old`). This
repository's release history starts fresh; the first tag cut here is the first release
carrying its own assets.
