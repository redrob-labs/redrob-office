import { execFile, spawn } from "node:child_process";
import { accessSync, constants, readdirSync } from "node:fs";
import { basename, delimiter, join } from "node:path";
import { promisify } from "node:util";
import { z } from "zod";
import type { RegisteredTool, ToolResult } from "./types.js";

const runFile = promisify(execFile);

/**
 * Electron sets `NO_AT_BRIDGE=1` for child processes on Linux. That is sensible
 * for Chromium's own helper processes, but `app.launch` inherits it too: a
 * launched Mousepad window is visible and typeable yet deliberately absent from
 * AT-SPI, so `ui.elements` can never ground it. Opt the app being controlled back
 * in, and load GTK's accessibility bridge when the host did not name one.
 */
export function appLaunchEnvironment(
  platform: NodeJS.Platform,
  source: NodeJS.ProcessEnv,
): NodeJS.ProcessEnv {
  if (platform !== "linux") return source;
  const modules = new Set(
    (source.GTK_MODULES ?? "")
      .split(":")
      .map((part) => part.trim())
      .filter(Boolean),
  );
  modules.add("gail");
  modules.add("atk-bridge");
  return {
    ...source,
    NO_AT_BRIDGE: "0",
    GTK_MODULES: [...modules].join(":"),
  };
}

function isExecutable(path: string): boolean {
  try {
    accessSync(path, constants.X_OK);
    return true;
  } catch {
    return false;
  }
}

/**
 * Resolve a bare executable name for spawn on case-sensitive filesystems.
 *
 * Models often pass display names (`Mousepad`) while PATH has `mousepad`.
 * Windows is already case-insensitive; on Unix, scan PATH for an exact hit
 * first, then a case-insensitive basename match, before spawn reports ENOENT
 * and the model wrongly concludes the app is not installed.
 */
export function resolveSpawnExecutable(
  target: string,
  platform: NodeJS.Platform,
  pathEnv: string | undefined,
): { command: string; matched: "exact" | "casefold" | "unchanged" } {
  const trimmed = target.trim();
  if (
    !trimmed ||
    platform === "win32" ||
    trimmed.includes("/") ||
    trimmed.includes("\\") ||
    /^[a-z][a-z0-9+.-]*:/i.test(trimmed) ||
    /^[A-Za-z]:[\\/]/.test(trimmed)
  ) {
    return { command: trimmed || target, matched: "unchanged" };
  }

  const dirs = (pathEnv ?? "")
    .split(delimiter)
    .map((part) => part.trim())
    .filter(Boolean);
  // Asked to open a draft in an editor, runs reached for the name they know —
  // mousepad.exe, then notepad.exe — and both ENOENT'd, so they concluded no
  // editor existed here and dropped the last step of the job. A .exe suffix
  // carries no meaning off Windows, and mousepad is right there on PATH.
  const candidates = [trimmed];
  if (/\.exe$/i.test(trimmed)) candidates.push(trimmed.replace(/\.exe$/i, ""));

  for (const candidate of candidates) {
    for (const dir of dirs) {
      if (isExecutable(join(dir, candidate))) {
        return { command: candidate, matched: "exact" };
      }
    }
  }

  for (const candidate of candidates) {
    const needle = candidate.toLowerCase();
    for (const dir of dirs) {
      let entries: string[];
      try {
        entries = readdirSync(dir);
      } catch {
        continue;
      }
      const hit = entries.find((entry) => entry.toLowerCase() === needle);
      if (!hit) continue;
      if (isExecutable(join(dir, hit))) {
        return { command: hit, matched: "casefold" };
      }
    }
  }

  return { command: trimmed, matched: "unchanged" };
}

const POWERSHELL_TIMEOUT_MS = 8_000;

