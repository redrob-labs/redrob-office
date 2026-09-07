# Changelog

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
