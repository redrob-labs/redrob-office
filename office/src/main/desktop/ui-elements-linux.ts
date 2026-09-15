import { spawn, spawnSync } from "node:child_process";
import { UnsupportedDesktopError } from "./backend.js";
import {
  filterElements,
  finalizeElements,
  type RawUiElement,
  type UiElement,
  type UiRect,
} from "./ui-elements.js";
import type { UiReadResult } from "./ui-elements-win32.js";

/**
 * Reading the Linux accessibility tree via AT-SPI.
 *
 * The Windows path shells out to a PowerShell UIA client; the Linux equivalent
 * is AT-SPI, spoken through `pyatspi`. A short Python reader walks the tree of
 * the matching top-level window and prints one JSON line per element with its
 * role, name and on-screen rectangle. AT-SPI already reports coordinates in
 * absolute screen pixels — the very space xdotool clicks — so unlike Windows
 * there is no DPI calibration to undo.
 *
 * This is best-effort: it needs `python3` with the `pyatspi` binding and an
 * accessibility bridge (at-spi2 / libatk-adaptor) enabled for the toolkit the
 * app is built on (GTK exposes its tree once the bridge is loaded). When any
 * of that is missing the reader reports it plainly and the caller falls back
 * to screen.capture, rather than pretending native grounding is available.
 */

const READ_TIMEOUT_MS = 15_000;

/** Names we will pass as an argv match — nothing exotic. */
const SAFE_MATCH = /^[\w .\-]{1,64}$/;

/** The AT-SPI walker. Reads argv[1] as the window-name substring to match. */
const READER = `
import sys, json
import gi
gi.require_version('Atspi', '2.0')
import pyatspi


def emit(o):
    sys.stdout.write(json.dumps(o) + "\\n")


def extents(acc):
    try:
        comp = acc.queryComponent()
        e = comp.getExtents(pyatspi.DESKTOP_COORDS)
        return (int(e.x), int(e.y), int(e.width), int(e.height))
    except Exception:
        return None


ROLE_MAP = {
    'push button': 'Button',
    'toggle button': 'Button',
    'check box': 'CheckBox',
    'check menu item': 'MenuItem',
    'radio menu item': 'MenuItem',
    'combo box': 'ComboBox',
    'entry': 'Edit',
    'password text': 'Edit',
    'link': 'Hyperlink',
    'list item': 'ListItem',
    'menu': 'MenuItem',
    'menu item': 'MenuItem',
    'radio button': 'RadioButton',
    'slider': 'Slider',
    'page tab': 'TabItem',
    'tree item': 'TreeItem',
    'label': 'Text',
    'static': 'Text',
    'heading': 'Text',
}


def map_role(acc, editable):
    try:
        rn = acc.getRoleName()
    except Exception:
        return ''
    if rn in ('text', 'document text', 'document frame', 'document web'):
        return 'Edit' if editable else 'Text'
    return ROLE_MAP.get(rn, '')


def get_value(acc, editable):
    if not editable:
        return None
    try:
        t = acc.queryText()
        s = t.getText(0, -1)
        if s and len(s) > 400:
            s = s[:400]
        return s
    except Exception:
        return None


MAX_ELEMENTS = 400


def walk(acc, out, depth=0):
    if len(out) >= MAX_ELEMENTS or depth > 25:
        return
    try:
        n = acc.get_child_count()
    except Exception:
        n = 0
    for i in range(n):
        if len(out) >= MAX_ELEMENTS:
            return
        try:
            child = acc.get_child_at_index(i)
        except Exception:
            continue
        if child is None:
            continue
        try:
            states = child.getState()
            showing = states.contains(pyatspi.STATE_SHOWING)
            editable = states.contains(pyatspi.STATE_EDITABLE)
            enabled = (states.contains(pyatspi.STATE_ENABLED)
                       or states.contains(pyatspi.STATE_SENSITIVE))
        except Exception:
            showing = True
            editable = False
            enabled = True
        role = map_role(child, editable)
        if role and showing:
            ext = extents(child)
            if ext and ext[2] > 0 and ext[3] > 0:
                name = child.name or ''
                if len(name) > 120:
                    name = name[:120]
                out.append({
                    'k': 'e', 'n': name, 'r': role,
                    'x': ext[0], 'y': ext[1], 'w': ext[2], 'h': ext[3],
                    'en': bool(enabled), 'v': get_value(child, editable),
                })
        walk(child, out, depth + 1)


def main():
    match = (sys.argv[1] if len(sys.argv) > 1 else '').strip().lower()
    try:
        desktop = pyatspi.Registry.getDesktop(0)
    except Exception as ex:
        emit({'k': 'err', 'm': 'AT-SPI is not reachable: ' + str(ex)})
        return
    matched = []
    candidates = []
    try:
        app_count = desktop.get_child_count()
    except Exception:
        app_count = 0
    for ai in range(app_count):
        try:
            app = desktop.get_child_at_index(ai)
        except Exception:
            continue
        if app is None:
            continue
        app_name = app.name or ''
        try:
            fc = app.get_child_count()
        except Exception:
            fc = 0
        for fi in range(fc):
            try:
                frame = app.get_child_at_index(fi)
            except Exception:
                continue
            if frame is None:
                continue
            fname = frame.name or ''
            candidates.append(app_name + ' \\u2014 ' + fname)
            hay = (app_name + ' ' + fname).lower()
            if match and match in hay:
                matched.append((app_name, frame, fname, extents(frame) or (0, 0, 0, 0)))
    if not matched:
        for c in candidates[:20]:
            emit({'k': 'c', 't': c})
        emit({'k': 'err', 'm': 'no window matched'})
        return
    matched.sort(key=lambda m: m[3][2] * m[3][3], reverse=True)
    app_name, _, fname, ext = matched[0]
    emit({'k': 'w', 'n': app_name, 't': fname,
          'x': ext[0], 'y': ext[1], 'w': ext[2], 'h': ext[3]})
    wi = 0
    for (_, fr, _, fx) in matched:
        emit({'k': 'f', 'i': wi, 'x': fx[0], 'y': fx[1], 'w': fx[2], 'h': fx[3]})
        out = []
        walk(fr, out)
        for e in out:
            e['i'] = wi
            emit(e)
        wi += 1


main()
`;

