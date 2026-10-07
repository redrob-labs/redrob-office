# AGENTS.md

## Cursor Cloud specific instructions

Redrob Office is a pnpm 9.15 + Turborepo monorepo. The product is `@genoffice/shell`
(`apps/shell`), which hosts Docs, Sheets, Slides, PDF, Markdown and Hangul editors as
`WebContentsView` children in one Electron window. Node 22 or newer is required. The desktop suite needs
no backend, database or broker to run; the optional sync service in `services/sync` (below) is the
only server code, and it runs locally and in CI only.

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
  of 2026-09-22 - a user may connect their own Anthropic, OpenAI, Gemini, Copilot or OpenRouter
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
- `packages/facts`: linked figures. It holds the reducer, the selectors and the `FactsStore` behind
  the shell's one index in userData (`linked-figures.json`), plus the `FACTS_CHANNELS` IPC contract
  and `factsBridge`. The main process stamps the author, time and id of every edit. In a DOCX file a
  figure is a `DOCVARIABLE RedrobFact_<id>` field (`RedrobFactWords_<id>` for its sentence), and the
  kept value is the field's cached result.
- `packages/versions`: version history kept on this computer (`VersionStore`), last visits and
  `catchUpItems`. Every Docs save is recorded through `setDocSavedHook`, and an encrypted file's
  versions stay encrypted. A restore writes a copy beside the file and never overwrites it.
- `packages/identity`: who is signed in for sharing. It has a Console OIDC device-flow provider, a
  development issuer and a `SessionStore`. See "Sharing and live documents".
- `packages/sync-client`: the desktop side of `services/sync`. It holds the HTTP client
  (`SyncClient`), the index of which local files are shared (`./node`), live rooms (`./live`,
  `./live-provider`), and the Share and Live IPC contracts (`shareBridge`, `liveBridge`). The
  package root has no Node or Electron dependency, so preloads and renderers may import it.

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
  `pnpm check:ui-tokens`, `pnpm check:ipc`, `pnpm check:copy` (English copy uses short dashes
  only), `pnpm typecheck`, `pnpm build`, `pnpm test`.
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

### Sync service

- `services/sync` is shared files, members and live documents: a Fastify HTTP API and a Hocuspocus
  WebSocket server over Postgres and any S3 store. It is its own project, outside the pnpm
  workspace, with its own `pnpm-lock.yaml`. Install it with `pnpm install --ignore-workspace` from
  that folder, so the root lockfile and the dependency licence gate never see it.
- It runs locally and in CI only, through `services/sync/docker-compose.yml`: Postgres, a SeaweedFS
  S3 gateway and the service. MinIO images stopped being published in 2026, so SeaweedFS stands in;
  the service speaks plain S3. There is no production deployment; do not add one without asking.
- `infra/sync` is Terraform for running it on AWS: a VPC, an ALB with `sync.` and `live.` hosts,
  one ECS Fargate task, RDS Postgres, S3, ECR and CloudWatch. It is **plan only**. Nothing has been
  applied, and `.github/workflows/infra.yml` (`terraform fmt & validate`) never applies; it plans
  only when run by hand with a read-only role. Do not apply it, or add an apply step, without
  asking.
- The service runs as one task on purpose. Live rooms live in one process, so `desired_count` is
  held to 1 until the Hocuspocus Redis extension is added.
- Production configuration (`NODE_ENV=production`) refuses to start unless:
  - `SYNC_JWKS_URL` and `SYNC_ISSUER` are https URLs;
  - `SYNC_AUDIENCE` is set explicitly;
  - `SYNC_DB_CA_FILE` names the CA that Postgres TLS is verified against.
- Without an S3 key pair or endpoint, the service uses the task role and the regional endpoint.
- Operations:
  - `/health` is liveness, and `/ready` checks the database and the store.
  - Rate limits apply per address, per account and per invite-link look-up, in memory and per
    instance.
  - JSON bodies are capped by `SYNC_BODY_LIMIT_BYTES`; only uploads take `SYNC_MAX_FILE_BYTES`.
  - Logs are JSON lines, with invite-link tokens and query strings redacted.
  - SIGTERM drains: readiness fails first, then live rooms, requests and the pool close.
  - Activity is pruned after `SYNC_EVENT_RETENTION_DAYS`.
- Every Compose port binds to 127.0.0.1. The stack runs the development issuer
  (`SYNC_DEV_ISSUER=1`), which mints a token for anyone who asks; the service refuses it when
  `NODE_ENV=production`. Real identity is Redrob Console tokens checked against Console's JWKS.
- `.github/workflows/sync.yml` (`sync service (docker compose)`) runs on pull requests that touch
  `services/sync/**`. It is not a required check and must not be added to the required list.
