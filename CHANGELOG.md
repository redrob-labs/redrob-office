# Changelog

## Unreleased

## 0.13.6 -- 2026-10-26

### Fixed

- macOS: the window buttons no longer cover the sidebar, back and forward buttons in the top-left corner.

## 0.13.5 -- 2026-10-22

### Changed

- macOS: the app ships as `Redrob Office.app` with the bundle id `ai.redrob.office` (was `redrob.app`, `com.redrob.app`), so Redrob Launcher finds and installs it. A Mac running 0.13.4 or older cannot auto-update across the id change: install 0.13.5 once from Redrob Launcher or the disk image. Settings and sign-in carry over. Windows keeps its old installer GUID and updates in place.

## 0.13.4 -- 2026-10-22

### Fixed

- Home: Shift+click on a file's checkbox selects (or clears) every file between it and the last one clicked, in Recent and in a project's file list, without dragging a text selection across the rows.
- Home: a file row's "more" menu opens leftward from its button and stays inside the window; it used to hang off the right edge.

## 0.13.3 -- 2026-10-21

### Changed

- Home: the greeting is one short line, "Good afternoon, Janghoon" (the signed-in Redrob account's first name, or just "Good afternoon" when signed out), at a size that fits one line. It no longer names the last file; Recent lists it. Every language gets the same greeting-plus-name line.
- Settings: the section list, row labels, descriptions and status text use the design system's type, spacing and control-height tokens and match Home's sidebar rows; the pane's close button is the kit's icon button.

### Fixed

- Windows: the app chrome is one 40px bar and the minimise, maximise and close buttons are exactly as tall (they were 62px), so their hover and click areas no longer hang past the visible bar. The bar's own buttons and search box use the kit's small control height to fit inside it. The standalone Docs and Slides windows keep their tab row at least as tall as their caption buttons.

## 0.13.2 -- 2026-10-21

### Fixed

- Windows: a failure in an optional startup step (proxy setup, language or theme lookup, analytics, the Sheets capture server) no longer leaves a running process with no window. Each step is guarded so the main window always opens, and an unexpected startup error now shows an error dialog and quits instead of failing silently.
- Windows open no larger than the screen's work area, so the default sizes (up to 1440x900) no longer spill off small or scaled displays.

## 0.13.1 -- 2026-10-21

### Fixed

- Windows: the app no longer fails at startup with `ERR_PACKAGE_PATH_NOT_EXPORTED: Package subpath ./daemon is not defined by "exports"`. The main process is bundled as CommonJS, and `@redrob-labs/sdk` publishes ESM only (its `exports` have no `require` condition), so `require('@redrob-labs/sdk/daemon')` could not resolve. The SDK is now bundled into the main process instead of loaded from `node_modules`.

## 0.13.0 -- 2026-10-20

### Changed

- The 2026 Redrob Office app icon, from `@redrob-labs/ui` 1.8.0 (which this release also moves to, from 1.0.2). Every packaged icon is rebuilt from it: the macOS `.icns`, the Windows `.ico`, the Linux hicolor set and `redrob-office.png`, the 512 px icon Redrob Launcher's catalog shows. The PNG and ICO tiles use the rounded variant with transparent corners, so the launcher, the Windows taskbar and Linux menus no longer show a square.
- PR CI is lighter: one build-and-test job on Ubuntu, skipped for docs-only or version-only changes. The full three-OS build, the reproducible hwp-core build and the Hangul fidelity check run on demand.

## 0.12.0 -- 2026-10-20

### Added

- Redrob Code can edit an open document, not only read and save it. Two new app-bridge tools apply the change through the editor's own undoable path, so Cmd+Z reverts it like a person's edit: `write_cells` writes a block of values or `=` formulas into a sheets tab at an A1 range and answers the cell count; `replace_text` finds and replaces text in a docs tab (all matches or the first, optional match case) and answers the match count.

## 0.11.0 -- 2026-10-17

### Added

- Redrob Code can drive the open documents. The shell registers an app bridge with the shared Redrob Code daemon at launch (an MCP server on `127.0.0.1`, attached through the engine connection the shell already holds) and exposes six tools that act through the paths the File menu uses: `list_documents`, `open_document`, `read_document` (slides outline, saved markdown text), `save_document`, `save_as` (PDF) and `export_pdf`. Editors that keep their text in the renderer answer a clear error instead of a half-working edit. See "Control from Redrob Code" in the README.

### Changed

- The release carries `redrob-office.png` (the 512 px app icon) so Redrob Launcher's catalog shows this release's own logo.

## 0.10.10 -- 2026-10-16

### Fixed

- A sign-in made in Redrob Launcher now counts as Office's own. The shell reads the shared account file (`redrob-shared/account.json`, the launcher's contract) and the app's own Console key, on startup and whenever either file changes, so "Sign in with Redrob" no longer reappears while the launcher is connected. When both hold a key the newer one wins. Settings > Sign in used to fail because Console serves no OpenID discovery document; it now uses Console's device connect and stores the key where Connect Redrob does.
- Windows: the room the tab strip keeps clear for the caption buttons (close, maximize, minimize) is now the window's own overlay width (`env(titlebar-area-*)`) rather than a fixed 138px, so the right-side controls stop sliding under the buttons.
- Opening a file no module reads (`.pem`, `.zip`, a legacy `.doc`...) now says so -- "`.pem` files are not supported", in the UI language -- on drag-drop, the open dialog (which gains an All files filter), the command line, a second instance and open-with. Before, anything outside the legacy office formats did nothing. Drag-drop also learns `.hwp`/`.hwpx`.
- Home: long file names in the recent list show the full name on hover; the row menu scrolls instead of being clipped on short windows.
- PDF: every button of the simple toolbar carries a text label.

