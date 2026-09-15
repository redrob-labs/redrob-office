# PORT-DESIGN: GenOffice to Redrob Office (copy-verbatim layout)

## Decision

Adopt GenOffice's multi-app structure as the new base of `redrob-office`, and
port the original GenOffice code **verbatim** rather than rewriting minimal
editors. A prior attempt that hand-wrote reduced editors was rejected; this port
copies the upstream source files into the repository and rebrands them in place.

## Sources (read-only references)

- GenOffice: `/projects/sandbox/_refs/genoffice` (npm workspaces, 6 Electron
  apps: docs, sheets, slides, pdf, markdown, shell; 13 TS packages; ~442K lines).
- rhwp: `/projects/sandbox/_refs/rhwp` (Rust + WASM HWP/HWPX editor and the
  `@rhwp/editor` iframe SDK) - provides Hangul editing.

These are never git-submoduled or symlinked; their files are copied into the
target.

## Target layout

- **`apps/*`** - new top-level directory. Each GenOffice app is a self-contained
  Electron workspace (React 19, electron-vite, with `src/main`, `src/renderer`,
  `src/shared`, `tests/`). They are copied verbatim under `apps/` (for example
  `apps/docs`, `apps/sheets`, `apps/slides`, `apps/pdf`, `apps/markdown`,
  `apps/shell`). The shell owns a single `BrowserWindow` and mounts each editor
  renderer as a `WebContentsView` child (`apps/shell/src/main/tab-manager.ts`),
  importing each app's main-process entry directly. This is the pattern to port,
  not reinvent.
- **`packages/*`** - GenOffice packages are copied verbatim here, keeping their
  `@genoffice/*` names initially (rebranded to `@redrob/*` in a later feature).
  The existing Redrob packages (`@redrob/kernel`, `extract`, `compare`,
  `generate`, `store`, `registry`, `ui`, `telemetry`) remain untouched.
- **`office/`** - the existing `@redrob/office` Electron app and the Redrob
  engine (`office/src/main/redrob-code/*`, `services/chat.ts`, `tools/*`) stay
  as they are. The Redrob engine is layered on later as the AI feature that
  replaces GenOffice's `@genoffice/ai-provider` BYOK multi-provider layer, in
  line with the single-engine invariant (no BYOK, no provider selection).

## Package naming and React versions

- Keep `@genoffice/*` names during the initial verbatim copy so imports resolve
  unchanged; rename to `@redrob/*` in a dedicated rebrand feature to keep the
  copy step reviewable as a pure move.
- The React 19 GenOffice apps own their own React version inside their
  workspace; the existing `office/` app stays on React 18. pnpm's per-workspace
  resolution isolates them, so the two majors coexist without a root pin.

## Build-system integration

- `pnpm-workspace.yaml` lists `office`, `apps/*`, and `packages/*`. Turborepo
  discovers workspaces automatically, so `build`/`typecheck`/`test`/`dev` reach
  the new apps and packages once they exist, without new root task wiring.
- An empty `apps/` directory (with a `.gitkeep`) is fine at this baseline stage;
  no app is ported yet in FEAT-001.

## License and attribution obligations

- GenOffice is Apache-2.0. The root `LICENSE` (Apache-2.0) is kept. Upstream
  copyright notices are never removed (Apache-2.0 section 4): the root `NOTICE`
  now records the Mainfunc, Inc. copyright, the Unicode data notice, and rhwp's
  MIT copyright (Edward Kim, 2025-2026) alongside the existing Redrob entries.
- `LICENSE-UNICODE.txt` is copied to the repo root.
- `tools/gen-third-party-notices.mjs` and `tools/check-licenses.mjs` are copied
  into `tools/` so THIRD-PARTY-NOTICES can be regenerated at packaging time.

## Sheets Rust xlsx sidecar (apps/sheets/native/xlsx-engine)

The Sheets app (`@genoffice/sheets`, FEAT-004) ships a Rust sidecar binary that
does the .xlsx open/save/recalc round-trip. It is ported verbatim from GenOffice
(no source edits). The main process spawns the compiled binary; the TS client
(`apps/sheets/src/main/xlsx-sidecar-client.ts`) resolves the path via
`resolveSidecarPath()` in `sheets-main.ts`:

