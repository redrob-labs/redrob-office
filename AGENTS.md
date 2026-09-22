# AGENTS.md

## Cursor Cloud specific instructions

Redrob Office is a pnpm 9.15 + Turborepo monorepo. The product is `@genoffice/shell`
(`apps/shell`), which hosts Docs, Sheets, Slides, PDF, Markdown and Hangul editors as
`WebContentsView` children in one Electron window. Node 22 or newer is required. There is no backend,
database or broker to start locally.

The retired recruiting application is not in this repository at all. Neither the
`legacy-office-v0.0.0` tag nor the `cursor/legacy-office-v0-0-0-8171` branch exists on `origin`:
`origin` carries `main` and `develop` and nothing else, and no tag names the legacy application. Do
not reintroduce it, its `@redrob/*` packages, root scripts, or release paths into the suite.

### Branches

- `develop` is the default branch and the base of every pull request. `main` is released state and
  moves only by merging `develop` into it. Release tags are cut from `main`. This repository was
  single-trunk on `main` until 2026-09-17, so any older instruction that lands work on `main` is now
  wrong.
- A hotfix branches from `main`, merges into `main`, releases, and then `main` is merged back into
  `develop`. Do not skip that back-merge. The sibling repository redrob-code spent a month with a
  lockfile its own default branch could not install from because it was missed.
- Both branches are protected: pull requests only, force pushes and deletions blocked, 0 required
  reviews, admin enforcement off. Required checks are `build & test (ubuntu-latest)` and
  `fork boundary & licences`.

### Branch enforcement

`.github/workflows/gitflow.yml` checks the branch rules `CONTRIBUTING.md` writes down, because a
rule nothing checks is only a preference and `kiro/` branches this repository never defined already
exist. `branch name follows the convention` runs on every pull request and fails a head branch whose
prefix is not `feat`, `fix`, `chore`, `docs`, `test`, `refactor`, `perf` or `sync`, so a tool or
agent name is rejected: a branch name says what the change is, not what made it. `develop` and
`main` pass, since a promotion or back-merge branch is not named after a type. `main is contained in
develop` runs on pushes to `main` and fails while `main` holds commits `develop` does not, so a
skipped back-merge reports itself instead of surfacing a month later as a default branch that cannot
install. Neither job is a required check, so today they inform rather than block.

### Setup and tests

- `pnpm install` runs `scripts/ensure-electron.mjs` and prepares each app's Electron binary.
- After `pnpm install --ignore-scripts`, run `pnpm ensure:electron` before GUI work.
- Set `REDROB_SKIP_ELECTRON_ENSURE=1` only for headless typecheck/test work that never starts Electron.
- `pnpm build`, `pnpm typecheck`, and `pnpm test` run the complete workspace through Turborepo.
  All three depend on `^build`, and `apps/sheets` builds a Rust sidecar as its build step
  (`cargo build --release --manifest-path native/xlsx-engine/Cargo.toml`), so on a host without
  `cargo` all three fail at `@genoffice/sheets#build` before any TypeScript runs.
- `pnpm dev` starts the suite shell. On the cloud VM use
  `DISPLAY=:1 ELECTRON_DISABLE_SANDBOX=1 pnpm dev`.
- GUI testing must use the primary shell, not a standalone editor, because Home navigation and
  `WebContentsView` attachment are shell responsibilities.

### Product architecture

- `apps/shell`: Home, project navigation, editor view lifecycle, packaging, updates.
- `apps/docs`: DOCX editor and AI editing panel.
- `apps/sheets`: XLSX editor and AI editing panel.
- `apps/slides`: PPTX editor and AI editing panel.
- `apps/pdf`: PDF editor/conversion and AI tools.
- `apps/markdown`, `apps/hangul`: additional editors.
- `packages/agent-core`: shared ReAct loop, tool execution, history and compaction.
- `packages/ai-provider`: the route to the Redrob engine. BYOK and provider selection are ALLOWED as
  of 2026-09-22 — a user may connect their own Anthropic, OpenAI, Gemini, Copilot or OpenRouter
  access, because that is the only path those vendors permit a third-party app (see redrob-code
  `docs/PROVIDER-AUTH.md`). This reverses the earlier "one engine, no BYOK" rule, so an older
  instruction forbidding it is now wrong.
  Two constraints survive that reversal and are not style preferences:
  - **Office never holds a provider key.** Credentials live in the engine's own store and the engine
    makes the call; Office names a model and gets an answer. A product that holds no key cannot leak
    one. This also ends the five-separate-credential-stores problem that makes a user log in again in
    every Redrob app.
  - **No caller-supplied inference URL, ever.** `resolveEndpoint` must keep ignoring a configured
    base URL. Honouring one would forward the engine's credential to whatever host the caller named,
    and the engine's own config layer admits a new openai-compatible provider only at a local
    address. A local model is selected by its `provider/model` id, never by URL.
  The default route stays `redrob/auto` against `https://console.redrob.ai/api/backend/v1`; settings
  may leave `model` empty and the engine wires `auto`.
