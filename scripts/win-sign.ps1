<#
.SYNOPSIS
  Authenticode-sign files with signtool through Azure Artifact Signing.

.DESCRIPTION
  Reads ARTIFACT_SIGNING_ENDPOINT (e.g. https://krc.codesigning.azure.net), ARTIFACT_SIGNING_ACCOUNT
  and ARTIFACT_SIGNING_CERT_PROFILE. The Azure credential is whatever DefaultAzureCredential finds:
  in CI that is the `az login` done by azure/login with the job's OpenID Connect token; on a
  developer machine, `az login`. There is no certificate file and no client secret anywhere.

  With the three variables unset, it prints a warning and leaves the files unsigned (exit code 0),
  so test builds still produce installers.

  electron-builder calls this once per PE it packages (scripts/win-sign.cjs is the hook), so the
  signtool dlib is downloaded once per runner into RUNNER_TEMP (or the OS temp dir) and reused.

  Optional overrides: WINDOWS_TIMESTAMP_URL, SIGNTOOL (path to signtool.exe).

.EXAMPLE
  pwsh scripts/win-sign.ps1 apps/shell/build/redrob-code.exe
#>
param(
  [Parameter(Mandatory = $true, ValueFromRemainingArguments = $true)]
  [string[]] $Files
)
$ErrorActionPreference = 'Stop'

function Write-Warn([string] $Message) {
  if ($env:GITHUB_ACTIONS) { Write-Output "::warning::$Message" } else { Write-Warning $Message }
}

function Find-SignTool {
  if ($env:SIGNTOOL) { return $env:SIGNTOOL }
  $onPath = Get-Command signtool.exe -ErrorAction SilentlyContinue
  if ($onPath) { return $onPath.Source }
  $kits = Join-Path ${env:ProgramFiles(x86)} 'Windows Kits\10\bin'
  $found = Get-ChildItem -Path $kits -Recurse -Filter signtool.exe -ErrorAction SilentlyContinue |
    Where-Object { $_.FullName -match '\\x64\\signtool\.exe$' } |
    Sort-Object FullName -Descending | Select-Object -First 1
  if (-not $found) { throw 'signtool.exe not found (install the Windows SDK)' }
  return $found.FullName
}

function Invoke-SignTool([string[]] $Arguments) {
  & $script:SignTool @Arguments
  if ($LASTEXITCODE -ne 0) { throw "signtool $($Arguments[0]) failed with exit code $LASTEXITCODE" }
}

# The signtool dlib from the Microsoft.ArtifactSigning.Client NuGet package. It authenticates with
# DefaultAzureCredential, so the `az login` performed before this script is what it uses. Cached per
# runner: electron-builder invokes this script for every executable it packages.
function Get-ArtifactSigningDlib {
  $base = if ($env:RUNNER_TEMP) { $env:RUNNER_TEMP } else { [IO.Path]::GetTempPath() }
  $client = Join-Path $base 'redrob-office-artifact-signing-client'
  $existing = Get-ChildItem -Path $client -Recurse -Filter Azure.CodeSigning.Dlib.dll -ErrorAction SilentlyContinue |
    Where-Object { $_.FullName -match '\\x64\\' } | Select-Object -First 1
  if ($existing) { return $existing.FullName }
  New-Item -ItemType Directory -Force -Path $client | Out-Null
  $pkg = Join-Path $client 'artifact-signing-client.zip'
  Invoke-WebRequest -Uri 'https://www.nuget.org/api/v2/package/Microsoft.ArtifactSigning.Client' -OutFile $pkg
  Expand-Archive -Path $pkg -DestinationPath (Join-Path $client 'client') -Force
  $dlib = Get-ChildItem -Path (Join-Path $client 'client') -Recurse -Filter Azure.CodeSigning.Dlib.dll |
    Where-Object { $_.FullName -match '\\x64\\' } | Select-Object -First 1
  if (-not $dlib) { throw 'Azure.CodeSigning.Dlib.dll not found in Microsoft.ArtifactSigning.Client' }
  return $dlib.FullName
}

$Files = $Files | ForEach-Object { (Resolve-Path $_).Path }
$required = 'ARTIFACT_SIGNING_ENDPOINT', 'ARTIFACT_SIGNING_ACCOUNT', 'ARTIFACT_SIGNING_CERT_PROFILE'
$missing = @($required | Where-Object { -not [Environment]::GetEnvironmentVariable($_) })

if ($missing.Count -eq $required.Count) {
  Write-Warn "Artifact Signing not configured ($($required -join ', ') unset): leaving unsigned: $($Files -join ', ')"
  exit 0
}
if ($missing.Count -gt 0) { throw "Artifact Signing half-configured; missing: $($missing -join ', ')" }

$script:SignTool = Find-SignTool
$dlib = Get-ArtifactSigningDlib
$tmp = Join-Path ([IO.Path]::GetTempPath()) "redrob-office-sign-$PID"
New-Item -ItemType Directory -Force -Path $tmp | Out-Null

try {
  Write-Output "Signing with Azure Artifact Signing ($env:ARTIFACT_SIGNING_ACCOUNT / $env:ARTIFACT_SIGNING_CERT_PROFILE): $($Files -join ', ')"
  $metadata = Join-Path $tmp 'metadata.json'
  @{
    Endpoint               = $env:ARTIFACT_SIGNING_ENDPOINT.TrimEnd('/')
    CodeSigningAccountName = $env:ARTIFACT_SIGNING_ACCOUNT
    CertificateProfileName = $env:ARTIFACT_SIGNING_CERT_PROFILE
    # Only the credentials a CI runner or a developer shell can satisfy. Without this list a
    # missing or expired login falls through to InteractiveBrowserCredential, which opens a browser
    # nobody sees and waits forever (one release hung 30 minutes on it). Now it fails in seconds.
    ExcludeCredentials     = @(
      'InteractiveBrowserCredential', 'ManagedIdentityCredential', 'SharedTokenCacheCredential',
      'VisualStudioCredential', 'VisualStudioCodeCredential', 'AzurePowerShellCredential',
      'AzureDeveloperCliCredential', 'WorkloadIdentityCredential'
    )
  } | ConvertTo-Json | Set-Content -Path $metadata -Encoding utf8
  $ts = if ($env:WINDOWS_TIMESTAMP_URL) { $env:WINDOWS_TIMESTAMP_URL } else { 'http://timestamp.acs.microsoft.com' }
  $common = @('sign', '/v', '/fd', 'SHA256', '/td', 'SHA256', '/d', 'Redrob Office', '/du', 'https://github.com/redrob-labs/redrob-office')
  Invoke-SignTool ($common + @('/tr', $ts, '/dlib', $dlib, '/dmdf', $metadata) + $Files)

  # A Public Trust certificate chains to a Microsoft root every Windows trusts, so the full
  # Authenticode check must pass. Anything less (an unsigned file, a broken chain, a bad hash) fails.
  foreach ($file in $Files) {
    Invoke-SignTool @('verify', '/pa', '/v', $file)
    $signature = Get-AuthenticodeSignature -FilePath $file
    if ($signature.Status -ne 'Valid') { throw "$file signature status $($signature.Status): $($signature.StatusMessage)" }
    Write-Output "$file signed by $($signature.SignerCertificate.Subject)"
  }
}
finally {
  Remove-Item -Recurse -Force $tmp -ErrorAction SilentlyContinue
}