- File routes answer 404 to a non-member, so a file's existence is never disclosed. Roles are
  `owner`, `edit`, `comment` and `view`; below edit, live sessions are read-only, and presence is
  stamped server-side with the verified person.

### Sharing and live documents

- **The token never leaves the shell's main process.** `identity-service.ts` holds the session and
  persists it only through `safeStorage`; without the OS keychain the session lives in memory only.
  Renderers get the person's name, never the token. The sync client, the share service and the live
  rooms all run in main, and editors ask over IPC (`share:*`, `live:*`). Do not hand a token to a
  renderer to open a WebSocket from there.
- **Identity.**
  - Console, through OpenID discovery at `https://console.redrob.ai`, with client `redrob-office`
    and audience `redrob-office-sync`. An endpoint outside Console's origin is refused.
  - The session keeps the token whose `aud` names `redrob-office-sync`, normally the access token.
    A reply without one fails with `wrong_audience`.
  - What Console must provide is in `docs/console-requests/office-sync-identity.md`. Until Console
    ships it, only the development issuer works.
  - The development issuer is used only when `REDROB_IDENTITY=dev`, with a loopback sync URL, and
    never in a packaged app.
  - Settings shows this as the **Sharing** section. The words "Account" and "Sign in" are kept out
    of that pane because `cloud-account-hidden.test.ts` guards the retired cloud account.
- **Where the service is** (`apps/shell/src/main/sync-endpoints.ts`).
  - A packaged build uses what its release baked into `package.json` (`redrobSync`).
    `electron-builder.cjs` writes it from `REDROB_SYNC_URL` and `REDROB_SYNC_LIVE_URL`, which the
    release workflows pass from repository variables.
  - Both packaging and run time refuse anything but an `https` API and a `wss` live server on a
    public host: no loopback, no private or link-local addresses. An environment override in a
    packaged app must pass the same rules.
  - With nothing baked there is no service, and Share says it is not available yet.
  - A development build uses `REDROB_SYNC_URL`, or the local Compose stack
    (`http://127.0.0.1:8787`). The live server is the same host on port 8788 unless
    `REDROB_SYNC_LIVE_URL` says otherwise.
- **Sharing.**
  - The first invite uploads the saved file.
  - A Docs save by an owner or editor uploads a new version (through `setDocSavedHook`).
  - Home's "Shared with you" downloads a file into `Documents/Redrob Office/Shared` on open.
  - `shared-files.json` in userData maps local paths to shared files, with the version on disk.
- **Live documents.**
  - One room per shared file lives in the shell (`LiveHub`). Each view mirrors the Y.Doc over IPC.
  - Docs and Markdown are bound with y-prosemirror through `packages/live-text`, which takes a
    structural editor type because the two apps pin different tiptap versions. Docs uses the thin
    adapter `apps/docs/src/renderer/live/collab.ts`. The editor's own history is off, and undo is
    Yjs's, scoped to the person.
  - Markdown's front matter is a shared text of its own.
  - Sheets shares cell values and formulas, and Slides shares committed text-box text. Both are
    last writer wins per entry, through `packages/sync-client/src/live-models.ts`.
  - Slides addresses a box by slide part and `<p:cNvPr id>`. Someone else's edit is journaled but
    takes no undo step.
  - Other changes (formatting, structure) travel with the next saved version.
  - PDF and Hangul are versioned sharing only.
  - Comments live in the shared `comments` map, with random nine-digit ids.
  - Someone else's typing never marks a view unsaved.
  - View and comment roles are read-only live.
- **Every live view patches the same original bytes.** A Docs save patches the bytes it opened,
  using each block's `docxIndex`, so the shared `meta.base` key records which version the shared
  text is based on. After an upload the shell moves the base forward (`LiveHub.setBase`). Other
  views then re-parse that version from `live:pull`. The file on disk is never written behind an
  open editor. A change to Docs' save or load path must keep this rule.

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
- The sync service is baked in the same way, from `REDROB_SYNC_URL` and `REDROB_SYNC_LIVE_URL`
  (repository variables). See "Where the service is".
- `WIN_CSC_LINK` / `WIN_CSC_KEY_PASSWORD` must be visible to this repository; the Windows job fails
  fast when either is unset. A self-signed certificate has an
  Authenticode signer but may report `UnknownError`/`NotTrusted` and still trigger SmartScreen.

### Design system

The suite's chrome is the Redrob design system, `@redrob-labs/ui` (pinned exactly, from
`https://github.com/redrob-labs/redrob-ui`). Known gaps between the kit and what Office needs are in
`docs/redrob-ui-gaps.md`.

