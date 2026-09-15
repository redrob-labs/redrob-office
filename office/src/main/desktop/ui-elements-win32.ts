import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { createRequire } from "node:module";
import { UnsupportedDesktopError } from "./backend.js";
import {
  calibrationFrom,
  filterElements,
  finalizeElements,
  stripControlType,
  type RawUiElement,
  type UiElement,
  type UiRect,
  type UiWindow,
} from "./ui-elements.js";

/**
 * Reading the Windows accessibility tree.
 *
 * UI Automation is out-of-process COM, which koffi cannot drive, so the read
 * happens in a short-lived PowerShell host that already has the .NET client.
 * It costs about half a second and returns exact rectangles, which is a trade
 * worth making against a model guessing pixels off a screenshot.
 *
 * Chromium apps (Slack, Discord, VS Code) keep their tree collapsed until an
 * accessibility client asks for it, so the first read returns a stub and the
 * script asks again.
 */

const READ_TIMEOUT_MS = 15_000;

/** Names we will interpolate into a script — nothing that can close a quote. */
const SAFE_MATCH = /^[\w .\-]{1,64}$/;

export function uiElementsAvailable(): boolean {
  return process.platform === "win32";
}

export function uiaReadScript(): string {
  return `
$ErrorActionPreference = 'Stop'
# Without this the host writes in the console code page (949 on a Korean
# Windows) and every Hangul name comes back as mojibake, which is exactly the
# text we need to match a person against.
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
[Console]::InputEncoding = [System.Text.Encoding]::UTF8
$OutputEncoding = [System.Text.Encoding]::UTF8
Add-Type -AssemblyName UIAutomationClient, UIAutomationTypes
Add-Type -Namespace Redrob -Name Dpi -MemberDefinition @'
[DllImport("user32.dll")] public static extern bool SetProcessDPIAware();
[DllImport("user32.dll")] public static extern int GetSystemMetrics(int n);
'@
try { [void][Redrob.Dpi]::SetProcessDPIAware() } catch {}

function Emit($o) { $o | ConvertTo-Json -Compress -Depth 3 }

# The host stays up between reads. Loading the automation assemblies and
# warming the first call costs about as much as a whole read, and clicking now
# reads too, so paying it once instead of a dozen times is most of a minute.
while ($true) {
$request = [Console]::In.ReadLine()
if ($null -eq $request) { break }
$match = $request.Trim()
if (-not $match) { continue }
try {

$vx = [Redrob.Dpi]::GetSystemMetrics(76)
$vy = [Redrob.Dpi]::GetSystemMetrics(77)
$vw = [Redrob.Dpi]::GetSystemMetrics(78)
$vh = [Redrob.Dpi]::GetSystemMetrics(79)
Emit ([pscustomobject]@{ k = 'v'; x = $vx; y = $vy; w = $vw; h = $vh })

$cond = [System.Windows.Automation.Condition]::TrueCondition
$children = [System.Windows.Automation.TreeScope]::Children
$scope = [System.Windows.Automation.TreeScope]::Descendants
$auto = [System.Windows.Automation.AutomationElement]

# Scrolled-away history is most of a chat window and none of it can be
# clicked or seen, so it is left in the app rather than marshalled out.
$onscreen = New-Object System.Windows.Automation.PropertyCondition($auto::IsOffscreenProperty, $false)

# One trip for everything each element has to say.
$cache = New-Object System.Windows.Automation.CacheRequest
$cache.Add($auto::NameProperty)
$cache.Add($auto::ControlTypeProperty)
$cache.Add($auto::BoundingRectangleProperty)
$cache.Add($auto::IsEnabledProperty)
$cache.Add([System.Windows.Automation.ValuePattern]::ValueProperty)
# Cached data only; nothing here calls back into the app for a live property.
$cache.AutomationElementMode = [System.Windows.Automation.AutomationElementMode]::None

# Every top-level window on the desktop, not just the ones with a title. An app
# sitting in the tray has no MainWindowTitle, and a dropdown or a modal is its
# own window that no process ever calls its main one.
$names = @{}
foreach ($p in (Get-Process)) { $names[$p.Id] = $p.ProcessName }
$tops = $auto::RootElement.FindAll($children, $cond)

$matched = @()
foreach ($w in $tops) {
  try {
    $procName = $names[$w.Current.ProcessId]
    $title = $w.Current.Name
    if ($procName -like "*$match*" -or $title -like "*$match*") { $matched += $w }
  } catch {}
}

if ($matched.Count -eq 0) {
  foreach ($w in $tops) {
    try {
      Emit ([pscustomobject]@{
        k = 'c'
        n = $names[$w.Current.ProcessId]
        t = $w.Current.Name
      })
    } catch {}
  }
  Emit ([pscustomobject]@{ k = 'err'; m = 'no window matched' })
  Emit ([pscustomobject]@{ k = 'end' })
  continue
}

# The biggest window is the app; the rest are its menus and dialogs.
$primary = $matched | Sort-Object -Property @{
  Expression = { $_.Current.BoundingRectangle.Width * $_.Current.BoundingRectangle.Height }
} -Descending | Select-Object -First 1

$pr = $primary.Current.BoundingRectangle
Emit ([pscustomobject]@{
  k = 'w'
  hwnd = [int64]$primary.Current.NativeWindowHandle
  n = $names[$primary.Current.ProcessId]
  t = $primary.Current.Name
  x = [int]$pr.X; y = [int]$pr.Y; w = [int]$pr.Width; h = [int]$pr.Height
})

$wi = 0
foreach ($win in @($primary) + @($matched | Where-Object { $_ -ne $primary })) {
  $wr = $win.Current.BoundingRectangle
  if ([double]::IsInfinity($wr.X) -or $wr.Width -le 0) { continue }
  Emit ([pscustomobject]@{
    k = 'f'
    i = $wi
    t = $win.Current.Name
    x = [int]$wr.X; y = [int]$wr.Y; w = [int]$wr.Width; h = [int]$wr.Height
  })

  # Every property read is a call into the other process, and a Slack window
  # has a thousand elements with six properties each. Asking for all of them up
  # front turns six thousand round trips into one, which is the difference
  # between a read you wait through and one you do not notice.
  $el = $cache.Activate()
  try {
    $all = $win.FindAll($scope, $onscreen)
    if ($all.Count -lt 25) {
      # Chromium builds its tree only once a client asks; the first ask is the trigger.
      Start-Sleep -Milliseconds 700
      $all = $win.FindAll($scope, $onscreen)
    }
  } finally { $el.Dispose() }

  foreach ($e in $all) {
    try {
      $c = $e.Cached
      $r = $c.BoundingRectangle
      if ([double]::IsInfinity($r.X) -or [double]::IsInfinity($r.Y)) { continue }
      if ($r.Width -le 0 -or $r.Height -le 0) { continue }
      $n = $c.Name
      $t = $c.ControlType.ProgrammaticName
      # A nameless control is decoration, except a text field: an unlabelled
      # composer is the thing most worth typing into.
      if (-not $n -and $t -ne 'ControlType.Edit') { continue }
      if ($n -and $n.Length -gt 120) { $n = $n.Substring(0, 120) }
      # What is actually in the box. A field's Name is its label or its
      # placeholder, so without this there is no way to tell an empty search
      # box from one that still holds the last thing typed into it.
      $v = $null
      if ($t -eq 'ControlType.Edit' -or $t -eq 'ControlType.ComboBox' -or $t -eq 'ControlType.Document') {
        try {
          $v = $e.GetCachedPropertyValue([System.Windows.Automation.ValuePattern]::ValueProperty, $false)
          if ($v -isnot [string]) { $v = $null }
          elseif ($v.Length -gt 400) { $v = $v.Substring(0, 400) }
        } catch {}
      }
      Emit ([pscustomobject]@{
        k = 'e'
        i = $wi
        n = $n
        r = $t
        x = [int]$r.X; y = [int]$r.Y; w = [int]$r.Width; h = [int]$r.Height
        en = [bool]$c.IsEnabled
        v = $v
      })
    } catch {}
  }
  $wi = $wi + 1
}

} catch {
  # One failed read must not take the host down with it; the next ask may be
  # for a window that is behaving.
  Emit ([pscustomobject]@{ k = 'err'; m = "$($_.Exception.Message)" })
}
Emit ([pscustomobject]@{ k = 'end' })
}
`;
}

