# Releases and CDN publishing

Pushing a `v*` tag runs two workflows from the same tag. The tag must equal the
version in `apps/shell/package.json` (`v0.8.3` ↔ `0.8.3`).

## Windows — `.github/workflows/release-desktop.yml`

Signs and packages the Windows installer for the suite shell (`@genoffice/shell`),
publishes it to a GitHub Release, and then uploads **the bytes the signing job
produced** to the CDN. It uploads the artifact rather than rebuilding, because a
rebuild would produce an unsigned file. The GitHub Release does not wait for the
CDN job, so a CDN outage cannot block the updater feed.

## Linux — `.github/workflows/release-office-cdn.yml`

Builds the unsigned Linux packages (AppImage, deb, rpm) and uploads them. It
installs `rpmbuild` and a stable Rust toolchain, builds with pnpm 9.15 on Node 24,
writes a `sha256` sidecar for every artifact, and uploads with the org variables
and secrets `REDROB_CDN_BUCKET`, `REDROB_CDN_ACCESS_KEY_ID` and
`REDROB_CDN_SECRET_ACCESS_KEY`.

Publishing is two stages, in this order only:

1. **Immutable version path.** The three artifacts and their `.sha256` files go to
   `s3://<bucket>/office/<version>/`. These objects are never overwritten, so they
   are cached with `Cache-Control: public, max-age=31536000, immutable`. After the
   upload, every public version URL is fetched over HTTP and checked against the
   local `sha256`.
2. **Promotion to `latest/`.** Only after every version check passes, the same
   local files are uploaded again under versionless names to `office/latest/`.

The second stage re-uploads rather than copying because the CDN credentials are
PutObject-only — no Head, Get or List — so a server-side copy
(`aws s3 cp s3:// s3://`) fails with 403 on the source HeadObject. Byte identity is
therefore guaranteed the other way round: the same local bytes that just passed
public verification are uploaded again, and the `latest` URLs and checksums are
verified once more after promotion. The `.sha256` sidecars are regenerated per
name rather than copied, so `sha256sum -c` passes whichever name you downloaded.
`latest` is cached with `Cache-Control: no-cache, max-age=0, must-revalidate`,
because a moved pointer must serve the new build immediately.

## Published URLs

```
https://cdn.redrob.ai/office/<version>/Redrob-Setup-<version>.exe        (+ .sha256)
https://cdn.redrob.ai/office/<version>/Redrob-<version>.AppImage         (+ .sha256)
https://cdn.redrob.ai/office/<version>/redrob_<version>_amd64.deb        (+ .sha256)
https://cdn.redrob.ai/office/<version>/redrob-<version>.x86_64.rpm       (+ .sha256)
https://cdn.redrob.ai/office/latest/redrob-office-x64-setup.exe          (+ .sha256)
https://cdn.redrob.ai/office/latest/redrob-office-x64.AppImage           (+ .sha256)
https://cdn.redrob.ai/office/latest/redrob-office-x64.deb                (+ .sha256)
https://cdn.redrob.ai/office/latest/redrob-office-x64.rpm                (+ .sha256)
```

Version paths put the version in the file name so a downloaded file identifies
itself. `latest/` uses versionless names deliberately: a versioned name under
`latest/` would claim to be current the moment the next release ships, and the
Console product page that links it would keep handing out a stale build.

## Rules the workflows keep

- `office/latest/` moves **only** on a successful real `v*` tag push. A preview run
  (`workflow_dispatch`) may upload a version path for inspection but never touches
  `latest`.
- A fork or an unconfigured repository with no CDN credentials builds the packages
  and uploads nothing. It does not report success falsely.
- If any version check fails, the promotion stage is never reached, so `latest`
  cannot move on a partial failure.
- The only files uploaded are the exact artifacts `electron-builder.cjs` produces
  (`Redrob-<version>.AppImage`, `redrob_<version>_amd64.deb`,
  `redrob-<version>.x86_64.rpm`), their `.sha256` sidecars, and the versionless
  copies for `latest/`. Blockmaps, `latest*.yml` and unpacked trees are not
  uploaded.