### Changed

- Home shows a dismissable three-step guide on first run (open a file, create a document, ask Redrob), each format tile offers New and Open, and the top of the page shows who is signed in with a Billing / Console button -- or a Sign in button when nobody is.
- The Redrob logos in the chrome and the sidebar go Home; the Console link moved to Settings > About.

## 0.10.9 -- 2026-10-16

### Fixed

- Sheets: a workbook that failed to open no longer leaves a blank document named after the file. The failure is shown in an error dialog, the shell drops the tab, and the header shows the real file name.
- Sheets and Slides: password-protected `.xlsx` and `.pptx` (ECMA-376 encrypted containers) open through a password dialog (a wrong password re-prompts, Cancel abandons the open) and are decrypted in memory. Save and Save As re-encrypt with the same password, so the file on disk stays protected; autosave and crash-recovery copies are skipped for protected sessions so no plaintext lands on disk. Legacy binary `.ppt` keeps its existing message.
- Hangul: the password dialog of a protected `.hwp` no longer races the host's 60 s `loadFile` timeout ("Request timeout: loadFile"); the host now waits up to 10 minutes for the user.

### Changed

- CI runs on pull requests only: no push-to-main runs and no schedules. The native build matrix and the Hancom fidelity run are manual (`workflow_dispatch`); tag pushes still release.

## 0.10.8 -- 2026-10-15

### Changed

- The bundled Redrob Code sidecar is the engine's newest published release, resolved once per release run (`version` job) and handed to every leg as `REDROB_CODE_VERSION`; the pin file `apps/shell/redrob-code.version` is gone. The sidecar is only the fallback for a machine without a launcher-installed engine, and a pin only made it stale (0.10.6 shipped an engine built from a branch months behind). The resolved tag is in the build log, the step summary and `apps/shell/build/redrob-code.version`.

## 0.10.7 -- 2026-10-15

### Fixed

- The bundled Redrob Code sidecar is now engine v0.6.5. 0.10.6 built its sidecar from the engine's `main` branch, which had not moved since 2026-09-22, so the shipped fallback engine predated the shared daemon, the idle-exit fix (redrob-code #100) and the chat-completions route fix (redrob-code #107). The sidecar is now taken from the pinned engine release.

### Changed

