# UI-ONLY build — stubbed & removed seams

This workspace is the **UI/UX layer** of Redrob Office, extracted from the desktop
app (PR #151) to run in a browser with no Electron backend. This file is the map
of every seam that was removed or stubbed, so the backend can be re-attached.

## What runs vs what is inert

| App | UI | Editing engine | Stubbed |
|---|---|---|---|
| shell | home / tabs / settings render | n/a | `window.aiOffice*` (recents, account, tabs, window, prefs) |
| markdown | TipTap editor runs on an in-memory doc | TipTap (client-side) | `window.markdownApi`, `window.projectApi`, DOCX/PDF export, AI |
| pdf | PDF.js viewer + overlays render | PDF.js + PDFium WASM (client-side) | `window.pdfApi` (save, page ops, OCR, convert, signatures, AI) |
| slides | Konva render of a RenderSlide view-model | render only (edits inert) | `window.slidesApi` (~130 methods), `window.desktop`, `window.projectApi` |
| docs | TipTap/ProseMirror editor runs on an in-memory doc | TipTap (client-side) | `window.desktop` (DesktopApi), `window.projectApi`; live collab disabled |
| **sheets** | **live Univer spreadsheet** — edit cells/formulas/charts/pivots | **Univer (LIVE)** | only `window.desktopApi` (xlsx open/save, sidecar), `window.projectApi`, AI |
| **hangul** | **live HWP editor** — open/edit a blank doc | **hwp-core WASM + hwp-editor (LIVE)** | only `window.hangulApi` (byte IO, versions/share/live, print, AI) |

The two editors you asked to keep working — **Sheets (Univer)** and **Hangul
(hwp-core/hwp-editor)** — are **not** stubbed; their engines run in the renderer.

## How the stubs are implemented

Each app installs `src/renderer/ui-stubs.ts` (imported first in `main.tsx`) that
puts inert, type-correct stand-ins on the `window.*Api` globals the preload
bridges used to provide. Small APIs (shell, markdown, pdf) have explicit
per-method stubs; large APIs (slides ~130, docs, sheets, hangul) use a `Proxy`
that answers every call with an inert default — `async () => null` for
operations, a no-op unsubscribe for `on*` subscribers, `void` for
fire-and-forget. To re-enable the backend, replace `ui-stubs.ts` with the real
preload bridge (or an HTTP/WS client) implementing the same `shared/ipc` contract.

## AI

The AI assistant transport (`@genoffice/ai-provider`) is carried whole but its one
network entry point (`src/fetch.ts` `aiFetch`) is neutralised to reject with
`AI_BACKEND_DISABLED_MESSAGE`, so AI panels render but surface the "engine
unavailable" notice. Restore `aiFetch` to a real `fetch` wrapper to re-enable.

## Packages: kept as real TS vs removed

- **Kept (real TS, browser-safe):** `genoffice-ui` (design system, re-exports the
  vendored `@redrob-labs/ui`), `i18n`, `versions`, `sync-client`, `pptx-engine`,
  `pptx-render`, `docx-engine`, `facts`, `identity`, `project-store`,
  `agent-core`, `ai-provider` (transport neutralised), **`hwp-core` (+ prebuilt
  `wasm/rhwp_bg.wasm`)**, **`hwp-editor`**.
- **UI-only slices (type/constant subsets of a formerly backend package):**
  `electron-utils` → only `office-prefs`; `font-metrics` → only
  `FaceVerticalMetrics`.
- **Removed entirely (backend / infra):** every app's `main/` + `preload/`,
  `ai-search`, `file-parse`, `pdf2docx` (one pure classifier vendored into the pdf
  renderer), `engines/rhwp` (Rust — the prebuilt WASM is committed instead),
  `services/sync`, the native sheets Rust `xlsx-engine`, electron-builder /
  updater / dist tooling.

## Design system

`@redrob-labs/ui` is vendored under `vendor/redrob-ui` (public source
`redrob-labs/redrob-ui`), so install needs no GitHub Packages token. Build its
`dist/` before typechecking the apps: `pnpm --filter @redrob-labs/ui build`.

## Univer version pin

All `@univerjs/*` packages are pinned to exactly `0.25.1` via `pnpm.overrides` in
the root `package.json`. `0.25.2` changed the `FUniver`/`FEventName`/`IPreset`
API and breaks the sheets renderer; the pin matches the original PR lockfile.
