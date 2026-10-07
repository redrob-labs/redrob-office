# Request to Redrob Console: image generation, search, and capability flags for Office

Paste this whole file into a Redrob Console working session. It is written for
the people (or agent) who own Console's public API at
`https://console.redrob.ai/api/backend/v1`.

## Context you need

Redrob Office is the desktop office suite (Docs, Sheets, Slides, PDF, Markdown,
Hangul). Its AI panels already run every chat turn through Console's
`/v1/chat/completions`, on the route `redrob/auto` (wire id `auto`).

**Office never holds a Console key.** The bundled Redrob engine (`redrob-code`)
keeps the credential and makes every Console call. Office asks the engine, and
the engine forwards to Console with its own credential. So the routes below are
called with an ordinary Console API key (`Authorization: Bearer rrk_…`), by the
engine, never by the desktop app directly. The engine's forwarding route
(`/api/console/relay/*`) is a separate request to the redrob-code team. You do
not need to build it, but please keep the paths below exactly as written so the
relay can be a straight pass-through.

Office's client code is already written against these contracts
(`packages/ai-provider/src/hosted-tools.ts`). Until the routes exist, Office
answers "not available from Redrob yet" and falls back to nothing. **A 404,
405 or 501 from any of these routes is treated as "not available yet"**, so
please do not use those codes for other failures.

Console as verified on 2026-10-06 has chat, models, translate, embeddings and
the public catalogue `GET /v1/pricing`. It has no image or search route.

## Request 1: `POST /v1/images/generations`

OpenAI-compatible where possible, so standard clients work too.

Request body:

| field | type | notes |
| --- | --- | --- |
| `model` | string | `auto` (Console picks the backing image model). Accept other published image model ids too. |
| `prompt` | string | required, non-empty; 4000 characters is enough |
| `n` | integer | Office always sends `1`; accept 1-4 |
| `size` | string, optional | OpenAI form, e.g. `1024x1024`, `1536x1024`, `1024x1536` |
| `aspect_ratio` | string, optional | `1:1`, `16:9`, `9:16`, `4:3`, `3:4`. When both are given, `aspect_ratio` wins. |
| `reference_images` | string[], optional | up to 4 **https** URLs of images to condition on (edit or "in the style of") |
| `response_format` | `"url"` \| `"b64_json"` | Office sends `url` |

Response `200`:

```json
{ "created": 1791300000, "data": [ { "url": "https://…", "revised_prompt": "…" } ] }
```

- `data[].url` must be **https** and stay fetchable for at least 24 hours. Office downloads it into the document. With `b64_json`, return `data[].b64_json` as PNG bytes.
- Errors use the OpenAI `error` envelope `{ "error": { "message", "type", "code" } }`. Office shows `message` to the person, cut to 300 characters, so make it a plain sentence. Please use:
  - `400` for an invalid request
  - `402` when credits run out (`code: "insufficient_credits"`)
  - `422` for a content-policy refusal (`code: "content_policy"`)
  - `429` for rate limiting, with `Retry-After`
  - `5xx` for upstream failures
- Charge credits the same way chat does, and record the call in usage and logs as `images.generations`.

## Request 2: `POST /v1/search`

One route for web and image search.

Request body:

| field | type | notes |
| --- | --- | --- |
| `query` | string | required, non-empty, up to 400 characters |
| `type` | `"web"` \| `"images"` | required |
| `max_results` | integer | 1-20; Office sends 6 (web) or 8 (images) |

Response `200` for `type: "web"`:

```json
{
  "results": [ { "title": "…", "url": "https://…", "snippet": "…" } ],
  "answer": "optional one-paragraph summary"
}
```

Response `200` for `type: "images"`:

```json
{
  "results": [
    { "title": "…", "image_url": "https://…", "source_url": "https://…", "source": "example.com", "width": 1200, "height": 800 }
  ]
}
```

- `url` and `source_url` are http or https. `image_url` must be **https**, or Office drops the result. `width` and `height` are optional integers.
- An empty result list is `200` with `"results": []`, not an error.
- The errors and billing are the same as in Request 1. Record the call as `search.web` or `search.images`.

## Request 3: capability flags in `GET /v1/pricing`

Office reads the public catalogue without a key, before anyone signs in, to
decide which buttons to show. It already reads each model's `capabilities`
block (`imageInput`, `tools`, `structuredOutputs`, `maxOutputTokens`,
`thinkingLevels`). Please add:

1. A top-level `features` block, so Office can hide Generate image and Search before calling them:

   ```json
   {
     "features": {
       "imageGeneration": { "available": true, "models": ["auto"] },
       "search": { "web": true, "images": true }
     },
     "models": [ … ]
   }
   ```

   Missing means "not available", so ship the block when the routes ship, not before.
2. An accurate `imageInput` for `auto` and every model it can route to. Office uses it to decide whether a screenshot or picture can go with a request. Today the engine treats every Console model as text-only, which is a redrob-code issue; the catalogue is the source of truth Office trusts.
3. The catalogue's shape stays backwards compatible: new fields only, and nothing renamed.

## How we will check it

```sh
KEY=rrk_…   # any workspace key
B=https://console.redrob.ai/api/backend/v1

curl -s $B/pricing | jq '.features'
curl -s -X POST $B/images/generations -H "Authorization: Bearer $KEY" -H 'content-type: application/json' \
  -d '{"model":"auto","prompt":"a lighthouse at dawn, watercolour","n":1,"aspect_ratio":"16:9","response_format":"url"}' | jq '.data[0].url'
curl -s -X POST $B/search -H "Authorization: Bearer $KEY" -H 'content-type: application/json' \
  -d '{"query":"Seoul population 2026","type":"web","max_results":6}' | jq '.results | length'
curl -s -X POST $B/search -H "Authorization: Bearer $KEY" -H 'content-type: application/json' \
  -d '{"query":"hanok courtyard","type":"images","max_results":8}' | jq '.results[0].image_url'
# an unauthenticated call is 401, not 404
curl -s -o /dev/null -w '%{http_code}\n' -X POST $B/search -d '{}'
```

## What to send back

- The dates these routes go live, and whether staging has them first, with its base URL.
- Any field you had to name differently. Office would rather adapt than have Console carry an odd name, but it needs to know.
- The credit price per image and per search, for Office's usage copy.