- dev: `apps/sheets/native/xlsx-engine/target/release/xlsx-sidecar` (`.exe` on Windows)
- packaged: `<resourcesPath>/native/xlsx-sidecar[.exe]`
- override: `XLSX_SIDECAR_PATH` env var

If the binary is absent the client throws a clear, honest error
(`XLSX sidecar failed to start (<path>): ...`) rather than falling back to any
CDN or remote service. The sidecar integration is never removed.

Build commands (run cargo from `apps/sheets`; the `--config` flag is required
because cargo discovers `.cargo/config.toml` from the working directory, not
`--manifest-path`):

```
# release binary (this is what npm run native:build runs)
cargo build --release --manifest-path native/xlsx-engine/Cargo.toml \
  --config native/xlsx-engine/.cargo/config.toml

# rust unit tests (npm run native:test)
cargo test --manifest-path native/xlsx-engine/Cargo.toml \
  --config native/xlsx-engine/.cargo/config.toml
```

Verified in this VM: Rust 1.92.0 is available and
`cargo build --release` compiles the sidecar (produces
`native/xlsx-engine/target/release/xlsx-sidecar`, ~10.7 MB). The Sheets
`test` script (`native:test && native:build && vitest run`) runs green.

## FEAT-005: Slides, PDF, Markdown apps + native/wasm build

The Slides (~110K), PDF (~44K), and Markdown (~17K) apps were copied verbatim
from GenOffice into `apps/{slides,pdf,markdown}`, overwriting the FEAT-003
placeholder main modules. The shell now hosts all five editors (docs, sheets,
slides, pdf, markdown) via the original relative-path imports in
`apps/shell/src/main/index.ts`; `@genoffice/slides` was restored as a
`workspace:*` devDependency in the shell (pdf/markdown are consumed by relative
path only, matching upstream, which declares just docs/sheets/slides).

### Native / WASM pieces (no local Rust toolchain step required)

Unlike Sheets (whose Rust xlsx sidecar must be compiled), neither Slides nor PDF
carries a Rust crate to build in this repository:

- **Slides** has no `native/` directory and no `native:build:universal` script;
  its package.json exposes only `dist:mac`/`dist:win`/`dist:dir` (electron-builder
  packaging). Its only WASM dependency is `harfbuzzjs`, an npm package. The
  verbatim main-process source (`apps/slides/src/main/shaped-metrics.ts`) imports
  the HarfBuzz WASM by a repo-root-relative path
  (`../../../../node_modules/harfbuzzjs/dist/harfbuzz.js` and `.wasm?asset`), which
  is how GenOffice's flat npm layout resolved it (root harfbuzzjs 1.5.0). pnpm's
  isolated store does not place harfbuzzjs at the repo-root `node_modules`, so a
  direct `harfbuzzjs ^1.5.0` devDependency was added to the ROOT package.json; that
  makes pnpm link `node_modules/harfbuzzjs` -> 1.6.1 at the workspace root,
  satisfying the literal import path without touching the verbatim source. The PDF
  app keeps its own nested `harfbuzzjs@0.10.3` (declared in its package.json),
  exactly as GenOffice did (root=1.x for slides, pdf-local=0.10.3).

- **PDF** resolves its PDFium WASM at runtime from the `@embedpdf/pdfium` npm
  package via `require.resolve('@embedpdf/pdfium/pdfium.wasm')` (its exports map
  maps `./pdfium.wasm` -> `./dist/pdfium.wasm`) and its HarfBuzz subset WASM from
  the `harfbuzzjs` package (`wasm-path.ts`). Both ship as installed npm assets;
  there is nothing to compile. `wasm-path.ts` throws a clear packaged-path error if
  an asset is absent, never falling back to a CDN. This makes the four shell
  `pdf-password-retry` tests (which FEAT-003 recorded as failing against the
  placeholder that threw) pass with the real pdf app.

No `cargo`/wasm build command is needed for FEAT-005; `pnpm install` provides all
WASM assets. The single Rust build in the port remains the Sheets xlsx sidecar
documented above.

## Scope of FEAT-001

FEAT-001 establishes only the merged-monorepo baseline: confirm the existing
build is green, add `apps/*` to the workspace, preserve license/notice
artifacts, remove the untracked dist-only leftovers from the rejected attempt,
and record this design. No editor code is written or copied here; FEAT-002
onward perform the verbatim code port.