type Line =
  | { k: "v"; x: number; y: number; w: number; h: number }
  | {
      k: "w";
      hwnd: number;
      n: string;
      t: string;
      x: number;
      y: number;
      w: number;
      h: number;
    }
  | { k: "f"; i: number; t: string; x: number; y: number; w: number; h: number }
  | {
      k: "e";
      i: number;
      n: string | null;
      r: string;
      x: number;
      y: number;
      w: number;
      h: number;
      en: boolean;
      v?: string | null;
    }
  | { k: "c"; n: string; t: string }
  | { k: "err"; m: string };

export interface UiReadResult {
  window: UiWindow;
  elements: UiElement[];
  /** Windows we could have read instead, when the match found nothing. */
  candidates: string[];
}

/** JSON-lines from the reader → rects in the app's physical pixel space. */
export function parseUiRead(
  stdout: string,
  actualVirtualScreen: UiRect,
  generation: number,
  max?: number,
): UiReadResult {
  const lines: Line[] = [];
  for (const text of stdout.split(/\r?\n/)) {
    const trimmed = text.trim();
    if (!trimmed.startsWith("{")) continue;
    try {
      lines.push(JSON.parse(trimmed) as Line);
    } catch {
      // A stray host warning is not worth failing the whole read over.
    }
  }

  const candidates = lines
    .filter((line): line is Extract<Line, { k: "c" }> => line.k === "c")
    .map((line) => `${line.n} — ${line.t}`)
    .slice(0, 20);

  const failure = lines.find(
    (line): line is Extract<Line, { k: "err" }> => line.k === "err",
  );
  if (failure) {
    throw new UnsupportedDesktopError(
      candidates.length > 0
        ? `${failure.m}. Open windows: ${candidates.join("; ")}`
        : failure.m,
    );
  }

  const reportedScreen = lines.find(
    (line): line is Extract<Line, { k: "v" }> => line.k === "v",
  );
  const windowLine = lines.find(
    (line): line is Extract<Line, { k: "w" }> => line.k === "w",
  );
  if (!windowLine) {
    throw new UnsupportedDesktopError(
      "The accessibility reader returned no window",
    );
  }

  const toPhysical = reportedScreen
    ? calibrationFrom(
        {
          x: reportedScreen.x,
          y: reportedScreen.y,
          width: reportedScreen.w,
          height: reportedScreen.h,
        },
        actualVirtualScreen,
      )
    : (rect: UiRect) => rect;

  const windowRect = toPhysical({
    x: windowLine.x,
    y: windowLine.y,
    width: windowLine.w,
    height: windowLine.h,
  });

  // Each window clips its own elements, so a dropdown that opened outside the
  // main window survives instead of being judged against a rectangle it was
  // never inside.
  const frames = new Map<number, UiRect>();
  for (const line of lines) {
    if (line.k !== "f") continue;
    frames.set(
      line.i,
      toPhysical({ x: line.x, y: line.y, width: line.w, height: line.h }),
    );
  }

  const perFrame = new Map<number, RawUiElement[]>();
  for (const line of lines) {
    if (line.k !== "e") continue;
    const list = perFrame.get(line.i) ?? [];
    list.push({
      name: line.n ?? "",
      role: stripControlType(line.r),
      rect: toPhysical({ x: line.x, y: line.y, width: line.w, height: line.h }),
      enabled: line.en,
      ...(typeof line.v === "string" ? { value: line.v } : {}),
    });
    perFrame.set(line.i, list);
  }

  const kept: RawUiElement[] = [];
  for (const [index, list] of perFrame) {
    kept.push(...filterElements(list, frames.get(index) ?? windowRect));
  }

  return {
    window: {
      hwnd: windowLine.hwnd,
      title: windowLine.t,
      process: windowLine.n,
      rect: windowRect,
    },
    elements: finalizeElements(kept, generation, max),
    candidates,
  };
}

