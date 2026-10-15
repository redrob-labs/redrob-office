// electron-builder's Windows signing hook (apps/shell/electron-builder.cjs,
// win.signtoolOptions.sign, enabled by GENOFFICE_WIN_SIGN_MODE). electron-builder
// 26 runs it once per PE it produces -- the app exe, elevate.exe, the NSIS
// uninstaller and installer. Static extraResources (the Redrob Code sidecar)
// are NOT passed through it; the release workflow signs those with the shared
// sign-windows action before packaging.
//
// This file holds no signing recipe. The recipe is the organization's one copy,
// redrob-labs/.github actions/sign-windows/sign.ps1 (Azure Artifact Signing over
// OpenID Connect; it verifies each file it signs, Status Valid, signer CN). The
// workflow checks that repository out at .redrob-shared (repo root) and this
// hook only spawns the script. It reads ARTIFACT_SIGNING_ENDPOINT /
// ARTIFACT_SIGNING_ACCOUNT / ARTIFACT_SIGNING_CERT_PROFILE, SIGN_DESCRIPTION,
// SIGN_URL and EXPECTED_CN from the environment, and the credential is the
// `az login` the release job performs. No certificate file and no client secret
// exist anywhere.
//
// Modes:
//   production  The only mode. A local build leaves GENOFFICE_WIN_SIGN_MODE unset
//               and ships unsigned; there is no certificate-file path at all.
//
// Usage (by electron-builder): node scripts/win-sign.cjs <mode> <path-to-pe>
'use strict'

const { execFileSync } = require('node:child_process')
const { existsSync } = require('node:fs')
const { resolve } = require('node:path')

const [mode, file] = process.argv.slice(2)

if (!mode || !file) {
  console.error('usage: win-sign.cjs <production> <file>')
  process.exit(2)
}
if (mode !== 'production') {
  console.error(`win-sign.cjs: mode "${mode}" is not available; only "production" (Azure Artifact Signing) is`)
  process.exit(2)
}

// redrob-labs/.github, checked out by the release workflow at <repo>/.redrob-shared.
const SHARED_SIGN_SCRIPT = resolve(__dirname, '..', '.redrob-shared', 'actions', 'sign-windows', 'sign.ps1')
if (!existsSync(SHARED_SIGN_SCRIPT)) {
  console.error(
    `win-sign.cjs: ${SHARED_SIGN_SCRIPT} is missing. Check out redrob-labs/.github at .redrob-shared ` +
      '(actions/checkout with repository: redrob-labs/.github, path: .redrob-shared) before packaging.',
  )
  process.exit(1)
}

// pwsh is on every GitHub windows runner; fall back to Windows PowerShell for a
// developer machine without PowerShell 7.
const shells = ['pwsh', 'powershell']
let lastError
for (const shell of shells) {
  try {
    execFileSync(shell, ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', SHARED_SIGN_SCRIPT, file], { stdio: 'inherit' })
    process.exit(0)
  } catch (error) {
    lastError = error
    // ENOENT: this shell is not installed; try the next one. Any other failure
    // is the signing itself failing, which must abort the package step.
    if (error && error.code === 'ENOENT') continue
    process.exit(typeof error.status === 'number' ? error.status : 1)
  }
}
console.error(`win-sign.cjs: no PowerShell found (${shells.join(', ')}): ${lastError && lastError.message}`)
process.exit(1)
