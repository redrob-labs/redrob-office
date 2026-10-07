# 한글 2024 reference generator (design §10). Runs on the self-hosted Windows
# runner that has a licensed 한글 2024 installed.
#
#   powershell -NoProfile -ExecutionPolicy Bypass -File reference.ps1 -Job job.json
#
# job.json: { "items": [{ "id": "...", "file": "C:\\...\\a.hwp", "pdf": "C:\\...\\a.pdf" }] }
# Writes each PDF and prints one JSON line per item:
#   {"id":..,"opened":true|false,"saved":true|false,"hancomVersion":"..","error":..}
#
# The output path is fixed: the automation object's own SaveAs "PDF" filter.
# rhwp documents that Hancom's PDF differs between output paths (built-in PDF
# filter, OS printing, Hancom Docs), so references are only comparable when
# they come from the same path and the same Hancom build.
#
# Automation must be allowed without the file-access confirmation prompt. On
# the runner, register Hancom's FilePathCheckerModule (the security module DLL
# from Hancom's developer site) under
#   HKCU\Software\HNC\HwpAutomation\Modules  FilePathCheckerModule = <dll path>
# RegisterModule below then suppresses the prompt.
param([Parameter(Mandatory = $true)][string]$Job)

$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$spec = Get-Content -Raw -Encoding UTF8 $Job | ConvertFrom-Json

$hwp = New-Object -ComObject HWPFrame.HwpObject
try {
  [void]$hwp.RegisterModule('FilePathCheckDLL', 'FilePathCheckerModule')
  $hwp.XHwpWindows.Item(0).Visible = $false
  # Answer every message box with its default button, so a repair or
  # compatibility prompt never blocks the run. Whether one appeared is still
  # visible: Open returns false when the document could not be opened cleanly.
  [void]$hwp.SetMessageBoxMode(0x00010000)
  $version = [string]$hwp.Version

  foreach ($item in $spec.items) {
    $result = [ordered]@{ id = $item.id; opened = $false; saved = $false; hancomVersion = $version; error = $null }
    try {
      $result.opened = [bool]$hwp.Open($item.file, '', 'forceopen:true;versionwarning:false')
      if ($result.opened) {
        New-Item -ItemType Directory -Force -Path (Split-Path -Parent $item.pdf) | Out-Null
        $result.saved = [bool]$hwp.SaveAs($item.pdf, 'PDF', '')
      }
    } catch {
      $result.error = $_.Exception.Message
    } finally {
      try { [void]$hwp.Clear(1) } catch {}
    }
    $result | ConvertTo-Json -Compress
  }
} finally {
  try { $hwp.Quit() } catch {}
  [void][System.Runtime.InteropServices.Marshal]::ReleaseComObject($hwp)
}