- One release workflow on the organization's shared pieces. `release-desktop.yml` now carries Windows, macOS and Linux from one tag (`release-linux.yml` is folded in as its `linux` job), resolves the tag to one commit that every leg builds, and ends in `redrob-labs/.github`'s `release-publish` job, which writes `SHA256SUMS.txt` and `redrob-launcher.json` and publishes the release as latest. The repository's own manifest writer, `.sha256` sidecars and release-create steps are gone. A `workflow_dispatch` with `dry_run` builds and signs the dispatched ref and publishes nothing.
- Windows signing is the organization's one recipe, `redrob-labs/.github/actions/sign-windows`: the Redrob Code sidecar is signed by the action, and electron-builder's hook spawns the same `sign.ps1` from a checkout at `.redrob-shared`. `scripts/win-sign.ps1` is deleted.
- `gitflow.yml` is the organization's caller template; the type list and the back-merge pull request now come from `redrob-labs/.github`.

- The release legs bundle the Redrob Code sidecar from the engine's own GitHub release (tag pinned in `apps/shell/redrob-code.version`, downloaded and checked against the release's SHA256SUMS by `scripts/fetch-redrob-code.sh`) instead of building it from source on every leg, which cost about 3.5 minutes each and shipped untested bytes. Bump the pin in a pull request like any dependency.
- CI no longer runs on pull requests into `main`: they only promote commits that already passed on `develop` (or a hotfix that releases on its own run), so the re-run was a seven-minute wait before every release.
## 0.10.6 -- 2026-10-15

### Fixed

- 0.10.5's Windows release leg still failed in its verify step: electron-builder's signing hook signs only the executables it produces (`redrob.exe`, `elevate.exe`, the uninstaller, the installer), not the bundled Redrob Code sidecar, so `redrob-code.exe` shipped unsigned and `signtool verify` found no signature. The release job now signs the sidecar itself, after the Azure login and right before packaging. The signer check compares the certificate's CN attribute. No application change; 0.10.4 and 0.10.5 shipped Linux only.

## 0.10.5 -- 2026-10-14

### Fixed

- The Windows release leg signed every artifact with the organization's Public Trust certificate, then refused its own result: the signer check compared the whole subject to `CN=McKinley Rice, Inc.`, but Windows renders a CN that contains a comma as `CN="McKinley Rice, Inc.", O=...`. The check now matches the CN in either form. No application change; 0.10.4 shipped Linux and macOS only.

## 0.10.4 -- 2026-10-14

### Windows and Linux: the chrome is the title bar (#176)

- 0.10.3 showed the 62px app chrome **under** the OS title bar and menu bar on
  Windows and Linux. The window is now frameless there: Windows keeps its own
  caption buttons over the strip (`titleBarOverlay`, Snap Layouts intact), Linux
  draws minimise / maximise / close in the chrome. macOS is unchanged.
- The OS menu bar is gone off macOS; a menu button at the left of the chrome
  pops up the active tab's File / Edit / View menu. Accelerators still work.

### Windows installer signed with Azure Artifact Signing (#177, #179)

- The installer, `Redrob Office.exe`, the uninstaller and the bundled Redrob
  Code sidecar are signed through Azure Artifact Signing (publicly trusted
  root) instead of the organisation's own certificate, so the signature
  verifies as `Valid` on every Windows. SmartScreen reputation still builds up
  per publisher over time.
- The release job logs in to Azure right before signing (not before the long
  build; the OpenID Connect token lives minutes), the signtool dlib excludes
  interactive credentials so a missing login fails in seconds, and the verify
  step requires the signer to be `CN=McKinley Rice, Inc.`.

## 0.10.3 -- 2026-10-14

### Office UI/UX refresh (#171)

- **62px chrome** with a nav cluster (sidebar toggle / Home swap) and Office brand
  logos in place of the Group ones, linking to the console.
- **Command-palette search** that also covers the native editor views, parking an
  overlay over them; the editor's own search bar is removed.
- **Inverted palette**, floating frosted sidebar (draggable, collapsible, dark
  mode), liquid-glass tiles, unified section headers, "Shared" rename, Projects
  tiles, "Open File", and a "Not connected" empty state.
- **Settings opens as a main-content pane** instead of a modal; sidebar navigation
  and project selection close it.
- **Launch splash** on startup.

### CI

