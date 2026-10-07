#!/usr/bin/env sh
# Build the Hangul core (engines/rhwp, our fork of edwardkim/rhwp) to WASM and
# place the result in packages/hwp-core/wasm.
#
# The toolchain is pinned so the output is reproducible: CI rebuilds from the
# same source and compares checksums against packages/hwp-core/provenance.json
# (see scripts/hwp-core-provenance.mjs).
#
#   Rust       1.93.1 (engines/rhwp/rust-toolchain.toml)
#   wasm-pack  0.15.0 (the version upstream pins)
#   wasm-bindgen comes from engines/rhwp/Cargo.lock
set -eu

root="$(cd "$(dirname "$0")/.." && pwd)"
engine="${root}/engines/rhwp"
out="${root}/packages/hwp-core/wasm"

want_pack="0.15.0"
have_pack="$(wasm-pack --version 2>/dev/null | awk '{print $2}')"
if [ "${have_pack}" != "${want_pack}" ]; then
  echo "build-hwp-core: wasm-pack ${want_pack} required, found '${have_pack:-none}'" >&2
  exit 1
fi

# wasm-pack runs `cargo metadata` without --locked, which may rewrite the
# lockfile. Upstream solves this with a cargo shim; do the same.
shim_dir="$(mktemp -d)"
trap 'rm -rf "${shim_dir}"' EXIT HUP INT TERM
real_cargo="$(command -v cargo)"
cat > "${shim_dir}/cargo" <<'EOF'
#!/usr/bin/env sh
set -eu
if [ "${1:-}" = "metadata" ]; then
  for arg in "$@"; do
    [ "${arg}" = "--locked" ] && exec "${HWP_CORE_REAL_CARGO}" "$@"
  done
  exec "${HWP_CORE_REAL_CARGO}" "$@" --locked
fi
exec "${HWP_CORE_REAL_CARGO}" "$@"
EOF
chmod +x "${shim_dir}/cargo"

rm -rf "${out}"
cd "${engine}"
PATH="${shim_dir}:${PATH}" HWP_CORE_REAL_CARGO="${real_cargo}" \
  wasm-pack build . --release --target web --out-dir "${out}" --out-name rhwp --no-pack -- --locked

# Keep only what the package ships.
for f in .gitignore package.json README.md LICENSE; do rm -f "${out}/${f}"; done
ls -l "${out}"
