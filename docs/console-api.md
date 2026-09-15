# Redrob Console API (verified 2026-08-21)

Office's hosted inference talks to one backend: the Redrob Console. This file
records what that API actually accepts, read from its published docs and
OpenAPI document and checked against the live API.

Human reference: `https://console.redrob.ai/docs/api-reference`. Machine spec:
`https://console.redrob.ai/api/backend/docs-json` (Swagger UI at
`/api/backend/docs`). The server reports itself as "Redrob Console API 1.0".

## Shape

- Base URL: `https://console.redrob.ai/api/backend/v1`
- Auth: `Authorization: Bearer <key>`. The spec names two schemes: `jwt` for
  console sessions and `api-key` for keys issued from the console. Inference
  endpoints take `api-key` only.
- Key format: `rrk_{prefix}_{secret}`, returned once at creation. The prefix is
  the public half, meant to be displayed as `rrk_{prefix}_••••`.
- Errors from OpenAI-compatible endpoints use OpenAI's `error` envelope. An
  unauthenticated request may be rejected before that handler with the
  gateway's standard 401 body.

## Endpoints Office uses

- `GET /v1/models` — key verification and model list. Returns
  `{ object: "list", data: [{ id, object, created, owned_by }] }`.
- `POST /v1/chat/completions` — OpenAI-compatible completion. `stream: true`
  produces `data:`-prefixed SSE chunks terminated by `data: [DONE]`.

Model ids are a closed enum: **`redrob-ai`** and **`redrob-translate`**.
`model` is optional and defaults to `redrob-ai`.

There are also Redrob-specific inference endpoints Office does not use:
`POST /v1/complete`, `POST /v1/complete/stream`, `POST /v1/translate`. The rest
of the API (auth, workspaces, members, keys, billing, usage, logs) is console
management behind the `jwt` scheme, not something the desktop app calls.

## What `POST /v1/chat/completions` accepts

`ChatCompletionDto` accepts OpenAI request fields and relays supported sampling
fields to the serving vendor. Important fields for Office are:

| field | notes |
| --- | --- |
| `model` | enum `redrob-ai` \| `redrob-translate` |
| `messages` | required; role is `system` \| `developer` \| `user` \| `assistant` \| `tool`; content is a string, text-part array, or `null` on an assistant tool-call turn |
| `stream` | boolean |
| `temperature` | 0 to 2 |
| `max_tokens`, `max_completion_tokens` | equivalent answer-length bounds |
| `tools`, `tool_choice`, `parallel_tool_calls` | OpenAI function-calling shape; Console relays tools and does not execute them |
| `functions`, `function_call` | legacy function-calling aliases |
| sampling and compatibility fields | `top_p`, `n`, `stop`, penalties, `seed`, `response_format`, logprobs, stream options, and accepted metadata fields |
| `indicAssist` | Redrob extension: answer a non-English conversation in its own language |
| `detectLanguage` | Redrob extension |
| `sourceLanguage` | Redrob extension; enum of 15 language codes including `ko` |

The response is `{ id, object, created, model, choices, usage, redrob }`, where
an assistant message may carry `tool_calls`, `finish_reason` may be
`tool_calls`, and `redrob` carries
`{ requestId, detectedLanguage, translationUsed, latencyMs }`.

## Function calling: verified live

The function-calling loop was tested against the live API on 2026-08-21:

1. `GET /v1/models` returned `redrob-ai` and `redrob-translate`.
2. Plain chat using `max_completion_tokens` returned the requested text.
3. A request with text-part content, one function, `tool_choice: "required"`,
   and `parallel_tool_calls: false` returned `finish_reason: "tool_calls"` and
   a valid `get_weather({"city":"Seoul"})` call.
4. Sending the assistant `tool_calls` message followed by a `role: "tool"`
   result returned the final natural-language answer.

The exact OpenClaw path was tested too. A Gateway configured as Office
configures it (`api: "openai-completions"`, provider `redrob`, model
`redrob-ai`) sent its normal content-block request and tool catalog. Console
returned an `exec` call, OpenClaw ran `printf openclaw-console-ok`, sent the
tool result back, and Console returned `openclaw-console-ok`.

That run is kept as evidence about Console, not as a description of Office. The
gateway it used is gone: Office runs every turn on the Redrob Code engine, which
reads the same Console key from `REDROB_API_KEY` and speaks the same endpoints
recorded above. What the run still proves is that Console relays a tool catalog,
returns a tool call, and accepts a `role: "tool"` result, which is the part of
the contract the engine depends on.

Verifying the wire is not the same as verifying the app. The engine contract test
(`office/src/main/redrob-code/engine-contract.test.ts`) is what exercises Office's
own tools and policy prompts against a real engine, and it is what to run when
that integration changes.
