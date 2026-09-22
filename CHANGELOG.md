# Changelog

## 0.8.5

Makes Redrob Hangul reachable. It shipped in 0.8.4 as a working editor that no
menu offered.

- **Redrob Hangul appears in all three New menus.** The tray/context menu, File >
  New in the application menu, and the macOS dock menu. `newHangulTab()` and the
  `menuNewHangul` label existed in every locale all along — the menu entries were
  never added, so `tm('menuNewHangul')` had zero call sites while its sibling
  `tm('menuNewPdf')` had three. Only the Home screen quick card offered it, which
  is why the feature looked present.
- **`.hwp` has its own icon.** The tray entry had none while its five siblings
  each did, and `FILE_ICONS` had no `hwp` entry, so a .hwp in the Home cards and
  the recent list drew the grey lettered fallback badge. The glyph is the jamo ㅎ
  in teal, drawn as geometry so it renders identically on a machine with no
  Korean font.
- **The open-local card advertises `.hwp`.** The open dialog has accepted .hwp
  and .hwpx since the format was added; the card did not say so, which reads as
  "not supported".

A test now asserts that every document kind the shell can create is reachable
from all three menus and has its icon wired, rather than checking Hangul alone —
nothing failed while this was broken, because one surface had it.

Also brings AGENTS.md up to the tree: the branch model (`develop` is the base,
`main` is released state, tags are cut from `main`, and the back-merge is not
optional) and the fact that `pnpm build`/`typecheck`/`test` all fail at the Rust
sidecar on a host without `cargo`.

## 0.8.4

Fixes two AI-panel failures that a user hit on a real machine, and makes the
release pipeline publish the code it says it is publishing.

- **A slow first token no longer dies at 60 seconds.** The stream watchdog arms a
  60s connect budget and swaps to a 180s idle budget on the first byte, but it
  only switched once an SSE line had been parsed — so the connect budget was
  gating time-to-first-token, not time-to-headers. A long-context or reasoning
  request legitimately goes silent for minutes before the first token, so the
  client aborted generations the Console had already accepted and was billing.
  The swap now happens as soon as the response headers arrive.
- **The "Sign in to Redrob" button only appears when signing in would help.** It
  was decided by an OAuth-session check, which reports a workspace authenticated
  with an API key as permanently signed out — so every failure grew a sign-in
  button that fixed nothing and hid the real cause, including the timeout above.
  Rejected credentials now travel as their own error code, and only that code
  shows the button. Affects Slides, Docs and Sheets.
- **Windows releases can publish again.** The bundled Redrob Code sidecar is an
  `extraResources` entry, which electron-builder does not sign, so the signature
  verification step failed on every attempt. The sidecar is now signed with the
  same certificate before packaging — which also matters on machines where Smart
  App Control judges each executable on its own.
- **A release is built from its tag, and only from a tag that is on `main`.** The
  desktop workflow used a bare checkout, so it built whatever ref the dispatch
  started on: v0.8.3's installers were built from `develop` and published under a
  version number `main` had never seen, and nothing failed.

## 0.8.3

Resigns the Windows installer with the org-level Authenticode certificate.
The previous builds were signed with a repo secret that is no longer the
certificate in use. Product behavior is unchanged.

- **Windows signing reads `WIN_CSC_LINK` / `WIN_CSC_KEY_PASSWORD` from the
  organization.** A repository secret of the same name would hide the org
  value, so those two must not exist on `redrob-office` itself.

## 0.8.2

Makes the published builds linkable from a page. 0.8.1 published everything it
should have, but not at addresses anything could point at for longer than one
release.

- **`office/latest/` now carries version-free filenames.** It was publishing
  `Redrob-0.8.1.AppImage`, so the "latest" URL stopped being the latest release
  the moment the next one shipped. Linux artifacts are now
  `redrob-office-x64.AppImage`, `.deb` and `.rpm` under `office/latest/`, while
  `office/<version>/` keeps the version-stamped names. Each `.sha256` sidecar is
  regenerated rather than copied, so it names the file beside it and
  `sha256sum -c` works on whichever one was downloaded.
- **The signed Windows installer is published to the CDN.** It only existed as a
  GitHub Release asset, whose URL carries the version. `release-desktop.yml`
  gained a CDN job that takes the exact bytes the signing job produced (never a
  rebuild, which would be unsigned) and publishes them to
  `office/<version>/Redrob-Setup-<version>.exe` and
  `office/latest/redrob-office-x64-setup.exe`, on the same two-phase contract as
  Linux: the versioned copy must be publicly retrievable with a matching
  checksum before `latest` may move, and only a real tag push may move it. The
  GitHub Release does not wait on the CDN, so a CDN outage cannot withhold the
  updater feed.

## 0.8.1

Release-pipeline fixes for the Redrob Office suite shell (`@genoffice/shell`).
The v0.8.0 tag build failed in three places; this release fixes them without
touching product behavior.

