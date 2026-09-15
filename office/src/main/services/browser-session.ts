import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { BrowserWindow, session } from "electron";
import { nowMs } from "../app-time.js";
import { isPrivateHost } from "../tools/net-tools.js";

/**
 * A browser the agent drives by the DOM, not by pixels.
 *
 * The pixel-click path (screen.capture + input.click) is unreliable for a small
 * model: it has to read coordinates off a screenshot and hope. Here the page's
 * own interactive elements are enumerated and numbered (set-of-marks), so the
 * model picks "click 4" and the click lands on exactly that element. The window
 * is visible so a person (or a screen recording) can watch it work.
 */

const PARTITION = "redrob-agent-browser";
const NAV_TIMEOUT_MS = 25_000;
const RENDERER_TIMEOUT_MS = 20_000;
const MAX_MARKS = 60;
const MAX_TEXT_CHARS = 12_000;

export interface BrowserElement {
  mark: number;
  tag: string;
  type: string;
  role: string;
  label: string;
}

export interface BrowserState {
  url: string;
  title: string;
  elements: BrowserElement[];
  /** PNG screenshot with the numbered marks drawn on it. */
  screenshotPath?: string;
  blocked?: boolean;
}

let win: BrowserWindow | null = null;
let hardened = false;

/**
 * A URL the agent's browser may open: https only, and never a private, loopback
 * or metadata host. Without this, `browser.open` (which needs no approval to
 * read) is an SSRF hole into the local network — and a lever for a prompt
 * injected via an untrusted page to reach internal services.
 */
export function isSafeBrowserUrl(raw: string): boolean {
  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    return false;
  }
  if (parsed.protocol !== "https:") return false;
  return !isPrivateHost(parsed.hostname);
}

function hardenSession(): void {
  if (hardened) return;
  hardened = true;
  const ses = session.fromPartition(PARTITION);
  // No mic/camera/geo prompts driving the agent off course; downloads blocked.
  ses.setPermissionRequestHandler((_wc, _perm, cb) => cb(false));
  ses.setPermissionCheckHandler(() => false);
  ses.on("will-download", (event) => event.preventDefault());
}

function ensureWindow(): BrowserWindow {
  if (win && !win.isDestroyed()) return win;
  hardenSession();
  const w = new BrowserWindow({
    width: 1100,
    height: 800,
    show: false,
    title: "Redrob Browser",
    autoHideMenuBar: true,
    webPreferences: {
      partition: PARTITION,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      backgroundThrottling: false,
    },
  });
  w.setMenuBarVisibility(false);
  w.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
  w.webContents.on("will-navigate", (event, url) => {
    if (!isSafeBrowserUrl(url)) event.preventDefault();
  });
  w.on("closed", () => {
    if (win === w) win = null;
  });
  win = w;
  return w;
}

/**
 * Enumerate the visible interactive elements, tag each with a mark number, and
 * draw a numbered badge on it. Returns the list the model chooses from.
 */
