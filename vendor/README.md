# vendor/

Third-party source vendored into this workspace so it resolves locally without a
private registry.

## redrob-ui ? `@redrob-labs/ui` v1.5.0 (the Redrob Group Design System 2026)

Source: https://github.com/redrob-labs/redrob-ui (public, MIT).

It is vendored (rather than installed from GitHub Packages) so `pnpm install`
needs no `read:packages` token. The pnpm workspace resolves `@redrob-labs/ui`
to this copy. Build its `dist/` before typechecking the apps:

    pnpm --filter @redrob-labs/ui build

Local change vs upstream: the `build` script's POSIX `cp`/`mkdir` asset-copy
tail was replaced with `tools/build/copy-assets.mjs` (+ `rimraf`) so the build
is cross-platform (Windows included). No component source was modified.
