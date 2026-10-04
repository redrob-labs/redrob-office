# Redrob Office sync

Shared files, their members, and live documents for Redrob Office. It is a
Fastify HTTP API and a Hocuspocus WebSocket server over Postgres and any S3
store. It runs locally and in CI through Docker Compose. There is no production
deployment yet.

## Run it

```sh
cd services/sync
docker compose up --build
```

This starts Postgres, a SeaweedFS S3 gateway and the service. Every port binds
to 127.0.0.1:

| What | Address |
| --- | --- |
| HTTP API | http://127.0.0.1:8787 |
| Live documents | ws://127.0.0.1:8788 |

The stack runs the development issuer. It makes its own signing key at start
and mints a token for anyone who asks, so never expose these ports:

```sh
curl -s -X POST http://127.0.0.1:8787/dev/token \
  -H 'content-type: application/json' -d '{"sub":"felix","name":"Felix Kim"}'
```

The service refuses `SYNC_DEV_ISSUER=1` when `NODE_ENV=production`.

## Tests

```sh
pnpm install --ignore-workspace
pnpm typecheck
pnpm test               # unit tests, no services needed
pnpm test:integration   # against a running stack (SYNC_URL)
```

CI runs both in `.github/workflows/sync.yml`, which is not a required check.

## Identity

In production the service trusts tokens Redrob Console signs. They are checked
against Console's JWKS (`SYNC_JWKS_URL`, `SYNC_ISSUER`, `SYNC_AUDIENCE`). The
token's `sub` is the account and `name` is the display name.

## API

Every route except `/health` needs `Authorization: Bearer <token>`. A file
route answers 404 to anyone who is not a member, so a file's existence is not
disclosed.

| Route | Role needed |
| --- | --- |
| `GET /files`, `POST /files` | signed in |
| `GET /files/:id`, `GET /files/:id/content`, `GET /files/:id/versions`, `GET /files/:id/members` | view |
| `PUT /files/:id/content` (`application/octet-stream`) | edit |
| `PUT /files/:id/members/:sub` (`{ role, name }`), `DELETE /files/:id/members/:sub`, `DELETE /files/:id` | owner |

The roles are `owner`, `edit`, `comment` and `view`. An owner can grant any
role except owner, and cannot demote or remove themselves.

## Live documents

Connect a Hocuspocus provider to `ws://127.0.0.1:8788`. The document name is
the file id and the token is the bearer token.
- Members below edit join read-only.
- Presence is stamped with the verified person, so a cursor cannot claim to be
  someone else.
- The Yjs state is stored in Postgres (`doc_states`).

## Configuration

| Variable | Default |
| --- | --- |
| `DATABASE_URL` | required |
| `S3_ENDPOINT`, `S3_BUCKET`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY` | required |
| `S3_REGION` | `us-east-1` |
| `S3_FORCE_PATH_STYLE` | on; set to `0` to turn off |
| `SYNC_HTTP_PORT` | 8787 |
| `SYNC_COLLAB_PORT` | 8788 |
| `SYNC_HOST` | 127.0.0.1 |
| `SYNC_DEV_ISSUER=1`, or `SYNC_JWKS_URL` with `SYNC_ISSUER` | one is required |
| `SYNC_AUDIENCE` | `redrob-office-sync` |
| `SYNC_MAX_FILE_BYTES` | 100 MiB |