const ENUMERATE_SCRIPT = `(() => {
  for (const b of document.querySelectorAll('[data-redrob-badge]')) b.remove();
  const selector = [
    'a[href]','button','input:not([type=hidden])','textarea','select',
    '[role=button]','[role=link]','[role=textbox]','[role=checkbox]','[role=tab]',
    '[contenteditable=""]','[contenteditable=true]','summary','[onclick]'
  ].join(',');
  const out = [];
  let mark = 0;
  // Walk the top document and any same-origin iframe (TinyMCE and other rich
  // editors render their editable area inside an iframe, so without this the
  // message body of a webmail form is invisible and only its toolbar shows).
  const consider = (doc, offX, offY) => {
    let nodes;
    try { nodes = doc.querySelectorAll(selector); } catch (e) { return; }
    for (const el of nodes) {
      if (mark >= ${MAX_MARKS}) return;
      const r = el.getBoundingClientRect();
      const x = r.left + offX, y = r.top + offY;
      if (r.width < 3 || r.height < 3) continue;
      if (y + r.height < 0 || y > innerHeight || x + r.width < 0 || x > innerWidth) continue;
      const view = el.ownerDocument.defaultView || window;
      const cs = view.getComputedStyle(el);
      if (cs.visibility === 'hidden' || cs.display === 'none' || Number(cs.opacity) === 0) continue;
      if (el.disabled) continue;
      mark += 1;
      el.setAttribute('data-redrob-mark', String(mark));
      const label = (
        el.getAttribute('aria-label') || el.getAttribute('placeholder') ||
        el.getAttribute('name') || (el.value || '') || (el.innerText || '') ||
        el.getAttribute('title') || el.getAttribute('alt') || ''
      ).toString().replace(/\\s+/g, ' ').trim().slice(0, 90);
      out.push({
        mark,
        tag: el.tagName.toLowerCase(),
        type: (el.getAttribute('type') || '').toLowerCase(),
        role: (el.getAttribute('role') || (el.isContentEditable ? 'textbox' : '')).toLowerCase(),
        label,
      });
      const badge = document.createElement('div');
      badge.setAttribute('data-redrob-badge', '1');
      badge.textContent = String(mark);
      Object.assign(badge.style, {
        position: 'fixed', left: Math.max(0, x) + 'px', top: Math.max(0, y) + 'px',
        zIndex: '2147483647', background: '#dc2626', color: '#fff',
        font: 'bold 11px system-ui, sans-serif', padding: '0 4px', borderRadius: '3px',
        pointerEvents: 'none', boxShadow: '0 0 0 1px #fff',
      });
      document.body.appendChild(badge);
    }
    let frames;
    try { frames = doc.querySelectorAll('iframe,frame'); } catch (e) { return; }
    for (const f of frames) {
      try {
        const d = f.contentDocument;
        if (!d) continue;
        const fr = f.getBoundingClientRect();
        consider(d, offX + fr.left, offY + fr.top);
      } catch (e) { /* cross-origin frame: skip */ }
    }
  };
  consider(document, 0, 0);
  const blocked = /unusual traffic|are you a robot|captcha|verify you are human|has been blocked/i.test(
    (document.body && document.body.innerText) || ''
  );
  return { title: (document.title || '').slice(0, 300), url: location.href, elements: out, blocked };
})()`;

/** Find a marked element across the top document and same-origin iframes. */
const FIND_BY_MARK = `
  function __redrobFind(mark) {
    const sel = '[data-redrob-mark="' + mark + '"]';
    const visit = (doc) => {
      let el = null;
      try { el = doc.querySelector(sel); } catch (e) { return null; }
      if (el) return el;
      let frames;
      try { frames = doc.querySelectorAll('iframe,frame'); } catch (e) { return null; }
      for (const f of frames) {
        try { const d = f.contentDocument; if (d) { const hit = visit(d); if (hit) return hit; } } catch (e) {}
      }
      return null;
    };
    return visit(document);
  }`;

function readTextScript(): string {
  return `(() => {
    const main = document.querySelector('main') || document.body;
    const clone = main ? main.cloneNode(true) : null;
    if (!clone) return '';
    for (const el of clone.querySelectorAll('script,style,noscript,[data-redrob-badge]')) el.remove();
    return (clone.innerText || clone.textContent || '').replace(/\\s+/g, ' ').trim().slice(0, ${MAX_TEXT_CHARS});
  })()`;
}

async function navigate(w: BrowserWindow, url: string): Promise<void> {
  await Promise.race([
    w.loadURL(url).catch((err: { errno?: number; code?: string }) => {
      if (err?.errno === -3 || err?.code === "ERR_ABORTED") return;
      throw err;
    }),
    new Promise<never>((_, reject) => {
      const timer = setTimeout(
        () => reject(new Error("BROWSER_NAV_TIMEOUT")),
        NAV_TIMEOUT_MS,
      );
      w.webContents.once("destroyed", () => {
        clearTimeout(timer);
        reject(new Error("BROWSER_WINDOW_CLOSED"));
      });
    }),
  ]);
}

