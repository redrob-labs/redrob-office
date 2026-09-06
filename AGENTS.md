# AGENTS.md

## Cursor Cloud specific instructions

Redrob Office is a **single-product** pnpm + Turborepo monorepo: an on-device (offline-first)
Electron office suite (`office/` = `@redrob/office`) backed by workspace packages under
`packages/*` (`kernel`, `extract`, `compare`, `generate`, `store`, `registry`, `ui`, `telemetry`).
There is **no backend server / database / broker to run** — all "services" are in-process
subsystems of the Electron app. Node `>=22`, pnpm `9.15.0`. Standard scripts live in the root
`package.json`.

### Running in the cloud VM (no GPU, headless)

- `pnpm dev` launches the **Redrob Office suite shell** (`@genoffice/shell`): one BrowserWindow
  hosting Docs/Sheets/Slides/PDF/Markdown/Hangul as `WebContentsView` children. This is the
  primary product surface. The legacy recruiting app (`@redrob/office`) coexists and is launched
  separately with **`pnpm dev:office`** (`turbo run dev --filter=@redrob/office`).
- The cloud VM has **no GPU and no display**. The full Electron apps (`pnpm dev` /
  `pnpm dev:office`) need a display, and local AI inference (`llama-server`) is **GPU-only** so
  real chat/extract/scoring/ASR and `pnpm download:models` (multi-GB weights) **cannot run here**.
  Do not treat this as a bug.
- Use the headless dev flow instead: **`pnpm dev:web`** serves the **`@redrob/office`** React
  renderer at http://localhost:5173 (strict port). It runs that recruiting-app UI with no Electron
  and no GPU. Note `dev:web` covers `@redrob/office` only, not the suite shell.
- In web mode the Electron preload IPC is absent, so `ensureOfficeBridge()` installs a **browser
  mock** (`office/src/renderer/src/desk-bridge.ts` → `createMockOfficeApi`). Template-based flows
  work end-to-end against the mock (e.g. drafting a job posting / JD, chat sessions, memories,
  workflows). Actions that require the real model throw `"Browser mock: ... runs only inside
  Electron Desk."` — that is expected in the browser preview, not a failure.

### Lint / typecheck / test / build

- `pnpm build`, `pnpm typecheck`, `pnpm test` all run via Turborepo and pass in the cloud VM.
- `pnpm lint` is a **no-op**: no workspace package defines a `lint` task, so turbo runs nothing.
- `better-sqlite3` is listed in `pnpm.neverBuiltDependencies`; its build script is skipped on
  install, but tests still load it via a prebuilt binary. `pnpm rebuild:native` (sharp/koffi/
  better-sqlite3) is only needed when packaging the real Electron desktop app, not for
  `dev:web`/tests.

### Running the FULL Electron app headless (real chat / tools, no GPU)

`dev:web` uses a mock bridge, so it cannot exercise real chat/agent tools. To run a real
main-process Electron app without a GPU, launch it on the VM's virtual display:

- Display: `:1` (Xvfb is already running — it's the same display the computer-use tooling drives).
- **Office suite (the primary surface):** `DISPLAY=:1 ELECTRON_DISABLE_SANDBOX=1 pnpm dev`
  (`@genoffice/shell`). This is what to launch to inspect Home / Docs / Sheets / Slides / PDF /
  Markdown / Hangul.
- **Legacy recruiting app + Redrob engine:** to exercise the real chat/agent tools, route
  inference to a cloud provider and launch `DISPLAY=:1 ELECTRON_DISABLE_SANDBOX=1 pnpm dev:office`
  (equivalently `pnpm --filter @redrob/office dev`). The `bus.cc` / `viz_main_impl` / `login1`
  errors in the log are benign in this headless container.
- The renderer dev-server port auto-bumps to `5174` if `dev:web` already holds `5173`.
- Skip the model-download wizard by pre-seeding `setup.json` in the app's userData dir
  (`~/.config/@redrob/office/setup.json`) with `completedAt` set and a Redrob Console key:
  `"inferenceRoute": "openai"`, `"mode": "local"`, and
  `"llmProviders": {"openai": {"apiKey": "<key>", "baseUrl": "https://console.redrob.ai/api/backend/v1"}}`.
  A configured key makes
  `needsLocalWeights` false (see `App.tsx`), so the app boots straight to the workspace.
  `getSetupSnapshot` rewrites inference env vars from this file on boot, so the file — not env
  vars — is authoritative for the route. (Do not commit real API keys.)
- Office accepts only keys issued at `https://console.redrob.ai`; do not expose
  vendor BYOK choices or configurable inference server URLs. The fixed API base
  is `https://console.redrob.ai/api/backend/v1` and model is `redrob-ai`.
- The Console API is documented at `https://console.redrob.ai/docs/api-reference`
  (OpenAPI JSON at `/api/backend/docs-json`), and `docs/console-api.md` records
  the verified contract. Read it before changing hosted inference. Its
  OpenAI-compatible chat endpoint supports content blocks, `tools`,
  `tool_choice`, `tool_calls`, the `tool` role, and both `max_tokens` and
  `max_completion_tokens`; the full agent tool round trip was verified live.

Behavior note: the **general chat** agent (`office/src/main/services/chat.ts`) only has the
`web_search` tool; URL summarize works because ChatPanel pre-fetches URLs via `office:fetchPage`
and injects them as context. It has **no email-send tool** — asked to email a summary it declines
and suggests copying manually. Sending mail is a `runTask` computer-use flow (drive Gmail/webmail
in a browser), which needs desktop control enabled and a logged-in mail account.

### Computer-use (agent tools: shell/fs/app/desktop) testing

- The agentic multi-tool path (`runTask`, registry in `office/src/main/tools/registry.ts`,
  prompt in `office/src/main/office/runtime.ts`) is separate from general chat. In the composer,
  the amber **"PC"** toggle enables it; it defaults **on** (still not persisted across reload —
  a fresh chat starts with PC on again). Plain requests like "ping google.com" use computer use
  when the toggle is on.
- Permissions live in `~/.config/@redrob/office/computer-use.json` (schema `office/src/main/office/config.ts`).
  Product default is CLI-agent style: `profile: "full"`, `execSecurity: "full"`, `execAsk: "off"`
  (any shell binary allowed; no allowlist gate). Older installs with `allowlist`/`author` migrate
  once via `policyRevision`. Settings can still narrow to allowlist/deny/author. High-risk tools
  may still prompt in-chat ("Needs your permission") unless already approved. Desktop control is
  still off until enabled (`desktopControl: true`).
- Gotcha: `/tmp` (and other system dirs) are on a **hard denylist** regardless of `allowedPaths`;
  the agent must write under the artifacts dir `~/.local/share/redrob/artifacts`. Files written
  there surface in-app as an artifact/side panel (this is how "attach a file to the chat" works —
  there is no direct chat-upload tool for the agent).
- Verified working headless: PC toggle → agent runs `shell.exec` (`ping`, `ifconfig`) → `fs.write`
  a `.txt` into the artifacts dir → artifact opens in chat.
- Web tasks now use the **DOM-grounded browser tools** (`browser.*`, set-of-marks by numbered
  element, incl. same-origin iframes / rich-text editors) instead of pixel clicks — far more
  reliable. Real "send email" on sites like anonymousemail.me still stops at their Cloudflare
  human-verification CAPTCHA (by design — do not try to bypass it).
- Slack, Discord, and WhatsApp messaging is **MCP-only** so sends can run without taking foreground
  focus. Their presets are in the MCP Hub. Do not restore Slack desktop playbook injection or
  auto-route messaging asks to computer use; if no matching `mcp__` tool is connected, direct the
  person to Settings → MCP Servers instead.
- Shared renderer controls live in `packages/ui/src/components/ui` and follow the shadcn
  architecture (`packages/ui/components.json`, Radix behavior, CVA variants, `cn`). Use its
  `Button`, `Select`, `Tabs`, and `Card` instead of hand-copying Tailwind control classes. Shared
  Button heights are `xs=28px`, `sm=32px`, default `36px`. Keep Tailwind's `content.relative`
  enabled: without it, package-level classes disappear from the production renderer CSS.
- **Native (non-web) app grounding via AT-SPI is now implemented on Linux.** `ui.elements` reads
  the accessibility tree of a native app (e.g. mousepad, GTK apps) and returns a numbered set-of-marks
  the model clicks with `input.click { elementId }`; AT-SPI reports absolute screen pixels, which is
  exactly the space the X11 backend (`xdotool`) clicks, so there is no DPI calibration. Reader:
  `office/src/main/desktop/ui-elements-linux.ts` (a `python3` + `pyatspi` subprocess), dispatched by
  platform in `ui-elements-native.ts` (Windows still uses the PowerShell UIA host). It degrades
  gracefully — when `python3`/`pyatspi` or an AT-SPI bridge is absent, `ui.elements` returns a plain
  "use screen.capture" message rather than failing.
  - To verify in this headless VM the accessibility bus must be running and the app must be launched
    inside it, e.g.: install `python3-pyatspi at-spi2-core libatk-adaptor`, then launch the app under
    `dbus-run-session -- bash -lc 'export GTK_MODULES=gail:atk-bridge; /usr/libexec/at-spi-bus-launcher --launch-immediately & sleep 1; DISPLAY=:1 pnpm --filter @redrob/office dev'`.
    Apps opened via `app.launch` inherit that session, so the app's reader can see them. Verified:
    chatbot → `app.launch mousepad` → `ui.elements` lists `File/Edit/Search/View/Document/Help` +
    text field → `input.click` File opens the File menu.

### Recruiting pipeline — what runs on the cloud route (no GPU)

The #1 product flow is JD → rubric → bulk intake → assess/score → verify → decision email
(`office/src/main/services/{jd,rubric,intake,assess,verify,email,workflow}.ts`).
- **Console-capable (no GPU):** `draftJd` (cloud slot-fill), `generateRubric`
  (deterministic, no model), `draftDecisionEmail` + `runPublish` (template only).
- **Needs input files, degraded on cloud:** `runIntakeBatch`/`@redrob/extract` — cloud field-fill
  works but confidence is forced low (fields flagged for review); local inference gives real
  logprobs.
- **Cloud-capable assess:** `runAssess`/`@redrob/compare` follows `inferenceRoute`.
  `scoreAxesCloud` scores rubric axes through the configured cloud provider, marks confidence as
  degraded (cloud APIs expose no usable logprobs), and rejects scores whose quoted evidence does
  not occur in the cited input lines. Local scoring still uses `FieldFillSession` + GBNF.
- **Orchestration:** `recruiting-pipeline.ts` runs JD → rubric → intake → assess → decision email,
  passing artifact/run/document ids through one resumable context. Electron exposes it as
  `office:runRecruitingPipeline`; `workflow.ts` remains the preset/editor service.
  Cloud smoke requires a Redrob Console key.
- **Flows → Run:** the Run button in Workflows maps a saved flow's steps onto the runner's five
  (`workflow-pipeline.ts`), collects the inputs those steps need in `WorkflowRunPanel.tsx`, and
  calls `office:runRecruitingPipeline` with progress on `office:pipelineProgress`. Steps the runner
  cannot drive (verify, publish, custom) are listed as manual; a flow with none of the five still
  falls back to opening its first step in Work. Verified in the real Electron app on the cloud VM:
  a saved `jd → rubric` flow drafts the posting and writes `registry/rubrics/recruiting/from-jd.v1.yaml`.
- **Tasks ↔ Flows:** a flow step opened by hand carries the flow with it. `flow-task-link.ts` maps
  steps to task panels, tells hand steps from the runner's five, and walks to the next unfinished
  one; `FlowTaskBar.tsx` renders the strip above the task tabs (flow name, step chips, "완료하고
  다음"/"흐름으로") and the "포함된 흐름" chips a task shows when it belongs to a flow. Hand steps
  ticked off in Tasks come back as `done` in the run timeline (`handDone` on `WorkflowRunPanel`), so
  the flow reflects work nobody automated. Progress lives in the renderer for the session only.
- **Flows as chat skills (OpenWork-style rail):** a saved flow is a skill the person wrote. Chat
  names them in the system prompt (`formatFlowsBlock` — title + description only), and three
  registry tools carry the rest: `workflow.search` (find by query), `workflow.execute` (mode
  `guide` returns the skill body / step list; mode `run` drives the recruiting pipeline steps;
  mode `auto` runs when inputs are ready, otherwise guides), and `workflow.save` (define one from
  chat). The engine sees them via the shared tool registry over the MCP bridge. Long runs report
  progress as chat `step` events. Covered by `src/main/services/workflow*.test.ts` and the engine
  contract test; the old `flow:chat-e2e` smoke drove a second engine through OpenRouter and went
  with it.
- **OpenWork-borrowed UX + stability (locked by tests):**
  - _Tool calls as sentences._ `capability-sentence.ts` maps a tool name + args to a present/past
    sentence; `chat.ts` sends both on each `step` event and `ChatPanel` renders them with a
    spinner/check/✕. A flow's own progress lines arrive as `nested` sub-lines under it, and a
    settled turn folds its steps to one "Worked · N steps" `<details>`. Contract:
    `capability-sentence.test.ts` (never leaks a raw id; truncates long details).
  - _`/` flow palette._ The composer has a second, distinctly-keyed mention (`slashFlow`, char `/`)
    listing saved flows; a pick drops a green chip that `rich-text.ts` serialises to
    `Run my "<title>" flow (flow id: <id>).` so the model calls `workflow.execute` on the exact one.
    Contract: `rich-text.test.ts`.
  - _Skill preview._ `WorkflowRunPanel` shows the flow's `description` (when to use) and
    `instructions` (how — the skill body) above the run timeline.
  - _Honest failure steering._ `redrob-code/steering.ts` builds the
    Redrob-branded install/connect notice (`redrobCodeUnavailableMessage`) and
    `hasDegradedSteering()` rejects any line that tells a model its tools are
    gone; `redrob-code/steering.test.ts` locks it (no silent degraded mode, no
    third-party name in copy). There is one engine, so a failure is a failure,
    not a swap.
  - _Validate before persist._ `validateWorkflow` throws `WorkflowValidationError` with a stable
    `code` (`title_too_long`, `dup_step_id`, `bad_engine`…) checked by `user-workflows.test.ts`,
    and `WORKFLOW_LIMITS` caps title/description/instructions/steps/notes. `workflow.save` returns
    that `code` in its error `data` so the model is told exactly what to fix.
  - _Dev profile isolation._ `resolveUserDataDir` (dev-profile.ts) files a worktree under
    `userData/profiles/<name>` when `REDROB_DEV_PROFILE=<name>` is set (an explicit
    `REDROB_OFFICE_USER_DATA` still wins), so two checkouts never share one SQLite file.
    Contract: `dev-profile.test.ts`.
- **Redrob Code is the only engine:** cloud chat and the computer-use/runTask
  path both run on the Redrob Code sidecar. There is no engine-selection flag
  (`REDROB_OFFICE_ENGINE` is gone) and no silent fallback to another loop; if the
  sidecar cannot start, the turn fails visibly with a Redrob-branded
  install/connect message (`redrob-code/steering.ts` `redrobCodeUnavailableMessage`;
  never "answered on Redrob's engine", never a third-party name). Office's tool
  registry reaches the engine through an in-process MCP bridge
  (`redrob-code/mcp-bridge.ts`): the engine refuses HTTP tool registration into
  its own process, so the bridge is a plain `node:http` JSON-RPC server registered
  at runtime with `POST /mcp` and the `x-redrob-directory` header, and its tools
  reach the model as `redrob-office_<tool>`. The turn drives the V1
  `/session` + `/event` surface (the V2 `/api/session` cannot host product tools).
  A newly created V1 session omits MCP tools on its very first model call, so a
  fresh session is primed once (`redrob-code/session.ts`) before the real prompt.
  First-run onboarding **requires** a Redrob Console API key; the engine ships with
  the app (bundled binary via `REDROB_CODE_BIN`, or `REDROB_CODE_DEV_ROOT` for a
  source checkout in dev), so there is nothing to install. `App.tsx` `isSetupReady`
  and `BetaAccessGate` check engine availability (`office:getEngineStatus` ->
  `redrob-code/status.ts`) on every boot. Model routing is the fixed
  `redrob/auto` Console route.
- **Copy style:** never use em dashes (—) in user-facing copy.
- **Screen/rank:** `runScreenRank` uses cloud embeddings when a Redrob Console key is
  configured (`@redrob/compare` → `cloud-rank.ts`), with cosine similarity for top-K selection.
  Without a cloud provider it uses the local embed/rerank path and its deterministic lexical
  fallback.

### Day log (periodic screen capture)

- `office/src/main/services/day-log.ts` captures on a plain `setInterval` in the main process —
  it is not an agent/subagent, and no model runs until you stop and summarize.
- Capture must never take focus. It first tries `captureDisplayPngNative`
  (`office/src/main/desktop/capture.ts` → Windows GDI BitBlt) and only falls back to
  `desktopCapturer.getSources`, whose Chromium capture windows pull focus on Windows and fail on
  hybrid-GPU DXGI. Anything that speaks during a recording must use `services/notify.ts`, never
  `dialog.show*` — a modal steals the screen from the person being recorded.
- Each capture raises a silent OS notification (opt-out in the panel). `notify.ts` also emits every
  notice on its `notices` EventEmitter, which is how tests and scripts observe them.
- Focus smoke: `DISPLAY=:1 ELECTRON_DISABLE_SANDBOX=1 pnpm --filter @redrob/office daylog:focus-e2e`
  puts mousepad in front, records three captures a minute apart, and fails if
  `xdotool getactivewindow` ever moves. Takes ~2.5 min (the interval floor is 60s).
- To *see* the notifications on the VM there must be a session bus and a daemon:
  `sudo apt-get install -y dunst libnotify-bin`, then `eval "$(dbus-launch --sh-syntax)"`,
  `dunst &`, and launch the app from that same shell. Without it `Notification.show()` is a no-op
  and only the `notices` events prove anything.

### Memory / settings agent tools

- `memory.manage` and `settings.update` (`office/src/main/tools/office-tools.ts`) let the assistant
  manage the user's memories (Settings → Memory) and the user-facing model settings
  (inferenceRoute / webSearchEnabled). `settings.update`
  deliberately cannot touch API keys, allowed folders, or the computer-use security profile.
- They are wired into BOTH paths: the computer-use registry (`registry.ts`) AND, more importantly,
  the plain general-chat cloud loop (`chat.ts`, exposed as `memory_manage` / `settings_update`) so a
  user can just type "remember that…" or "turn off web search" in normal chat — no PC toggle needed.
- Verify tool effects on disk, not from the chat text (the model will happily *claim* it did
  something): memories land in `~/.config/@redrob/office/redrob.sqlite` (`memories` table) and
  settings in `setup.json`. `sqlite3 <db> "select body from memories;"` is the quick check.

### Chat transcript rendering

- `foldSourceRuns` (`office/src/renderer/src/chat-sources.ts`) collapses each run of adjacent
  `sources`/`pages` blocks into one `SourcesFold` accordion, deduped by URL. Sources only reach the
  transcript from chat stream events of `kind: "tool"`. Web tools reach the engine through the MCP
  bridge like any other Office tool, and the bridge emits the same `step`/tool events the renderer
  folds; a turn that ran no web tool shows no sources card at all.
- Assistant text is scrubbed before it reaches the transcript: `sanitizeAssistantText`
  (`office/src/main/services/chat.ts`) runs `scrubModelOutputForUi`
  (`office/src/main/security/untrusted.ts`). That covers three leak shapes, all seen in real
  sessions: `<tool_call>`-style tags, bare `{"name":…,"arguments":…}` JSON (brace-scanning
  `stripLeakedToolJson`, which only removes spans that `JSON.parse` into a call shape so requested
  JSON survives), and harmony `to=functions.x code:` headers whose payload is **only** the arguments
  (`stripChannelToolCalls` — the payload carries no tool name, so it has to be removed with its
  header, along with the mangled channel tokens that land on those lines). It matters most on the
  engine turn, whose text arrives as a settled reply rather than a live token stream that could
  hide a leak. `office:getChatSession` scrubs on
  read as well, so transcripts saved before this stay clean without rewriting anyone's history.
- Screenshots are **not persisted** with a session (`persistableMessages` strips `media`), so a
  reload loses inline thumbnails. To reproduce the transcript rendering of sources without a live
  model, write a `chat_sessions` row directly: ids are `chat-ch~<channelId>` and only sessions
  whose channel exists show up in the sidebar.

### Theme

- `useTheme` shares one module-level subscriber list (`subscribeThemeMode` in
  `office/src/renderer/src/theme.ts`). A `storage` event never fires in the document that wrote the
  key, so anything that changes the theme must go through `setStoredThemeMode` or the other
  consumers keep rendering the old theme.

### Focus and the agent's browser

- The agent's browser is driven through the DOM and must never take the foreground:
  `browserOpen` uses `showInactive()` and never calls `focus()`. Smoke test:
  `DISPLAY=:1 ELECTRON_DISABLE_SANDBOX=1 pnpm --filter @redrob/office browser:focus-e2e`
  (puts mousepad in front, then opens/scrolls/reads a page and fails if focus moves).
- `backgroundControl` in `computer-use.json` refuses `FOCUS_STEALER_TOOLS` for every ask, not just
  look-only ones (`backgroundBlockedReason` in `office/src/main/office/look-only.ts`). It is off by
  default because native-app input genuinely needs the foreground.
- `browser.open` always uses the OS default browser (`openUrlInBackground` / `shell.openExternal`).
  The in-app Electron browser was removed; `browser.click` / `.elements` / … return a clear error.
  Drive pages with `screen.capture` / `ui.elements` or a Chrome MCP server instead.

### Mouse navigation (glide)

- `X11Backend` (`office/src/main/desktop/backend-x11.ts`) moves the pointer through interpolated
  ease-in-out steps (`glidePath`) instead of one `xdotool mousemove` jump, so agent-driven pointer
  motion is smooth/human-paced like Cursor's own cloud-agent desktop control. The VM's screen
  recorder does NOT capture the X cursor sprite, so prove motion by sampling
  `xdotool getmouselocation` over time (intermediate coordinates) rather than by video.