/**
 * The reader, kept alive between reads.
 *
 * Starting a PowerShell host and loading the automation assemblies costs about
 * seven hundred milliseconds, which used to be paid on every look. Clicking
 * and typing now look as well, so it was being paid a dozen times in a run.
 * One host, fed a window name per line, pays it once.
 */
let host: ChildProcessWithoutNullStreams | null = null;
/** One read at a time: the host answers in order and has one stdout. */
let pending: Promise<string> = Promise.resolve("");

function startHost(): ChildProcessWithoutNullStreams {
  const encoded = Buffer.from(uiaReadScript(), "utf16le").toString("base64");
  const child = spawn(
    "powershell.exe",
    ["-NoProfile", "-NonInteractive", "-EncodedCommand", encoded],
    { windowsHide: true },
  );
  child.stdout.setEncoding("utf8");
  child.stderr.resume();
  child.on("exit", () => {
    if (host === child) host = null;
  });
  child.on("error", () => {
    if (host === child) host = null;
  });
  return child;
}

function stopHost(): void {
  const child = host;
  host = null;
  child?.kill();
}

function askHost(match: string): Promise<string> {
  const child = host ?? (host = startHost());
  return new Promise<string>((resolve, reject) => {
    let buffer = "";
    const finish = (err: Error | null): void => {
      clearTimeout(timer);
      child.stdout.off("data", onData);
      child.off("exit", onExit);
      if (err) reject(err);
      else resolve(buffer);
    };
    const onData = (chunk: string): void => {
      buffer += chunk;
      if (buffer.includes('{"k":"end"}')) finish(null);
    };
    const onExit = (): void => {
      finish(
        new UnsupportedDesktopError("The accessibility reader stopped early"),
      );
    };
    const timer = setTimeout(() => {
      // A wedged read means a wedged host; the next one starts clean.
      stopHost();
      child.kill();
      finish(
        new UnsupportedDesktopError(
          "Reading the accessibility tree timed out. The window may be busy.",
        ),
      );
    }, READ_TIMEOUT_MS);
    child.stdout.on("data", onData);
    child.once("exit", onExit);
    child.stdin.write(`${match}\n`, "utf8", (err) => {
      if (err) finish(new UnsupportedDesktopError(err.message));
    });
  });
}

