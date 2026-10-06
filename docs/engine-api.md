# Redrob engine API (measured 2026-10-06, `redrob-code` v0.0.12)

Office bundles `redrob-code` and starts it on loopback (`apps/shell/src/main/managed-engine.ts`,
`engine-lifecycle.ts`). This file records what the engine actually serves, measured by running
the binary (`node scripts/engine-smoke.mjs --dump <dir>` prints and dumps the same routes). The
engine's own OpenAPI document is at `GET /doc`.

## The finding that shapes Office's design

The engine is an **agent server**, not an OpenAI-compatible proxy. `GET /v1/models` and
`POST /v1/chat/completions` answer 404. A turn is a message posted to an engine session; the
engine calls the model with the credential it holds and runs the tool loop itself.

Office keeps its own tools (document edits with rollback snapshots and edit-queue rules) by
hosting them as a **Model Context Protocol server on loopback** for each turn. The engine
connects to it as a remote MCP server and calls `<server>_<tool>`; Office executes the tool and
answers. This was verified end to end against Console `redrob/auto`: the model called
`oa_get_weather({"city":"Seoul"})` on an Office-hosted MCP server, received the result, and
answered from it.

## Spawn and auth

- `redrob-code serve --hostname 127.0.0.1 --port 0` prints `redrob server listening on http://…`.
- Basic auth from `REDROB_SERVER_USERNAME` / `REDROB_SERVER_PASSWORD`, minted per spawn. A
  request without it is answered 404, not 401.
- `GET /global/health` → `{ healthy: true, version: "0.0.12" }`.
- **Configuration goes in `REDROB_CONFIG_CONTENT` (inline JSON).** `PATCH /global/config`
  rewrites `~/.config/redrob/redrob.jsonc`, which Redrob Code on the same machine also reads,
  so Office never calls it. `PATCH /config` re-creates the engine instance and drops MCP servers
  added over HTTP. `OPENCODE_CONFIG_CONTENT` is ignored.
- Office's inline config (`officeEngineConfig()` in `packages/ai-provider/src/engine-client.ts`)
  sets `share: disabled`, `autoupdate: false` and an `office` agent with every built-in tool
  off and denied. The `office` agent is accepted by `POST /session/:id/message` even though
  `GET /api/agent` does not list it.

## Location scoping

- v2 routes under `/api/*` take `location[directory]=<path>` (deepObject).
- Older routes (`/session`, `/mcp`, `/event`, …) take `directory=<path>`.
- Sending the wrong one is not an error: the engine silently answers for its own cwd.

## Models and providers

- `GET /api/model` → `{ location, data: [Model] }`. Each model has `id`, `providerID`, `name`,
  `capabilities { tools, input[], output[] }`, `limit { context, output }`, `status`,
  `enabled`, plus `api` and **`request.body.apiKey`, which echoes the provider key**.
  `toEngineModel` drops everything but the fields above, so no key leaves the client.
- Measured catalogue: `redrob/auto`, `redrob/gpt-5.6-sol`, `redrob/gpt-5.6-terra`,
  `redrob/claude-opus-5`, `redrob/claude-sonnet-5`, … (Console models, all `tools: true`).
  `capabilities.input` reports only `text` for Console models on v0.0.12, although Console's
  own `/v1/models` lists `imageInput` for several of them.
- **Images.** For a model the engine believes is text-only, it replaces an attached image
  with a note, and the model answers "unsupported". Declaring
  `provider.redrob.models.<id>.modalities.input: ["text","image"]` in the inline config makes
  the image reach the model; measured with `redrob/claude-sonnet-5` (a red test image was
  named correctly). Office declares every Console model whose public `GET /v1/pricing`
  entry has `imageInput: true` at spawn. With `redrob/auto` the image is sent, but the
  routed model named the wrong colour in two runs, so auto plus image is not reliable yet.