## FEAT-006: Hangul (.hwp/.hwpx) editor via rhwp

GenOffice ships no Hangul app. The Hangul editing surface comes from rhwp
(Rust+WASM HWP/HWPX editor, MIT, Copyright 2025-2026 Edward Kim). This is
integration glue around rhwp's ORIGINAL editor, not a reimplementation of HWP
editing. No public CDN is ever used; the studio is self-hosted offline.

### Vendored components

- `packages/rhwp-editor` (`@rhwp/editor`): the iframe SDK copied verbatim from
  `/projects/sandbox/_refs/rhwp/npm/editor` (index.js/.d.ts, transport.js,
  document-agent-contract.js, README, tests). rhwp's MIT `LICENSE` sits beside
  it. Its transport/contract are not reimplemented. Its own contract tests run
  with `pnpm --filter @rhwp/editor test` (node --test, 32 tests, all pass).
- `apps/hangul/resources/rhwp-studio`: the rhwp-studio web build (`dist/`),
  self-hosted offline. rhwp's MIT `LICENSE` sits beside it.

### rhwp-studio build command (exact)

The studio is a Rust+WASM+Vite build. In this VM the prebuilt WASM package
(`_build/rhwp/pkg/rhwp.js` + `rhwp_bg.wasm`) and studio `node_modules` were
present, so the offline studio bundle was produced with:

```
cd /projects/sandbox/_build/rhwp/rhwp-studio
RHWP_DISABLE_EXTERNAL_WEBFONTS=1 npx vite build
```

From a clean rhwp checkout the full command is:

```
cd rhwp-studio
npm install
RHWP_DISABLE_EXTERNAL_WEBFONTS=1 npm run build   # tsc && vite build
```

`RHWP_DISABLE_EXTERNAL_WEBFONTS=1` bakes `disableExternalWebFonts: true` into
the bundle, so at runtime the studio selects the OFFLINE font source set and
filters out every `http(s)://` webfont (the jsdelivr URLs that remain in the
font-catalog data are inert strings, never fetched). The produced `dist/` is
copied to `apps/hangul/resources/rhwp-studio` (the large `samples/` fixtures dir
is dropped to keep the bundle lean). If the Rust+WASM toolchain is unavailable
in a future environment, the self-host seam still points at
`apps/hangul/resources/rhwp-studio`; re-run the command above to regenerate it.
Never point the iframe at a public CDN.

### Self-host seam (offline)

- `apps/hangul/src/main/studio-serve.ts` serves the bundled studio directory
  over an app-local loopback origin (`http://127.0.0.1:<port>`), binding to
  127.0.0.1, refusing path traversal, and falling back to `index.html` for SPA
  deep links. Shape adapted from the prior branch's
  `office/src/main/services/hangul-studio-serve.ts`.
- `apps/hangul/src/renderer/studio-origin.ts` asks the host for that origin and
  returns a null URL + offline reason when none is available. It NEVER returns
  the public CDN.
- `apps/hangul/src/renderer/HangulEditor.tsx` mounts the `@rhwp/editor` SDK with
  that explicit `studioUrl`, loads the pending document's bytes through the host
  seam, and on save runs the pure, unit-tested contract in
  `apps/hangul/src/renderer/hangul-save.ts`:
  `rhwp.export{Hwp,Hwpx} -> host.save (atomic write) -> rhwp.notifySaved`,
  never notifying the studio when the write fails or is canceled (so rhwp's
  auto-recovery draft survives for a retry). Byte-preserving HWP open/save and
  semantic-preserving HWPX/HML save are done INSIDE rhwp exactly as rhwp
  implements them.

### Shell wiring

`apps/shell` gains a `hangul` `TabKind` (`src/shared/tabs-api.ts`), a
`createHangulView`/`requestHangulClose`/`hangulIsDirty` mount in
`src/main/tab-manager.ts` (mirroring markdown), extension routing for
`.hwp/.hwpx` (`HWP_RE`, `routeDocumentPath`, `OPEN_DIALOG_EXTENSIONS`,
`supportedFileIn`, `applyPendingProject`), a `buildHangulMenu` (Open/Save/Save
As/Close), a Home launcher card + `home:new-hangul` IPC, and `@genoffice/hangul`
as a `workspace:*` shell devDependency. The offline studio server is stopped on
`before-quit` via `teardownHangul`.