let probed: boolean | null = null;

/** Whether python3 + the pyatspi binding are present on this machine. */
export function linuxUiElementsAvailable(): boolean {
  // The forced value is read before the platform gate, or the override below
  // cannot reach anything off Linux and the argument-validation path is
  // untestable on a macOS or Windows runner. Production is unchanged: nothing
  // sets `probed` there, so a non-Linux host still answers false.
  if (probed !== null) return probed;
  if (process.platform !== "linux") return false;
  try {
    const check = spawnSync("python3", ["-c", "import gi; gi.require_version('Atspi','2.0'); from gi.repository import Atspi"], {
      timeout: 5_000,
    });
    probed = check.status === 0;
  } catch {
    probed = false;
  }
  return probed;
}

/** Only for tests: force the probe result. */
export function __setLinuxUiProbeForTest(value: boolean | null): void {
  probed = value;
}

type Line =
  | { k: "w"; n: string; t: string; x: number; y: number; w: number; h: number }
  | { k: "f"; i: number; x: number; y: number; w: number; h: number }
  | {
      k: "e";
      i: number;
      n: string;
      r: string;
      x: number;
      y: number;
      w: number;
      h: number;
      en: boolean;
      v?: string | null;
    }
  | { k: "c"; t: string }
  | { k: "err"; m: string };

/** JSON-lines from the AT-SPI reader → filtered, addressable elements. */
export function parseLinuxUiRead(
  stdout: string,
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
      /* a stray warning line is not worth failing the read */
    }
  }

  const candidates = lines
    .filter((line): line is Extract<Line, { k: "c" }> => line.k === "c")
    .map((line) => line.t)
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

  const windowLine = lines.find(
    (line): line is Extract<Line, { k: "w" }> => line.k === "w",
  );
  if (!windowLine) {
    throw new UnsupportedDesktopError(
      "The accessibility reader returned no window",
    );
  }
  const windowRect: UiRect = {
    x: windowLine.x,
    y: windowLine.y,
    width: windowLine.w,
    height: windowLine.h,
  };

  // Each frame clips its own elements, so a menu popup that opened as its own
  // top-level window survives instead of being judged against the main rect.
  const frames = new Map<number, UiRect>();
  for (const line of lines) {
    if (line.k !== "f") continue;
    frames.set(line.i, { x: line.x, y: line.y, width: line.w, height: line.h });
  }

  const perFrame = new Map<number, RawUiElement[]>();
  for (const line of lines) {
    if (line.k !== "e") continue;
    const list = perFrame.get(line.i) ?? [];
    list.push({
      name: line.n ?? "",
      role: line.r,
      rect: { x: line.x, y: line.y, width: line.w, height: line.h },
      enabled: line.en,
      ...(typeof line.v === "string" ? { value: line.v } : {}),
    });
    perFrame.set(line.i, list);
  }

  const kept: RawUiElement[] = [];
  for (const [index, list] of perFrame) {
    kept.push(...filterElements(list, frames.get(index) ?? windowRect));
  }

  const elements: UiElement[] = finalizeElements(kept, generation, max);
  return {
    window: {
      hwnd: 0,
      title: windowLine.t,
      process: windowLine.n,
      rect: windowRect,
    },
    elements,
    candidates,
  };
}

function runReader(match: string): Promise<string> {
  return new Promise<string>((resolve, reject) => {
    const child = spawn("python3", ["-c", READER, match]);
    let buffer = "";
    let stderr = "";
    child.stdout.setEncoding("utf8");
    child.stdout.on("data", (chunk: string) => {
      buffer += chunk;
    });
    child.stderr.setEncoding("utf8");
    child.stderr.on("data", (chunk: string) => {
      stderr += chunk;
    });
    const timer = setTimeout(() => {
      child.kill();
      reject(
        new UnsupportedDesktopError(
          "Reading the accessibility tree timed out. The window may be busy.",
        ),
      );
    }, READ_TIMEOUT_MS);
    child.on("error", (err) => {
      clearTimeout(timer);
      reject(new UnsupportedDesktopError(err.message));
    });
    child.on("exit", (code) => {
      clearTimeout(timer);
      if (code === 0 || buffer.includes('"k": "')) resolve(buffer);
      else
        reject(
          new UnsupportedDesktopError(
            `The AT-SPI reader failed${stderr ? `: ${stderr.split("\n")[0]}` : "."}`,
          ),
        );
    });
  });
}

export async function readLinuxWindowElements(
  match: string,
  generation: number,
  max?: number,
): Promise<UiReadResult> {
  if (!linuxUiElementsAvailable()) {
    throw new UnsupportedDesktopError(
      "Reading UI elements on Linux needs python3 with the pyatspi binding and " +
        "an AT-SPI bridge. Use screen.capture with a frameId instead.",
    );
  }
  if (!SAFE_MATCH.test(match)) {
    throw new UnsupportedDesktopError(
      "Give a plain app or window name, such as Text Editor.",
    );
  }
  const stdout = await runReader(match);
  return parseLinuxUiRead(stdout, generation, max);
}