/**
 * A page owes us nothing on time.
 *
 * Navigation has always been bounded, but the work after it was not: one run
 * opened a site whose renderer never came back, and `browser.open` sat inside
 * `executeJavaScript` for fifteen minutes with the whole turn behind it — the
 * Gateway could see the session was blocked and nothing could do anything about
 * it. A page that will not answer is an answer: the model can go elsewhere.
 */
export async function inTheRenderer<T>(
  w: BrowserWindow,
  script: string,
  ms = RENDERER_TIMEOUT_MS,
): Promise<T> {
  let timer: NodeJS.Timeout | undefined;
  try {
    return (await Promise.race([
      w.webContents.executeJavaScript(script, true),
      new Promise<never>((_, reject) => {
        timer = setTimeout(
          () =>
            reject(
              new Error(
                "BROWSER_PAGE_UNRESPONSIVE: the page never answered. Try another source for the same information.",
              ),
            ),
          ms,
        );
        w.webContents.once("destroyed", () =>
          reject(new Error("BROWSER_WINDOW_CLOSED")),
        );
      }),
    ])) as T;
  } finally {
    if (timer) clearTimeout(timer);
  }
}

async function snapshot(
  w: BrowserWindow,
  mediaDir: string,
): Promise<BrowserState> {
  await new Promise((r) => setTimeout(r, 450));
  const raw = await inTheRenderer<{
    title?: string;
    url?: string;
    elements?: BrowserElement[];
    blocked?: boolean;
  }>(w, ENUMERATE_SCRIPT);
  let screenshotPath: string | undefined;
  try {
    // Let the numbered badges we just appended actually paint before the grab,
    // so the screenshot shows the marks (the element list is already accurate).
    await inTheRenderer(
      w,
      "new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)))",
      5_000,
    );
    const image = await w.webContents.capturePage();
    await mkdir(mediaDir, { recursive: true });
    screenshotPath = join(mediaDir, `browser-${nowMs()}.png`);
    await writeFile(screenshotPath, image.toPNG());
  } catch {
    /* screenshot is a nice-to-have; the element list is the grounding */
  }
  return {
    url: raw?.url ?? w.webContents.getURL(),
    title: (raw?.title ?? "").trim(),
    elements: Array.isArray(raw?.elements) ? raw!.elements! : [],
    ...(screenshotPath ? { screenshotPath } : {}),
    ...(raw?.blocked ? { blocked: true as const } : {}),
  };
}

export async function browserOpen(
  url: string,
  mediaDir: string,
): Promise<BrowserState> {
  if (!isSafeBrowserUrl(url)) {
    throw new Error(
      "Only public https:// URLs are allowed (private, loopback and metadata hosts are blocked).",
    );
  }
  const w = ensureWindow();
  // Visible, never in front. The page is driven through the DOM, so focus buys
  // the run nothing — and taking it pulled the keyboard out from under whoever
  // was typing somewhere else while the agent worked.
  if (!w.isVisible()) w.showInactive();
  await navigate(w, url);
  return snapshot(w, mediaDir);
}

/** Bring the agent's browser forward, for when a person asks to watch it. */
export function showAgentBrowser(): boolean {
  if (!win || win.isDestroyed()) return false;
  win.show();
  win.focus();
  return true;
}

function requireWindow(): BrowserWindow {
  if (!win || win.isDestroyed()) {
    throw new Error("No browser is open. Call browser.open first.");
  }
  return win;
}

export async function browserSnapshot(mediaDir: string): Promise<BrowserState> {
  return snapshot(requireWindow(), mediaDir);
}

