# Request to Redrob Console: sign-in for Office's file sharing (OIDC device flow)

Paste this whole file into a Redrob Console working session. It is written for
the people (or agent) who own Console's accounts and OAuth at
`https://console.redrob.ai`.

## Context you need

Redrob Office (the desktop suite) is adding shared files, members and live
co-editing. A small service, **Redrob Office sync**, stores shared files and
runs live documents. It trusts **only tokens Console signs**. It checks every
token against Console's JWKS, with a fixed issuer and audience, and never mints
or accepts its own in production.

The desktop app signs a person in with the **OAuth 2.0 Device Authorization
Grant (RFC 8628)**. Office opens the verification page in the browser, the
person approves, and Office polls the token endpoint. Endpoints are read from
OpenID discovery, and **Office refuses any endpoint outside Console's origin**.
The token stays in the desktop app's main process, encrypted with the OS
keychain, and is sent only to the sync service.

This is already built on Office's side (`packages/identity`,
`services/sync/src/auth.ts`). Nothing works for real users until Console
provides the following.

## What Office needs from Console

### 1. Discovery
`GET https://console.redrob.ai/.well-known/openid-configuration` returns at least:

```json
{
  "issuer": "https://console.redrob.ai",
  "device_authorization_endpoint": "https://console.redrob.ai/…",
  "token_endpoint": "https://console.redrob.ai/…",
  "jwks_uri": "https://console.redrob.ai/.well-known/jwks.json",
  "grant_types_supported": ["urn:ietf:params:oauth:grant-type:device_code", "refresh_token"],
  "id_token_signing_alg_values_supported": ["ES256", "RS256"]
}
```

- `issuer` is exactly `https://console.redrob.ai`, with no trailing slash, and it is byte-for-byte the `iss` claim in every token.
- `device_authorization_endpoint`, `token_endpoint` and `jwks_uri` are on `https://console.redrob.ai`. Office refuses any other origin for the first two.

### 2. A public client
- `client_id`: `redrob-office`, a public client with no secret, because it is a desktop app.
- Allowed grants: `urn:ietf:params:oauth:grant-type:device_code` and `refresh_token`.
- Scopes: `openid profile email offline_access`.

### 3. The device flow (RFC 8628)
Office sends (form-encoded) to `device_authorization_endpoint`:

```
client_id=redrob-office
scope=openid profile email offline_access
audience=redrob-office-sync
```

Console answers with `device_code`, `user_code`, `verification_uri`, `verification_uri_complete` (recommended), `expires_in` (≈600) and `interval` (≈5).

- The verification page is on `https://console.redrob.ai`. It shows the code, the app's name ("Redrob Office") and what it may do ("share and co-edit files"). It requires the person to be signed in to Console.
- Office polls `token_endpoint` with `grant_type=urn:ietf:params:oauth:grant-type:device_code`, `device_code` and `client_id`.
- Use the standard errors: `authorization_pending`, `slow_down`, `access_denied` and `expired_token`. Office handles each one.

### 4. The access token, for the sync service
On success, `access_token` is a **signed JWT** (ES256 or RS256, with `kid` in the header) issued for the audience Office asked for:

| claim | value |
| --- | --- |
| `iss` | `https://console.redrob.ai` |
| `aud` | `redrob-office-sync`, either as the string or included in an array |
| `sub` | the stable Console account id, never reused and never an e-mail address |
| `name` | the display name |
| `email` | the account's e-mail address |
| `email_verified` | boolean `true` **only** when Console verified the address |
| `exp` | at most 1 hour after `iat` |
| `iat` | issue time |

- Office keeps the token whose `aud` names `redrob-office-sync`. That is normally the access token; an id token is used only if its `aud` also includes it. A reply with neither fails sign-in with `wrong_audience`, so please do not return an opaque access token for this audience.
- `email` and `email_verified` matter. Invites by e-mail turn into membership only for a token that says the address is verified, so `email_verified` must never be `true` for an unverified address.

### 5. Refresh
- With `offline_access`, return a `refresh_token`. Office refreshes before expiry with `grant_type=refresh_token`, `refresh_token` and `client_id`, and expects a new access token for the same audience.
- Rotating the refresh token on each use is fine; Office keeps a returned one, or keeps using the old one when none is returned.
- Revoking the client's grant in Console's account settings must make the next refresh fail. Office then signs the person out of sharing.

### 6. JWKS
- Keys are published at `jwks_uri`, with `kid`, `alg` and `use: "sig"`.
- When rotating, publish the new key before signing with it, and keep the old key published for at least the token lifetime plus one hour. The sync service caches the JWKS and fetches it again when it sees an unknown `kid`.

### 7. Account settings
- Show "Redrob Office" under connected apps, with a way to revoke it.

## Values the sync service will be configured with

Confirm these or send the real ones:

```
SYNC_ISSUER=https://console.redrob.ai
SYNC_JWKS_URL=https://console.redrob.ai/.well-known/jwks.json   # or the advertised jwks_uri
SYNC_AUDIENCE=redrob-office-sync
```

The desktop app uses issuer `https://console.redrob.ai` and client `redrob-office`.

## How we will check it

```sh
curl -s https://console.redrob.ai/.well-known/openid-configuration | jq '{issuer, device_authorization_endpoint, token_endpoint, jwks_uri}'
curl -s https://console.redrob.ai/.well-known/jwks.json | jq '.keys[] | {kid, alg, use}'

# start a device sign-in
curl -s -X POST "$DEVICE_ENDPOINT" -d client_id=redrob-office \
  -d 'scope=openid profile email offline_access' -d audience=redrob-office-sync
# approve in the browser, then
curl -s -X POST "$TOKEN_ENDPOINT" -d client_id=redrob-office \
  -d grant_type=urn:ietf:params:oauth:grant-type:device_code -d device_code=$DEVICE_CODE \
  | jq -r .access_token | cut -d. -f2 | base64 -d 2>/dev/null | jq '{iss, aud, sub, name, email, email_verified, exp}'
```

Finally, the sync service's own test: `GET https://<sync host>/me` with
`Authorization: Bearer <access_token>` returns `{ sub, name, email }`.

## What to send back
- Confirmation of the values above, or the real ones.
- A staging issuer, if there is one, so Office can test against it before production (`REDROB_IDENTITY_ISSUER` in development builds).
- The access token lifetime and refresh token lifetime you chose.