function runPowershell(
  command: string,
  signal?: AbortSignal,
): Promise<{ code: number | null; out: string; err: string }> {
  return new Promise((resolve) => {
    const child = spawn(
      "powershell.exe",
      ["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-Command", command],
      { windowsHide: true, shell: false, signal },
    );
    let out = "";
    let err = "";
    let settled = false;
    const finish = (code: number | null, nextErr = err): void => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve({ code, out, err: nextErr });
    };
    const timer = setTimeout(() => {
      child.kill();
      finish(1, err.trim() || `powershell timed out after ${POWERSHELL_TIMEOUT_MS}ms`);
    }, POWERSHELL_TIMEOUT_MS);
    child.stdout?.setEncoding("utf8");
    child.stderr?.setEncoding("utf8");
    child.stdout?.on("data", (c: string) => {
      if (out.length < 8000) out += c;
    });
    child.stderr?.on("data", (c: string) => {
      if (err.length < 4000) err += c;
    });
    child.on("close", (code) => finish(code));
    child.on("error", (e) => finish(1, e.message));
  });
}

/**
 * Open a URL without yanking the keyboard focus to the browser.
 * Windows ShellExecuteEx + SW_SHOWNOACTIVATE keeps the person in Office.
 */
export async function openUrlInBackground(
  url: string,
  signal?: AbortSignal,
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (process.platform !== "win32") {
    const { shell } = await import("electron");
    await shell.openExternal(url);
    return { ok: true };
  }
  const safe = url.replace(/'/g, "''");
  // LockSetForegroundWindow stops Chrome from yanking focus (and the pointer)
  // onto the other monitor when a tab opens.
  const script = `
$ErrorActionPreference = 'Stop'
Add-Type -TypeDefinition @"
using System;
using System.Runtime.InteropServices;
public static class RedrobSoftOpen {
  public const int SW_SHOWNOACTIVATE = 4;
  public const int SW_SHOWMINNOACTIVE = 7;
  public const uint SEE_MASK_FLAG_NO_UI = 0x00000400;
  public const uint LSFW_LOCK = 1;
  public const uint LSFW_UNLOCK = 2;
  [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)]
  public struct SHELLEXECUTEINFO {
    public int cbSize;
    public uint fMask;
    public IntPtr hwnd;
    public string lpVerb;
    public string lpFile;
    public string lpParameters;
    public string lpDirectory;
    public int nShow;
    public IntPtr hInstApp;
    public IntPtr lpIDList;
    public string lpClass;
    public IntPtr hkeyClass;
    public uint dwHotKey;
    public IntPtr hIcon;
    public IntPtr hProcess;
  }
  [DllImport("user32.dll")]
  public static extern bool LockSetForegroundWindow(uint uLockCode);
  [DllImport("shell32.dll", CharSet = CharSet.Unicode, SetLastError = true)]
  public static extern bool ShellExecuteEx(ref SHELLEXECUTEINFO lpExecInfo);
}
"@
[void][RedrobSoftOpen]::LockSetForegroundWindow([RedrobSoftOpen]::LSFW_LOCK)
try {
  $sei = New-Object RedrobSoftOpen+SHELLEXECUTEINFO
  $sei.cbSize = [System.Runtime.InteropServices.Marshal]::SizeOf($sei)
  $sei.fMask = [RedrobSoftOpen]::SEE_MASK_FLAG_NO_UI
  $sei.lpVerb = 'open'
  $sei.lpFile = '${safe}'
  $sei.nShow = [RedrobSoftOpen]::SW_SHOWNOACTIVATE
  if (-not [RedrobSoftOpen]::ShellExecuteEx([ref]$sei)) {
    throw ("ShellExecuteEx failed: " + [Runtime.InteropServices.Marshal]::GetLastWin32Error())
  }
} finally {
  Start-Sleep -Milliseconds 400
  [void][RedrobSoftOpen]::LockSetForegroundWindow([RedrobSoftOpen]::LSFW_UNLOCK)
}
`.trim();
  const result = await runPowershell(script, signal);
  if (result.code !== 0) {
    return {
      ok: false,
      error: result.err.trim() || result.out.trim() || `exit ${result.code}`,
    };
  }
  return { ok: true };
}

export const appLaunchTool: RegisteredTool = {
  name: "app.launch",
  description: [
    "Open an app, file, or website.",
    "For any website or web app (Google Calendar, Gmail, Notion, Docs, etc.), pass the full https URL as target — e.g. https://calendar.google.com — so the person's default browser opens that page.",
    "Do not launch Slack, Discord, or WhatsApp to read or send messages. Those services use matching mcp__ tools so messaging stays in the background; if no matching tool exists, ask the person to connect it in Settings > MCP Servers.",
    "URLs open in the background without stealing keyboard focus — do not call app.focus afterwards just to look; screen.capture works without focusing the browser.",
    "After launching a non-messaging native app for a send/type task, call app.focus so keyboard and pointer input land in the right window — look-only browser checks do not need that.",
    "Do not launch chrome.exe / msedge.exe alone when they asked to look something up on the web; open the URL.",
    "Also accepts an absolute path, .lnk, or known executable name on PATH (Linux matches the name case-insensitively, so Mousepad finds mousepad).",
  ].join(" "),
  risk: "high",
  inputSchema: z.object({
    target: z
      .string()
      .min(1)
      .describe(
        "https URL (preferred for web), path, or executable name (e.g. https://calendar.google.com, notepad.exe)",
      ),
    args: z.array(z.string()).default([]).describe("Optional argv for spawn"),
  }),
  async handler(input, ctx): Promise<ToolResult> {
    const { shell } = await import("electron");
    let target = input.target.trim();
    const args = input.args ?? [];

    // "calendar.google.com" without a scheme still means open the browser.
    if (
      !/^[a-z][a-z0-9+.-]*:/i.test(target) &&
      !/^[A-Za-z]:[\\/]/.test(target) &&
      !target.includes("\\") &&
      !target.includes("/") &&
      !target.endsWith(".exe") &&
      !target.endsWith(".lnk") &&
      /^[\w.-]+\.[a-z]{2,}([/?#].*)?$/i.test(target)
    ) {
      target = `https://${target}`;
    }

    if (/^[a-z][a-z0-9+.-]*:/i.test(target) && !/^[A-Za-z]:[\\/]/.test(target)) {
      const opened = await openUrlInBackground(target, ctx.signal);
      if (!opened.ok) {
        // Fallback: still open, even if it activates — better than failing.
        await shell.openExternal(target);
        return {
          ok: true,
          summary: `Opened ${target} in the browser`,
          data: { target, quiet: false },
        };
      }
      return {
        ok: true,
        summary: `Opened ${target} in the background (focus kept where it was)`,
        data: { target, quiet: true },
      };
    }

    if (
      args.length === 0 &&
      (target.includes("\\") || target.includes("/") || target.endsWith(".lnk"))
    ) {
      const err = await shell.openPath(target);
      if (err) {
        return { ok: false, summary: `openPath failed: ${err}`, error: err };
      }
      return {
        ok: true,
        summary: `Launched ${basename(target)}`,
        data: { target },
      };
    }

    const resolved = resolveSpawnExecutable(
      target,
      process.platform,
      process.env.PATH,
    );
    const command = resolved.command;

    return await new Promise<ToolResult>((resolve) => {
      let settled = false;
      const done = (result: ToolResult): void => {
        if (settled) return;
        settled = true;
        resolve(result);
      };
      const child = spawn(command, args, {
        detached: true,
        stdio: "ignore",
        windowsHide: false,
        shell: false,
        env: appLaunchEnvironment(process.platform, process.env),
        signal: ctx.signal,
      });
      child.unref();
      child.on("error", (e) => {
        done({ ok: false, summary: e.message, error: e.message });
      });
      child.on("spawn", () => {
        done({
          ok: true,
          summary: `Spawned ${basename(command)} (pid ${child.pid ?? "?"})`,
          data: {
            target: command,
            ...(command !== target ? { requested: target } : {}),
            pid: child.pid,
          },
        });
      });
    });
  },
};

/**
 * Raise a window whose title contains `title` on Linux via xdotool.
 *
 * Without this, `input.type` lands in whatever already has focus (often the
 * Electron chat window), so the model can report "typed OK" while Mousepad
 * stays untouched.
 */
export async function focusWindowLinux(
  title: string,
  signal?: AbortSignal,
): Promise<{ ok: true; matched: string } | { ok: false; error: string }> {
  const needle = title.trim();
  if (!needle) return { ok: false, error: "Empty window title" };
  try {
    const { stdout } = await runFile(
      "xdotool",
      ["search", "--name", "--", needle],
      { timeout: 5_000, signal },
    );
    const ids = stdout
      .split(/\s+/)
      .map((part) => part.trim())
      .filter(Boolean);
    if (ids.length === 0) {
      return { ok: false, error: `Window not found: ${needle}` };
    }
    const windowId = ids[ids.length - 1]!;
    await runFile(
      "xdotool",
      ["windowactivate", "--sync", windowId],
      { timeout: 5_000, signal },
    );
    let matched = needle;
    try {
      const named = await runFile(
        "xdotool",
        ["getwindowname", windowId],
        { timeout: 3_000, signal },
      );
      const name = named.stdout.trim();
      if (name) matched = name;
    } catch {
      /* title lookup is best-effort */
    }
    return { ok: true, matched };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { ok: false, error: message };
  }
}

export const appFocusTool: RegisteredTool = {
  name: "app.focus",
  description: [
    "Focus a window whose title contains the given substring (Windows and Linux).",
    "Only use when you must click or type into that window.",
    "After launching an editor or messenger for a type/send task, call this before input.type so keystrokes land in the right window.",
    "Do not call this after opening a URL just to read the screen — screen.capture works without stealing focus.",
  ].join(" "),
  risk: "high",
  inputSchema: z.object({
    title: z.string().min(1).describe("Case-insensitive window title substring"),
  }),
  async handler(input, ctx): Promise<ToolResult> {
    if (process.platform === "linux") {
      const focused = await focusWindowLinux(input.title, ctx.signal);
      if (!focused.ok) {
        return {
          ok: false,
          summary: `Focus failed: ${focused.error}`,
          error: focused.error,
        };
      }
      return {
        ok: true,
        summary: `Focused window: ${focused.matched}`,
        data: { title: focused.matched },
      };
    }
    if (process.platform !== "win32") {
      return {
        ok: false,
        summary: `app.focus is unsupported on ${process.platform}`,
        error: "Unsupported platform",
      };
    }
    const safe = input.title.replace(/'/g, "''");
    const script = `
$ErrorActionPreference = 'Stop'
$t = '${safe}'
Add-Type -TypeDefinition @"
using System;
using System.Runtime.InteropServices;
public class RedrobWin {
  [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr hWnd);
  [DllImport("user32.dll")] public static extern bool ShowWindow(IntPtr hWnd, int nCmdShow);
}
"@
$p = Get-Process | Where-Object { $_.MainWindowTitle -and ($_.MainWindowTitle -like ("*" + $t + "*")) } | Select-Object -First 1
if (-not $p) { throw "Window not found" }
[void][RedrobWin]::ShowWindow($p.MainWindowHandle, 9)
[void][RedrobWin]::SetForegroundWindow($p.MainWindowHandle)
Write-Output $p.MainWindowTitle
`.trim();
    const result = await runPowershell(script, ctx.signal);
    if (result.code !== 0) {
      return {
        ok: false,
        summary: `Focus failed: ${result.err.trim() || result.out.trim() || `exit ${result.code}`}`,
        error: result.err.trim() || "Window not found",
      };
    }
    return {
      ok: true,
      summary: `Focused window: ${result.out.trim() || input.title}`,
      data: { title: result.out.trim() },
    };
  },
};
