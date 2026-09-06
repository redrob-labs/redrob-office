# Changelog

## Unreleased

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