- The kit is a dependency of `@genoffice/ui` only. Apps import its components, `theme.css` and
  icons through `@genoffice/ui`, never from `@redrob-labs/ui` directly. Office-only controls
  (`Toolbar`, `DocTabs`, `Dialog`, `ColorPicker`, `Dropdown`, ScreenTips) are composed from kit parts
  in `@genoffice/ui`, not in an app.
- Every editor's AI panel is built from the agent parts in `packages/genoffice-ui/src/Agent.tsx`
  (`AgentPanelHeader`, `AgentEmpty`, `AgentMessage`, `AgentSteps`, `AgentWorking`, `AgentFailure`,
  `AgentUndelivered`, `AgentComposer`) with the shared extras in `agent.css`. A failed run renders as
  a non-dismissible danger alert, and sign-in is offered only for an authentication failure.
- Ribbon bands are wrapped in `Toolbar`, so they get one tab stop, arrow-key roving and
  `aria-pressed` toggles.
- Tokens: chrome reads the kit's names (`--surface-*`, `--ink-*`, `--border-*`, `--action-*`,
  `--status-*`, `--radius-*`, `--font-sans`). `packages/genoffice-ui/src/tokens.css` holds only
  Office extension tokens, which are values the kit has no semantic token for, picked per theme from
  its ramps. Never add an alias of a kit token there. The theme is always written to
  `<html data-theme>` by `applyUiTheme`, so renderer CSS never uses `@media (prefers-color-scheme)`.
  Document content (paper, cells, exports, chart palettes) never reads chrome tokens. There is one
  brand palette and no per-app accent. `pnpm check:ui-tokens` (`scripts/check-ui-tokens.mjs`,
  run in the build job) fails on a retired legacy token, a colour-scheme media query in renderer
  CSS, or a direct kit import outside `@genoffice/ui`.
- Third-party canvases get scoped override layers rather than forks. Univer uses
  `redrobUniverTheme()` (`apps/sheets/src/renderer/univer-theme.ts`). Hangul's built rhwp-studio is
  served under `/host/` on the studio's own loopback server, so the host page and the studio iframe
  are same-origin. `apps/hangul/src/renderer/studio-theme.ts` relies on that to inject kit token
  values into the studio.
- Visual regression lives in `tests/visual` and compares the shell's surfaces against committed
  Linux baselines in `tests/visual/__screenshots__/linux/`. The `visual (ubuntu-latest)` job is not a
  required check. When a change is meant to move pixels, the job fails and uploads a fresh render as
  the `visual-baselines` artifact. Review it, then commit only the baselines whose specs failed,
  from a signed commit by a person, not a bot. `VISUAL_LOCAL=1` renders locally into a
  platform-named folder that must not be committed.

### Code style and safety

- Follow existing TypeScript style and package boundaries; do not duplicate document engines in apps.
- Shared renderer controls come from `@genoffice/ui`.
- Keep editor IPC contracts in each app's `src/shared/`: `ipc.ts` in `apps/docs`, `apps/slides`,
  `apps/pdf`, `apps/markdown` and `apps/hangul`, and `ipc-channels.ts` in `apps/sheets`. The shell has
  no `ipc.ts`; its contracts are `home-api.ts`, `tabs-api.ts`, `update-api.ts` and
  `pdf-password-api.ts`. The shell should host editors rather than reach into their renderer state.
- Docs and Slides name every channel through `DOCS_CHANNELS` and `SLIDES_CHANNELS` in their
  `src/shared/ipc.ts`. A preload or main there never spells a channel as a string.
  `pnpm check:ipc` (`scripts/check-ipc.mjs`, run in the build job) fails on:
  - a string channel;
  - a name that is not in the map;
  - an invoke nothing handles;
  - a listener nothing sends to.
  Add a new channel to the map first.
- Linked figures are shared across editors through `packages/facts/src/figures.ts` (kept text,
  rewrites, use sync, field names) and `@genoffice/ui`'s `LinkedFigurePicker`.
  - Docs uses a `DOCVARIABLE RedrobFact_<id>` field.
  - Slides uses a `<a:fld type="RedrobFact_<id>">` text field.
  - Markdown uses `[text](redrob-fact:<id>)`.
  - `RedrobFactWords_<id>` and `#sentence` mark the sentence form.
- Hosted image generation and search call Console routes that do not exist yet, through an engine
  relay that does not exist yet (`docs/console-requests/office-ai-routes.md`, `docs/engine-api.md`).
  Until both exist they say "not available from Redrob yet", and never fall back to another
  provider.
- Do not commit credentials, local model files, generated package output, or test user-data profiles.
