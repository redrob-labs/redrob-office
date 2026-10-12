# Redrob Office — UI/UX

The **user-interface layer** of the Redrob Office suite, extracted to run without the
Electron desktop backend. This workspace contains the renderer (React) surfaces of every
editor plus the shared design system. It is a clean-room UI codebase: no Electron main
process, no IPC bridges, no file-system access, no AI transport, no sync/identity/persistence.

Two editing engines are **kept live** so their editors remain functional in the browser:

- **Sheets** — the Univer spreadsheet engine (`@univerjs/*`), mounted in the renderer.
- **Hangul** — the `@genoffice/hwp-core` (prebuilt WASM) + `@genoffice/hwp-editor` engine.

Everything else that was backend in the desktop app is either removed or replaced with a
thin UI stub (see `UI-ONLY-NOTES.md` for the exact seams).

## Layout

```
apps/        shell, docs, sheets, slides, markdown, pdf, hangul — renderer UI only
packages/    genoffice-ui (design system wrapper), i18n, and the kept engine/support libs
vendor/      redrob-ui — the @redrob-labs/ui design system, vendored from source
```

## What was removed vs the desktop app

| Removed (backend / infrastructure) | Kept (UI/UX) |
|---|---|
| Electron `main/` process, window & tab management | React renderers (components, views, CSS) |
| `preload/` IPC bridges, `shared/ipc.ts` contracts | the shared design system + tokens/theme |
| File open/save, atomic writes, recovery | i18n strings, icons, fonts |
| AI transport (`ai-provider`, `ai-search`, `agent-core`) | AI panel **UI** (transport stubbed → "unavailable") |
| Document engines (docx, pdf2docx, file-parse, font-metrics) | Sheets (Univer) & Hangul (hwp) **engines** kept live |
| Sync server/client, identity, project/version persistence | version-history & share **UI** (stores stubbed) |
| Native builds, electron-builder, updater, Rust `engines/rhwp` | prebuilt Hangul WASM (committed) |

## Build

```bash
pnpm install           # resolves @redrob-labs/ui from vendor/, no private registry needed
pnpm --filter @redrob-labs/ui build   # build the vendored design system dist/ first
pnpm typecheck
pnpm build
```

The design system is vendored under `vendor/redrob-ui` so no GitHub Packages token is
required. It builds with `tsc` + a few generator scripts; on Windows build it from Git bash.

## License

Apache-2.0. See `LICENSE`. The vendored design system and the Hangul core carry their own
licenses (MIT for the rhwp-derived core); see the respective package directories.