function runReader(match: string): Promise<string> {
  const next = pending.then(
    () => askHost(match),
    () => askHost(match),
  );
  pending = next.catch(() => "");
  return next;
}

/** Let go of the reader when the app is closing. */
process.once("exit", stopHost);

/** The whole virtual desktop in physical pixels, as the app measures it. */
function actualVirtualScreen(): UiRect {
  const require_ = createRequire(import.meta.url);
  const { screen } = require_("electron") as typeof import("electron");
  let left = Infinity;
  let top = Infinity;
  let right = -Infinity;
  let bottom = -Infinity;
  for (const display of screen.getAllDisplays()) {
    const rect = screen.dipToScreenRect(null, display.bounds);
    left = Math.min(left, rect.x);
    top = Math.min(top, rect.y);
    right = Math.max(right, rect.x + rect.width);
    bottom = Math.max(bottom, rect.y + rect.height);
  }
  if (!Number.isFinite(left)) {
    throw new UnsupportedDesktopError("No display is attached");
  }
  return { x: left, y: top, width: right - left, height: bottom - top };
}

export async function readWindowElements(
  match: string,
  generation: number,
  /**
   * How many elements to keep. The default budget exists so a window fits in a
   * prompt; a caller reading the window to check its own work is not writing a
   * prompt and must not have the message rows trimmed off the end.
   */
  max?: number,
): Promise<UiReadResult> {
  if (!uiElementsAvailable()) {
    throw new UnsupportedDesktopError(
      "Reading UI elements is only implemented on Windows so far.",
    );
  }
  if (!SAFE_MATCH.test(match)) {
    throw new UnsupportedDesktopError(
      "Give a plain app or window name, such as Slack.",
    );
  }
  const stdout = await runReader(match);
  return parseUiRead(stdout, actualVirtualScreen(), generation, max);
}