export async function browserClickMark(
  mark: number,
  mediaDir: string,
): Promise<{ state: BrowserState; clicked: boolean; note: string }> {
  const w = requireWindow();
  const result = await inTheRenderer<{ ok?: boolean; tag?: string }>(
    w,
    `(() => {${FIND_BY_MARK}
      const el = __redrobFind(${JSON.stringify(String(mark))});
      if (!el) return { ok: false };
      el.scrollIntoView({ block: 'center', inline: 'center' });
      el.click();
      return { ok: true, tag: el.tagName.toLowerCase() };
    })()`,
  );
  await new Promise((r) => setTimeout(r, 600));
  const state = await snapshot(w, mediaDir);
  return {
    state,
    clicked: Boolean(result?.ok),
    note: result?.ok ? `clicked <${result.tag}> #${mark}` : `no element numbered ${mark}`,
  };
}

export async function browserTypeMark(
  mark: number,
  text: string,
  submit: boolean,
  mediaDir: string,
): Promise<{ state: BrowserState; ok: boolean; note: string }> {
  const w = requireWindow();
  const result = await inTheRenderer<{ ok?: boolean; error?: string }>(
    w,
    `(() => {${FIND_BY_MARK}
      const el = __redrobFind(${JSON.stringify(String(mark))});
      if (!el) return { ok: false, error: 'no such mark' };
      el.focus();
      const value = ${JSON.stringify(text)};
      const tag = el.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA') {
        const proto = tag === 'TEXTAREA' ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
        const setter = Object.getOwnPropertyDescriptor(proto, 'value');
        if (setter && setter.set) setter.set.call(el, value); else el.value = value;
      } else if (el.isContentEditable) {
        el.textContent = value;
      } else {
        return { ok: false, error: 'not a text field' };
      }
      el.dispatchEvent(new Event('input', { bubbles: true }));
      el.dispatchEvent(new Event('change', { bubbles: true }));
      if (${submit ? "true" : "false"}) {
        const form = el.form;
        if (form && form.requestSubmit) form.requestSubmit();
        else el.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', keyCode: 13, bubbles: true }));
      }
      return { ok: true };
    })()`,
  );
  await new Promise((r) => setTimeout(r, submit ? 800 : 300));
  const state = await snapshot(w, mediaDir);
  return {
    state,
    ok: Boolean(result?.ok),
    note: result?.ok
      ? `typed into #${mark}${submit ? " and submitted" : ""}`
      : `could not type into ${mark}: ${result?.error ?? "unknown"}`,
  };
}

export async function browserReadText(): Promise<string> {
  const w = requireWindow();
  return inTheRenderer<string>(w, readTextScript());
}

export async function browserBack(
  mediaDir: string,
): Promise<{ state: BrowserState; wentBack: boolean }> {
  const w = requireWindow();
  const history = w.webContents.navigationHistory;
  const wentBack = history.canGoBack();
  if (wentBack) {
    history.goBack();
    await new Promise((r) => setTimeout(r, 700));
  }
  return { state: await snapshot(w, mediaDir), wentBack };
}

export async function browserScroll(
  direction: "up" | "down",
  amount: number,
  mediaDir: string,
): Promise<BrowserState> {
  const w = requireWindow();
  const dy = (direction === "up" ? -1 : 1) * Math.max(1, amount);
  await inTheRenderer(w, `window.scrollBy({ top: ${dy}, behavior: 'instant' }); true`);
  await new Promise((r) => setTimeout(r, 250));
  return snapshot(w, mediaDir);
}

export async function browserWaitFor(
  text: string | undefined,
  ms: number,
  mediaDir: string,
): Promise<{ state: BrowserState; found: boolean }> {
  const w = requireWindow();
  const deadline = nowMs() + Math.min(Math.max(ms, 200), 30_000);
  const needle = text?.trim().toLowerCase();
  let found = !needle;
  while (nowMs() < deadline) {
    if (needle) {
      const body = await inTheRenderer<string>(
        w,
        "(document.body && document.body.innerText || '').toLowerCase()",
      );
      if (body.includes(needle)) {
        found = true;
        break;
      }
    }
    await new Promise((r) => setTimeout(r, 400));
    if (!needle && nowMs() >= deadline) break;
  }
  return { state: await snapshot(w, mediaDir), found };
}

export function closeAgentBrowser(): void {
  const w = win;
  win = null;
  if (w && !w.isDestroyed()) w.destroy();
}