- The visual screenshot suite and its `visual` CI job are removed (#172); UI
  coverage stays in the vitest suites.

## 0.10.2 -- 2026-10-13

- 0.10.1's macOS and Windows installers did not publish (release tooling);
  same contents, all three platforms.

## 0.10.1 -- 2026-10-13

- **The macOS and Windows installers of 0.10.0 did not ship.** The release
  asset-name check rejected electron-builder's own `builder-debug.yml` in the
  build output, so the desktop publish job never ran and only the Linux packages
  were attached (fixed in #162). This release carries the same changes as 0.10.0
  with all three platforms.

## 0.10.0 -- 2026-10-13

### Releases Redrob Launcher can install

- **Release assets follow the launcher grammar.** Every file is named
  `redrob-office-<version>-<os>-<arch>[-portable].<ext>`
  (`macos-aarch64`, `windows-x64`, `linux-x86_64`); the Windows installer is
  `-windows-x64-setup.exe` and a new `-windows-x64-portable.zip` ships the signed
  `win-unpacked` tree, since the launcher cannot run an exe installer.
  `scripts/check-release-asset-names.mjs` asserts the templates and the built
  release directory in both release workflows.
- **`redrob-launcher.json` is attached to every release.** The manifest
  (`{ "schema": 1, "sharedAccount": true }`) tells Redrob Launcher that this
  release reads the shared account file; `scripts/write-launcher-manifest.mjs`
  writes it in both release workflows and the asset-name check fails without it.
- **Sign-in borrowed from Redrob Launcher.** When Office has no Redrob Console key
  of its own it reads `~/.config/redrob-shared/account.json` instead of asking
  again.
- **The engine is told it runs for Redrob Office** (`REDROB_APP=office`), so the
  shared daemon can label and route requests per app.

### CI

- The three red `develop` checks are green at their root causes: the deferred
  pagination test types into a 40-paragraph document instead of 300; the six
  `blank2010_assets/*.bin` are committed through a `.gitignore` negation, the
  build is host-independent (`--remap-path-prefix`) and the hwp-core wasm plus
  `provenance.json` are regenerated from the committed source; Docs and Sheets no
  longer open blank in the visual run because their sandboxed preloads bundle
  `@genoffice/facts`, `@genoffice/versions` and `@genoffice/sync-client`
  (`pnpm check:preload` gates every CI build) and the baselines are retaken.


### One shared Redrob Code daemon

- **Office attaches to the shared engine instead of running its own.** The shell
  no longer spawns `redrob serve` per app. `apps/shell/src/main/engine-daemon.ts`
  reads the daemon record at `~/.redrob/run/server.json` (`REDROB_RUN_DIR`
  overrides the folder), reuses the registered daemon when `GET /api/health`
  answers, and otherwise runs `redrob service start --json --idle-exit 10` so
  the start logic lives in one place: the CLI. A user-installed `redrob`
  (`REDROB_CODE_BIN`, `~/.redrob/bin/redrob`, PATH) is preferred; without one,
  Office's bundled binary starts the SHARED daemon the same way, so a later
  Redrob Code install or another app finds it rather than starting a second
  engine.
- **Attach, heartbeat, detach.** Office registers as app `office` with its pid
  (`POST /api/clients`), renews the attachment every 30s, re-attaches when a
  heartbeat answers 404 (the daemon restarted), and detaches on quit. It never
  stops the daemon: the daemon exits on its own once no app has been attached
  for its idle window. `REDROB_APP=office` is set only on the `service start`
  child Office itself launches.
- **Every engine request names its working directory.** The daemon serves every
  project of every app, so `EngineIntegrationClient` sends `x-redrob-directory`
  alongside the `directory` query it already used.
- `managed-engine.ts` and its test are removed; `engine-lifecycle.ts` keeps the
  same `ensureEngine`/`teardownEngine`/IPC surface and the lazy, single-flight,
  failure-not-cached behaviour, with `close()` now meaning detach. Covered by
  `apps/shell/tests/engine-daemon.test.ts` (fake `redrob` binary + fake daemon
  HTTP) and `engine-lifecycle.test.ts`.

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
