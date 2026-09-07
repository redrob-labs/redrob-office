# AGENTS.md

## Cursor Cloud specific instructions

Redrob Office is a pnpm 9.15 + Turborepo monorepo. The product is `@genoffice/shell`
(`apps/shell`), which hosts Docs, Sheets, Slides, PDF, Markdown and Hangul editors as
`WebContentsView` children in one Electron window. Node 22 or newer is required. There is no backend,
database or broker to start locally.

The retired recruiting application is not on `main`. Its source archive is the
`legacy-office-v0.0.0` tag / `cursor/legacy-office-v0-0-0-8171` branch. Do not restore it, its
`@redrob/*` packages, root scripts, or release paths into the suite.

### Setup and tests

- `pnpm install` runs `scripts/ensure-electron.mjs` and prepares each app's Electron binary.
- After `pnpm install --ignore-scripts`, run `pnpm ensure:electron` before GUI work.
- Set `REDROB_SKIP_ELECTRON_ENSURE=1` only for headless typecheck/test work that never starts Electron.
- `pnpm build`, `pnpm typecheck`, and `pnpm test` run the complete workspace through Turborepo.
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
- `packages/ai-provider`: one Redrob engine route. Do not add provider selection, vendor BYOK, or an
  arbitrary inference URL. The fixed Console API is `https://console.redrob.ai/api/backend/v1`, model
  `redrob-ai` / route `redrob/auto`.
- `packages/ai-search`: Redrob-hosted search/image helpers.
- `packages/genoffice-ui`, `packages/i18n`, `packages/electron-utils`, `packages/project-store`:
  shared UI/runtime infrastructure.
- `packages/docx-engine`, `packages/pptx-engine`, `packages/pptx-render`, `packages/rhwp-editor`:
  document format engines.

Docs' AI panel is a real editing agent, not a prose-only chat. `apps/docs/src/renderer/ai/AiPanel.tsx`
uses `AgentLoop`, `createDocsSkill`, `createFilesSkill`, and local document tools. Keep the fail-closed
behaviour: a failed engine turn must be visible and must not silently switch providers or pretend tools
are unavailable. Tool mutations must retain rollback snapshots and edit-queue semantics.

### Packaging and releases

- `apps/shell/electron-builder.cjs` is the only product packaging config.
- `v*` must match `apps/shell/package.json`.
- `.github/workflows/release-desktop.yml` signs Windows and publishes the exact signed installer to
  both GitHub Releases and `office/<version>/`, then moves `office/latest/` only after public checksum
  verification.
- `.github/workflows/release-office-cdn.yml` builds unsigned Linux AppImage/deb/rpm and follows the
  same immutable-version-then-latest contract.
- `WIN_CSC_LINK` / `WIN_CSC_KEY_PASSWORD` are organization secrets. A self-signed certificate has an
  Authenticode signer but may report `UnknownError`/`NotTrusted` and still trigger SmartScreen.
- CDN credentials are PutObject-only. Never rely on S3 listing, HeadObject, or server-side copy.

### Code style and safety

- Follow existing TypeScript style and package boundaries; do not duplicate document engines in apps.
- Shared renderer controls come from `@genoffice/ui`.
- Keep editor IPC contracts in each app's `src/shared/ipc.ts`; the shell should host editors rather than
  reach into their renderer state.
- Do not commit credentials, local model files, generated package output, or test user-data profiles.