### Tests

- `@rhwp/editor` contract tests: `pnpm --filter @rhwp/editor test` (32 pass).
- `apps/hangul` unit tests (`pnpm --filter @genoffice/hangul test`):
  `hangul-save.test.ts` (export -> save -> notifySaved ordering; never notifies
  on cancel/failure), `studio-serve.test.ts` (loopback origin, SPA fallback,
  traversal safety, missing-bundle error), `hwpx-roundtrip.test.ts` (the rhwp
  sample HWPX fixture is a well-formed ZIP/OCF container and the host save seam
  preserves rhwp's exported bytes verbatim).
- Gated: the full open->save byte/semantic round-trip runs INSIDE rhwp-studio's
  WASM iframe, which cannot run in this headless (no display/GPU) unit env. That
  live round-trip is gated behind `HANGUL_STUDIO_E2E=1` (documented, skipped
  here); rhwp's own suites exercise the WASM half.

## FEAT-008: Redrob rebrand + shell-as-primary integration

The final pass rebrands the **user-facing product identity** from GenOffice to
Redrob and makes the ported shell the primary surface of `redrob-office`. It
touches product-name strings only; no editor logic was rewritten.

### Package naming decision: KEEP `@genoffice/*`

The internal npm workspace package names stay `@genoffice/*` (and the shell app
keeps `@genoffice/shell`). They are not user-facing, and every ported file plus
its verbatim tests import them by that name; renaming repo-wide would touch
hundreds of imports and workspace refs for zero user-visible benefit and real
regression risk. Per Apache-2.0 section 4, only the product NAME must change,
not internal identifiers. So the rebrand is confined to user-facing surfaces:

- **Shell renderer copy** — `apps/shell/src/renderer/src/strings.ts`: the
  product name `GenOffice` was replaced with `Redrob` across all 19 locales
  (114 occurrences, en/ko parity preserved, zero em dashes introduced; the
  file's pre-existing 151 em dashes in non-English locales are unchanged).
  HTML `<title>`s (`index.html`, `pdf-password.html`, `update.html`), the Home
  logo `alt`, and the update-window logo `alt` are now Redrob.
- **Window title / tabs** — `apps/shell/src/main/index.ts` BrowserWindow
  `title`, TabManager Home tab title, and the `docs` untitled fallback are now
  `Redrob` / `Redrob Docs` (tab-manager.test.ts updated to match).
- **Build metadata** — `apps/shell/electron-builder.cjs`: `appId`
  `com.genoffice.app` -> `com.redrob.app`, `productName` `GenOffice` ->
  `Redrob`, `executableName`/deb+rpm `packageName`/artifact names `genoffice`
  -> `redrob`; `apps/shell/package.json` `productName` -> `Redrob`,
  `desktopName` `genoffice.desktop` -> `redrob.desktop`, `author` -> `Redrob`.
  Each editor app's `package.json` `productName` (`GenOffice Docs/Sheets/
  Slides/PDF/Markdown/Hangul`) and per-app `build.appId`/`build.productName`
  (docs, slides) were rebranded to `Redrob *` / `com.redrob.*`. The
  `GENOFFICE_USER_DATA` dev env var and the `GenOffice Dev` userData dir stay
  as internal dev-profile plumbing (not display copy), like the package names.
- Upstream copyright is untouched: `LICENSE`, `NOTICE` (Mainfunc, Inc.; rhwp
  MIT / Edward Kim; Unicode), and `LICENSE-UNICODE.txt` are preserved.

### Integration: shell is primary, `@redrob/office` coexists

Decision (b) + a launcher change: the two Electron apps **coexist** in the
monorepo and the ported shell is the primary surface. `@redrob/office` (the
recruiting app + Redrob engine) is NOT deleted and stays fully reachable.

Root `package.json` scripts:

- `pnpm dev` -> `turbo run dev --filter=@genoffice/shell` (the office suite:
  one BrowserWindow hosting docs/sheets/slides/pdf/markdown/hangul as
  WebContentsView children).
- `pnpm dev:office` -> `turbo run dev --filter=@redrob/office` (new alias to
  launch the recruiting app directly).
- `pnpm dev:web` -> unchanged; still serves the `@redrob/office` renderer
  headless at :5173 (the AGENTS.md mock-bridge preview). Verified: boots, HTTP
  200.
- `pnpm build` / `pnpm typecheck` / `pnpm test` -> unchanged `turbo run *`;
  Turborepo already discovers every workspace (office + apps/* + packages/*),
  so they cover the ported suite.
- `pnpm dist` -> `pnpm build && pnpm --filter @genoffice/shell dist:linux`
  (packages the ported suite; `dist:office` alias retained for the recruiting
  app). Real packaging needs a build host with the Electron binary downloaded
  and the Sheets Rust xlsx sidecar built (documented; not runnable in this
  headless VM).

The single Redrob AI engine (FEAT-007) is the only AI layer; the obsolete
Genspark `gsk` CLI sidecar was removed from `electron-builder.cjs`
extraResources and its build guard (there is no cloud CLI to bundle under the
single-engine policy).

### Third-party notices + license gate (pnpm)

- `tools/gen-third-party-notices.mjs`: the generated notices header product
  name is now `Redrob` (and its em dash was dropped). The bundled OFL font
  FAMILY names (`GenOffice Sans KR`, etc.) are left as-is: they are the actual
  renamed-derivative font-family identifiers used by the font assets/CSS, not
  display copy, so renaming them would break font resolution. The generator
  otherwise runs only on a packaging host: it `require()`s
  electron-builder.cjs, whose guard needs the downloaded Electron binary
  (`LICENSES.chromium.html`) and installed WASM assets, absent in this headless
  VM. This is an environmental limitation; the config now reflects the merged
  single-engine dependency set.
- `tools/check-licenses.mjs`: rewritten to read `pnpm licenses list --prod
  --json` instead of npm's `package-lock.json` (this repo is a pnpm workspace,
  so the verbatim GenOffice npm-lock reader could not run). Same allowlist and
  SPDX-expression logic. Documented exceptions were added for the merged
  `@redrob/office` dependency set: `buffers` (substack, MIT, no license field
  in its 2012 release), `duck` (BSD-2-Clause LICENSE, legacy `"BSD"` string),
  and the `@img/sharp-libvips-*` prebuilt binaries (LGPL-3.0-or-later,
  dynamically-linked separate shared libraries, allowed by name with a written
  rationale). `node tools/check-licenses.mjs` now passes.

### Verification (Node 22 via nvm, pnpm 9.15.0)

- `pnpm install` -> up to date, exit 0.
- `pnpm typecheck` -> 42/42 tasks successful.
- `pnpm build` -> 16/16 tasks successful.
- `pnpm test` (serial `--concurrency=1` for a deterministic result) -> 39/41
  test tasks pass. The only 2 failing tasks are pre-existing ROOT-USER `chmod`
  environmental cases (the VM runs as root, so `chmod` read-only/`0` does not
  actually block root): `@genoffice/electron-utils`
  `default-save-dir.test.ts` (already documented) and `@genoffice/markdown`
  `close-asset-cleanup.test.ts` (same class; confirmed failing identically on
  the pre-FEAT-008 base via git stash, so not a rebrand regression).
  `@genoffice/docs` and `@genoffice/docx-engine` fail ONLY under full parallel
  load (memory pressure) and pass in isolation and serially. `@redrob/office`
  passes 946 in the full suite (the `artifacts.test.ts` stale-markdown case is
  the documented order-sensitive quirk that passes in-suite).
- `node tools/check-licenses.mjs` -> passes.
- `pnpm dev:web` -> boots, HTTP 200 at :5173.
- Ported the two GenOffice repo-root artifacts the shell suite needed so it is
  now fully green (17 files / 219 tests): `scripts/update-feed-utils.cjs`
  (verbatim, product-name-agnostic) and `PRIVACY.md` (rebranded to Redrob; the
  event-bullet em-dash delimiters are kept because the ported verbatim
  `privacy-doc.test.ts` parses that exact `- \`event\` —` format).
- Full Electron GUI end-to-end and local GPU inference remain not verifiable in
  this headless no-GPU/no-display VM (expected per AGENTS.md); verified
  structurally via typecheck/build/test and the dev:web boot.