- `GET /api/provider` lists configured providers (also echoes the key in `request.body`).
- `GET /provider/auth` (v1) lists auth methods for every known provider: `redrob` (oauth,
  api), `github-copilot` (oauth with prompts), `gitlab`, `poe`, `cloudflare-*`, `azure`,
  `xai`, … This is wider than `/api/integration`.

## Integrations (the credential store)

- `GET /api/integration` → `{ location, data: [{ id, name, methods[], connections[] }] }`.
  The first request after a spawn can return `data: []` while the catalog loads; the next
  one returns the list. `EngineIntegrationClient.list()` retries once.
- Methods: `{ type: "oauth", id, label, prompts? }`, `{ type: "key", label? }` (no id),
  `{ type: "env", names[] }` (no id).
- Connections: `{ type: "credential", id, label }` or `{ type: "env", name }`.
- `POST /api/integration/:id/connect/key` `{ key, label? }` stores a key.
- `POST /api/integration/:id/connect/oauth` `{ methodID, inputs }` →
  `{ data: { attemptID, url, instructions, mode: "auto" | "code", time { created, expires } } }`.
- `GET /api/integration/attempt/:attemptID` → `{ data: { status: pending | complete | failed …, time } }`.
- `POST /api/integration/attempt/:attemptID/complete` `{ code? }`; `DELETE` cancels.
- `PATCH|DELETE /api/credential/:credentialID` updates or removes a stored credential.
- There is no route that returns a stored secret through the integration API.
- **BYOK on v0.0.12.** `POST /api/integration/<id>/connect/key` answers 500 for any id the
  v2 list does not contain (`anthropic` was tried). Keys for other providers go through v1
  `PUT /auth/:id { type: "api", key }` (200), `DELETE /auth/:id` removes them, and OAuth is
  `POST /provider/:id/oauth/authorize { method: <index>, inputs }` → `{ url, method, instructions }`
  then `POST /provider/:id/oauth/callback { method, code? }`. Measured with an isolated
  `HOME`/`XDG_*`: the credential is stored, but `GET /provider` and `GET /api/model` still
  list only Redrob, even with `enabled_providers` set. So on this engine version a
  connected vendor brings no models; the Settings pane says so, and the model list is
  Console's (`redrob/auto`, `redrob/gpt-5.6-sol`, `redrob/claude-opus-5`, ...).

## Sessions and turns

- `POST /session` → `{ id: "ses_…" }`. `DELETE /session/:id`. `POST /session/:id/abort`.
- `POST /session/:id/message` waits for the whole turn and returns the final assistant message
  `{ info { finish, error?, tokens, cost, modelID, providerID }, parts[] }`. Body:
  - `model { providerID, modelID }`, `agent`, `system` (per-message system text),
  - `tools`: a map of tool-name patterns to booleans. `*` wildcards work and later entries win,
    so `{ "*": false, "oa_*": true }` offers only server `oa`'s tools,
  - `parts`: `{ type: "text", text }` or `{ type: "file", mime, url, filename? }` (data URLs).
- A failure inside the turn is reported as a `session.error` event, and the HTTP answer is
  500 with `{ name: "UnknownError", data: { message, ref } }`.

## Events

`GET /event` is SSE (`data: {json}\n\n`). Types seen during a turn: `session.created`,
`session.updated`, `session.status { busy }`, `message.updated`, `message.part.updated` (with
`part.type` = `step-start`, `text`, `tool`, `step-finish`), `message.part.delta`
`{ partID, field: "text", delta }`, `session.idle`, `session.error`. A tool part moves through
`state.status` `pending` → `running { input }` → `completed { output }` | `error`.

## MCP

- `POST /mcp` `{ name, config: { type: "remote", url, headers?, oauth: false } }` connects at
  once (`initialize`, `notifications/initialized`, `tools/list`) and answers
  `{ <name>: { status: "connected" } }` for every registered server.
- Tools are offered to the model as `<name>_<tool>`. `POST /mcp/:name/disconnect` drops one.
- The engine speaks streamable HTTP JSON-RPC; a plain `application/json` answer is accepted.
- Register MCP servers only after any config change (see above).
