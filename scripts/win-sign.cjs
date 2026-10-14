// electron-builder's Windows signing hook (apps/shell/electron-builder.cjs,
// win.signtoolOptions.sign, enabled by GENOFFICE_WIN_SIGN_MODE). electron-builder
// 26 runs it once per PE it packages -- the app exe, the NSIS uninstaller and
// installer, and every static .exe/.dll extraResource -- so one hook signs the
// whole shipped tree with the same certificate.
//
// Modes:
//   production  Azure Artifact Signing over OpenID Connect (scripts/win-sign.ps1).
//               No certificate file and no client secret exist anywhere; the
//               credential is the `az login` the release job performs.
//   test        Not provided in this tree. There is no certificate-file signing
//               path at all; a local build leaves GENOFFICE_WIN_SIGN_MODE unset
//               and ships unsigned.
//
// Usage (by electron-builder): node scripts/win-sign.cjs <mode> <path-to-pe>
'use strict'

const { execFileSync } = require('node:child_process')
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

const script = resolve(__dirname, 'win-sign.ps1')
// pwsh is on every GitHub windows runner; fall back to Windows PowerShell for a
// developer machine without PowerShell 7.
const shells = ['pwsh', 'powershell']
let lastError
for (const shell of shells) {
  try {
    execFileSync(shell, ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', script, file], { stdio: 'inherit' })
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
