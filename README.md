# Redrob Office

**English** · [한국어](./README.ko.md)

Redrob Office is a desktop office suite with Docs, Sheets, Slides, PDF, Markdown and Hangul editors in one window.
Every editor carries an AI panel that edits the open document rather than describing how to edit it.
It runs on Windows and Linux, is a port of [GenOffice](https://github.com/genspark-ai/genoffice)
under the Apache License 2.0, and ships in English and Korean.

## What it does

- **Docs**: write, format and review `.docx`, with an AI panel that drafts and edits in place.
- **Sheets**: edit `.xlsx`, with AI tools over the grid.
- **Slides**: edit `.pptx`, with AI tools over shapes and layouts.
- **PDF**: read, convert, and run AI tools over the document.
- **Markdown and Hangul**: a Markdown editor, and `.hwp`/`.hwpx` editing through the embedded rhwp editor.
- **One Home screen**: every editor opens from a single shell and a shared project store.

AI editing runs through the tool loop in `packages/agent-core` and the fixed Redrob
Console transport in `packages/ai-provider`. Bringing your own vendor key or
pointing the app at an arbitrary server is deliberately not an option.

## Install

Download a build for your system:

| System | File |
| --- | --- |
| Windows x64 | [`Redrob-Setup-<version>.exe`](https://github.com/redrob-labs/redrob-office/releases/latest) |
| Linux AppImage | [`Redrob-<version>.AppImage`](https://github.com/redrob-labs/redrob-office/releases/latest) |
| Linux deb | [`redrob_<version>_amd64.deb`](https://github.com/redrob-labs/redrob-office/releases/latest) |
| Linux rpm | [`redrob-<version>.x86_64.rpm`](https://github.com/redrob-labs/redrob-office/releases/latest) |

Every Linux package has a `.sha256` beside it on the release. There is no macOS
build. The app updates itself from these same releases.

## Connect Redrob

The AI panels need a workspace key issued by [Redrob Console](https://console.redrob.ai).
Create one under **API keys** in Console, then paste it into **Settings → AI** in
the app. A key from anywhere else is rejected, and an empty key produces a plain
failure notice rather than a silent no-op.

Console's one-click **Connect Redrob** device flow (where the app shows a short
code and you approve it in Console instead of copying a key) is not wired into
this app yet. Redrob Code and Redrob Cowork use it today; Office does not.

## Local development

Node 22, pnpm 9.15.0, Electron and Turborepo.

```bash
pnpm install
pnpm dev              # @genoffice/shell
pnpm typecheck
pnpm test
pnpm build
pnpm dist
```

If you installed with `pnpm install --ignore-scripts`, run `pnpm ensure:electron`.
On a headless machine that only needs typecheck and tests, set
`REDROB_SKIP_ELECTRON_ENSURE=1` to skip the Electron download explicitly.

## Repository layout

| Path | Role |
| --- | --- |
| `apps/shell` | The Redrob Office shell and Home screen |
| `apps/{docs,sheets,slides,pdf,markdown,hangul}` | Each editor and its AI panel |
| `packages/agent-core` | The shared agent loop that runs editing tools |
| `packages/ai-provider` | The fixed Redrob Console transport |
| `packages/{docx-engine,pptx-engine,pptx-render,rhwp-editor}` | Document format engines |
| `packages/{genoffice-ui,i18n,electron-utils,project-store}` | Shared UI and runtime |

Package names are still `@genoffice/*`. They are import paths, not product
surface, and renaming them would rewrite every import for no user-visible gain.

## Releases

Pushing a `v*` tag runs two workflows from the same tag, both attaching to the same
GitHub Release: `release-desktop.yml` signs and attaches the Windows installer (and
notarises macOS when that build is enabled), and `release-linux.yml` builds the
unsigned Linux packages and attaches them with their checksums. The tag must match
the version in `apps/shell/package.json` (`v0.8.3` ↔ `0.8.3`).

The release is also the update feed: `latest.yml` and `latest-linux.yml` ride along
with the installers, and the app reads them through electron-updater's GitHub
provider. Details, including what a fork build does instead, are in
[docs/RELEASE.md](./docs/RELEASE.md).

## Documentation

- [docs/UPSTREAM.md](./docs/UPSTREAM.md): what this fork was ported from, and how upstream work is taken
- [docs/RELEASE.md](./docs/RELEASE.md): how a release is built, signed and attached
- [docs/console-api.md](./docs/console-api.md): the Redrob Console inference API contract
- [docs/branding-cleanup.md](./docs/branding-cleanup.md): brand rules and the deliberate internal exceptions
- [AGENTS.md](./AGENTS.md): development and verification environment notes

## Contributing

See [CONTRIBUTING.md](./CONTRIBUTING.md) for branch naming, commit convention, the
checks to run before opening a pull request, and the two fork rules that CI
enforces.

## Upstream

Redrob Office is a port, not a git fork: it shares no commit ancestry with
upstream, so upstream work is taken file by file. The commit this tree was
measured against, the method used to measure it, and the sync procedure are all in
[docs/UPSTREAM.md](./docs/UPSTREAM.md); the machine-readable record is
[upstream-base.json](./upstream-base.json).

## License and attribution

Apache-2.0. The office editor applications and their supporting packages are
ported from [GenOffice](https://github.com/genspark-ai/genoffice) by Mainfunc,
Inc., and remain under the same licence. Upstream's copyright notice is retained
in [NOTICE](./NOTICE) as Apache-2.0 section 4 requires; changes made in this port
are copyright Janghoon Lee (Redrob) and contributors, under the same terms.
`pnpm check:upstream-boundary` fails the build if that notice is ever removed.

The Hangul editing capability is provided by [rhwp](https://github.com/edwardkim/rhwp)
(MIT), vendored and served offline. Bundled fonts and third-party components are
listed in [NOTICE](./NOTICE); the full third-party notice file is generated at
packaging time and ships inside the application bundle.

The licence covers the software, not the brand: the Redrob name and logos are not
licensed under it.