- **Windows release: generate third-party notices before packaging.** The
  Windows job (`release-desktop.yml`) calls `electron-builder` directly, whose
  `beforePack` guard aborts when `build/THIRD-PARTY-NOTICES.txt` is absent. A
  `Generate third-party notices` step now runs after the build and before
  packaging.
- **CDN `latest` promotion no longer server-side-copies.** The CDN credentials
  are PutObject-only, so `aws s3 cp s3://…/office/<version>/ s3://…/office/latest/`
  failed with 403 (HeadObject on the source). `release-office-cdn.yml` now
  re-uploads the same local, already publicly-verified files to
  `office/latest/`; the versioned-verify-before-latest ordering and the latest
  checksum re-verification are unchanged.
- **Crypto test timeouts on loaded CI runners.** The docx encryption and
  Protect-dialog suites do real iterated key derivation; on a contended runner a
  case exceeded the 20s default. Those suites get a justified 60s timeout; all
  other `apps/docs` tests keep the 20s default and no assertion changed.

## Unreleased

### Naming and cloud-account honesty

- The suite product name is **Redrob Office** (not bare "Redrob"): window title,
  Home tab, shell title, and the onboarding welcome, across all locales.
- One set of editor names everywhere: **Redrob Docs / Sheets / Slides / PDF /
  Markdown / Hangul** — Home quick-create cards, the native File > New menu, and
  untitled-tab fallbacks. The inconsistent `AI Docs` / `AI Sheets` labels are
  removed.
- Onboarding slide 2 is honest: it no longer says "join the group chat on
  Redrob" while opening GitHub. Copy now reads as open-source / GitHub feedback
  and the button is **Open GitHub**.
- **Cloud-account surfaces hidden (credential-destination honesty).** The ported
  Genspark sign-in, cloud-projects, and credits features authenticate against /
  link to genspark.ai. They are hidden behind `CLOUD_ACCOUNT_ENABLED` (default
  off) so no Redrob-labeled control signs a user into a third party. The
  bottom-left entry is now a neutral Settings control; the cloud-projects nav and
  the Settings Account/credits section are not rendered; Settings opens on the AI
  Model (Redrob Console) pane. Endpoint code is kept but unreachable. Local-first
  features (recents, local projects, open-local, editors, settings, Console key)
  are unaffected. Guarded by `apps/shell/tests/cloud-account-hidden.test.ts`.

### Branding: Redrob Office

The ported office suite now presents as Redrob Office on every user-visible
surface. See [docs/branding-cleanup.md](./docs/branding-cleanup.md) for the full
rules and the list of internal identifiers that intentionally keep their legacy
names.

- Product and editor names are Redrob: Home sidebar wordmark, window titles,
  `Redrob Docs / Sheets / Slides / PDF / Markdown / Hangul`, and the standalone
  editor `index.html` titles.
- The in-editor AI is Redrob AI: AI panel and ribbon labels, AI system prompts,
  and every localized string across all 19 locales. The AI panel mark now draws
  the Redrob logo.
- Onboarding no longer promotes a non-existent credit system. The "1,000+
  credits" offer is replaced with honest community/feedback copy, and the closing
  note says AI runs on your Redrob Console workspace. Credit-exhausted messages
  and top-up links point at `console.redrob.ai`.
- Official Redrob logo assets are used in the sidebar, onboarding, and the update
  window, with correct light/dark behavior. App and build icons (png/ico/svg) are
  the Redrob icon.
- In-app GitHub / release links point at `github.com/redrob-labs/redrob-office`.
- Removed em dashes from the English user-facing copy that was touched.
- Added a static branding audit test
  (`apps/shell/tests/branding-audit.test.ts`) that fails on any user-visible
  `GenOffice` / `Genspark` literal outside the documented allowlist.

Internal identifiers kept unchanged (load-bearing, not display copy): the
`@genoffice/*` package names, `GenOffice*` font families and font files,
serialized PDF metadata keys, the ported Genspark cloud endpoints (`gsk` CLI,
proxy host, account status type), updater env vars, Univer command ids, and the
upstream Apache-2.0 attribution in `NOTICE`.

### Developer environment

- `pnpm install` now runs a `postinstall` (`scripts/ensure-electron.mjs`) that
  ensures each workspace's pinned Electron binary is present, so
  `pnpm dev` for the suite shell no longer fails with `Electron uninstall`
  after a `--frozen-lockfile` install. Also exposed as `pnpm ensure:electron`.
- `pnpm build` passes `RUSTUP_HOME` / `CARGO_HOME` through Turborepo so the
  Sheets Rust xlsx sidecar compiles under strict env mode without
  `--env-mode=loose`.
- README and AGENTS now document `pnpm dev` as the Redrob Office suite shell
  (`@genoffice/shell`), with `pnpm dev:office` as the legacy recruiting app
  (`@redrob/office`).