- `packages/ai-search`: Redrob-hosted search/image helpers.
- `packages/genoffice-ui`, `packages/i18n`, `packages/electron-utils`, `packages/project-store`:
  shared UI/runtime infrastructure.
- `packages/docx-engine`, `packages/pptx-engine`, `packages/pptx-render`, `packages/rhwp-editor`:
  document format engines.

Docs' AI panel is a real editing agent, not a prose-only chat. `apps/docs/src/renderer/ai/AiPanel.tsx`
uses `AgentLoop`, `createDocsSkill`, `createFilesSkill`, and local document tools. Keep the fail-closed
behaviour: a failed engine turn must be visible and must not silently switch providers or pretend tools
are unavailable. Tool mutations must retain rollback snapshots and edit-queue semantics.

### Continuous integration and the fork boundary

- `.github/workflows/ci.yml` runs on every pull request, on pushes to `main` and `master`, weekly at
  06:00 UTC on Monday, and on `workflow_dispatch`. `develop` is not in the push list, so a push
  straight to `develop` runs no CI; the pull request is where CI happens.
- `fork boundary & licences` is one job that runs `node scripts/check-upstream-boundary.mjs` with
  nothing installed. The dependency licence gate (`pnpm check:licenses`, `tools/check-licenses.mjs`)
  runs in the build job instead because it needs a resolved install, so the check named for licences
  is not the one that checks dependency licences.
- `build & test (ubuntu-latest)` installs with `--frozen-lockfile`, then runs `pnpm check:licenses`,
  `pnpm typecheck`, `pnpm build`, `pnpm test`.
- The Windows and macOS legs are one matrix job named `build & test (${{ matrix.os }})`, which
  expands to `build & test (windows-latest)` and `build & test (macos-latest)`. Neither name is a
  required check, and the job is gated to `schedule` and `workflow_dispatch`, so it never reports on
  a pull request and must not be added to the required list.
- This suite is a port of GenOffice (`https://github.com/genspark-ai/genoffice.git`, Apache-2.0,
  Mainfunc, Inc.), recorded in `upstream-base.json` with `docs/UPSTREAM.md` as the prose. There is no
  shared commit ancestry, so `git merge-base` against upstream resolves to nothing, `base.commit` is
  a measurement rather than a git pointer, and upstream work is taken file by file.
- The boundary guard exits 1, prints every violation, and points at `docs/UPSTREAM.md` when:
  `upstream-base.json` is missing or does not parse; `upstream.remote`, `upstream.defaultBranch` or
  `base.commit` is unset; `excludedReason` is blank; `attribution` is empty; `NOTICE` is missing or
  has lost `GenOffice`, `Mainfunc, Inc.` or `Janghoon Lee (Redrob)`; `LICENSE` is missing or has lost
  `Apache License` or `Version 2.0`; or any committed or staged file sits under an `excludedPrefixes`
  entry. That list is empty today and `excludedReason` records why.
- So a rebrand sweep, a file move, or a header cleanup that drops upstream's copyright line fails
  CI. Add your line, never replace theirs: Apache-2.0 section 4(d) is why `NOTICE` must keep
  Mainfunc's.

### Packaging and releases

- `apps/shell/electron-builder.cjs` is the only product packaging config.
- `v*` must match `apps/shell/package.json`.
- `.github/workflows/release-desktop.yml` signs Windows (and notarises macOS when enabled) and
  attaches the exact signed installers to the GitHub Release for the tag, together with `latest.yml`
  and `latest-mac.yml`.
- `.github/workflows/release-linux.yml` builds the unsigned Linux AppImage/deb/rpm, writes a
  `.sha256` beside each, and attaches them plus `latest-linux.yml` to the same release. It builds the
  Redrob Code sidecar first, because `beforePack` refuses to package without it.
- There is no CDN. Downloads and the updater feed are the same release assets. The feed target is
  baked in from `GENOFFICE_UPDATE_REPO` (`owner/repo`); unset means no publish config and no
  in-app auto-update, which is what a fork or a local build gets.
- `WIN_CSC_LINK` / `WIN_CSC_KEY_PASSWORD` must be visible to this repository; the Windows job fails
  fast when either is unset. A self-signed certificate has an
  Authenticode signer but may report `UnknownError`/`NotTrusted` and still trigger SmartScreen.

### Code style and safety

- Follow existing TypeScript style and package boundaries; do not duplicate document engines in apps.
- Shared renderer controls come from `@genoffice/ui`.
- Keep editor IPC contracts in each app's `src/shared/`: `ipc.ts` in `apps/docs`, `apps/slides`,
  `apps/pdf`, `apps/markdown` and `apps/hangul`, and `ipc-channels.ts` in `apps/sheets`. The shell has
  no `ipc.ts`; its contracts are `home-api.ts`, `tabs-api.ts`, `update-api.ts` and
  `pdf-password-api.ts`. The shell should host editors rather than reach into their renderer state.
- Do not commit credentials, local model files, generated package output, or test user-data profiles.
