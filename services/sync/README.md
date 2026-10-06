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
| `GET /files/:id`, `GET /files/:id/content`, `GET /files/:id/versions`, `GET /files/:id/versions/:v/content`, `GET /files/:id/members` | view |
| `DELETE /files/:id/members/me` (leave; not the owner) | view |
| `GET /me` | signed in |
| `GET /files/:id/comments` | view |
| `POST /files/:id/comments` (`{ text, anchor }` or `{ text, parentId }`), `PATCH /files/:id/comments/:cid` (`{ done }` or `{ text }`, own words only) | comment |
| `PUT /files/:id/content` (`application/octet-stream`), `PATCH /files/:id` (`{ name }`) | edit |
| `PUT /files/:id/members/:sub` (`{ role, name }`), `DELETE /files/:id/members/:sub`, `DELETE /files/:id`, `POST /files/:id/transfer` (`{ sub }`) | owner |
| `GET /files/:id/invites`, `PUT /files/:id/invites/:email` (`{ role }`), `DELETE /files/:id/invites/:email` | owner |

The roles are `owner`, `edit`, `comment` and `view`. An owner can grant any
role except owner, and cannot demote or remove themselves.

- `DELETE /files/:id` stops sharing. It deletes the file's versions, stored
  bytes and live state, and closes its live connections. Every member keeps
  the copy on their own computer.
- An invite by e-mail waits until someone signs in with that address. The
  token must say `email_verified: true`. The invite is then claimed on
  `GET /files`, `GET /me` or the first request for the file, and it never
  changes an existing membership.
- Comments are written into the live document's `comments` map by the
  service. That way a commenter, whose live session is read-only, can still
  comment. The author is the verified person. A new thread carries its range
  as Yjs relative positions (`anchor`). The first view that may edit marks
  the text and drops the anchor.
- `GET /files/:id/versions/:v/content` returns one earlier version. The
  desktop opens it as a copy beside the local file, so nothing anyone has
  open is overwritten.
- `PATCH /files/:id` renames the file for everyone. The desktop sends it when
  someone who may edit renames their local copy; each computer keeps its own
  file name.
- `POST /files/:id/transfer` makes an editor the owner and the old owner an
  editor, in one transaction, so a file always has exactly one owner. It
  answers 409 when the person is not already an editor.
- `DELETE /files/:id/members/me` takes the caller off the file. The owner
  gets 409 and must transfer or stop sharing first. Because `me` is a fixed
  path segment, it always means the caller: an account whose id is
  literally `me` cannot be removed by the owner through
  `DELETE /files/:id/members/:sub`.

## Schema

`MIGRATIONS` in `src/pg-repo.ts` is a numbered list. Each step is applied once,
in its own transaction, under an advisory lock, and recorded in
`schema_migrations`. Add a new step at the end; never edit one that has
shipped.

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
