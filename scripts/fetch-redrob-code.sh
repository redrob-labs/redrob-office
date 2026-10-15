#!/usr/bin/env bash
# Stage the Redrob Code sidecar from the engine's own GitHub release instead of building it.
#
# redrob-labs/redrob-code is public and ships every platform binary on each release, with a
# checksum list. Building it here cost each release leg ~3.5 minutes (bun install + bundle);
# downloading a release takes seconds and bundles exactly the bytes the engine shipped and tested.
#
# Which release: the engine's NEWEST published release, unless REDROB_CODE_VERSION names a tag
# (e.g. v0.6.5). The bundled sidecar is only the fallback for a machine without a launcher-installed
# engine, so a pin bought nothing but staleness: 0.10.6 shipped an engine months behind. The release
# workflow resolves the tag once (version job) and hands it to every leg so the three platforms
# bundle the same engine even if the engine releases mid-build. The resolved tag is printed, written
# to apps/shell/build/redrob-code.version, and added to the step summary so a release says which
# engine it carries. redrob-cowork does the same (apps/desktop/scripts/prepare-sidecar.mjs).
#
# Usage: scripts/fetch-redrob-code.sh <windows-x64|darwin-arm64|linux-x64>
# Needs: gh (authenticated; the workflow passes GITHUB_TOKEN), unzip, and sha256sum or shasum.
set -euo pipefail

# GNU coreutils' sha256sum on Linux and Git Bash; macOS runners ship only shasum.
if command -v sha256sum >/dev/null 2>&1; then
  sha256() { sha256sum "$@"; }
else
  sha256() { shasum -a 256 "$@"; }
fi

platform="${1:?usage: $0 <windows-x64|darwin-arm64|linux-x64>}"
root="$(cd "$(dirname "$0")/.." && pwd)"
repo="redrob-labs/redrob-code"
case "$platform" in
  windows-x64) asset="redrob-windows-x64.zip"; binary="redrob.exe"; target="redrob-code.exe" ;;
  darwin-arm64) asset="redrob-darwin-arm64.zip"; binary="redrob"; target="redrob-code" ;;
  linux-x64) asset="redrob-linux-x64.zip"; binary="redrob"; target="redrob-code" ;;
  *) echo "unknown platform: $platform" >&2; exit 2 ;;
esac

tag="${REDROB_CODE_VERSION:-}"
if [ -z "$tag" ]; then
  # `gh release view` with no tag is GitHub's own "latest": the newest published, non-prerelease,
  # non-draft release. Drafts and prereleases never become the bundled fallback engine.
  tag="$(gh release view --repo "$repo" --json tagName --jq .tagName)"
  echo "Redrob Code: no REDROB_CODE_VERSION set; newest release is $tag"
fi
case "$tag" in
  v[0-9]*.[0-9]*.[0-9]*) ;;
  *) echo "Redrob Code release tag '$tag' is not vMAJOR.MINOR.PATCH" >&2; exit 1 ;;
esac

work="${RUNNER_TEMP:-${TMPDIR:-/tmp}}/redrob-code-$tag"
rm -rf "$work"
mkdir -p "$work"
echo "Fetching Redrob Code $tag ($asset) from $repo"
gh release download "$tag" --repo "$repo" --pattern "$asset" --pattern 'SHA256SUMS*' --dir "$work"

# The release's own checksum list is the source of truth for the bytes we just received.
# Releases published by the shared redrob-labs publish job name it SHA256SUMS.txt; older ones SHA256SUMS.
sums="$work/SHA256SUMS.txt"
[ -f "$sums" ] || sums="$work/SHA256SUMS"
[ -f "$sums" ] || { echo "release $tag has no SHA256SUMS(.txt) asset" >&2; exit 1; }
(cd "$work" && grep -E "  ${asset}\$" "$sums" | sha256 -c -)

unzip -q -o "$work/$asset" -d "$work/unpacked"
source_binary="$work/unpacked/$binary"
[ -f "$source_binary" ] || { echo "$asset does not contain $binary at its root" >&2; exit 1; }

mkdir -p "$root/apps/shell/build"
cp "$source_binary" "$root/apps/shell/build/$target"
chmod 755 "$root/apps/shell/build/$target"
printf '%s\n' "$tag" > "$root/apps/shell/build/redrob-code.version"
echo "Staged apps/shell/build/$target from $asset ($(sha256 "$root/apps/shell/build/$target" | cut -c1-16)...)"
echo "Redrob Code sidecar: $tag"
if [ -n "${GITHUB_STEP_SUMMARY:-}" ]; then
  echo "Bundled Redrob Code sidecar: **$tag** ($platform)" >> "$GITHUB_STEP_SUMMARY"
fi
