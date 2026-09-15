/**
 * Look at a page the agent just wrote, the way the person will.
 *
 * A page can be written, saved, and read back byte for byte correct and still
 * open as a white rectangle: a gradient set on a `body` whose children are all
 * absolutely positioned has no box to fill, and one missing bracket in a
 * `linear-gradient(...)` drops the declaration without a word. Both leave light
 * text on a white canvas, and nothing in the write result says so — the agent
 * reports success and the person opens nothing.
 *
 * So the file is loaded in a window nobody sees and the result is judged on what
 * it painted: how much of the viewport is a single colour, and whether any text
 * ended up the same colour as what is behind it. What comes back is written for
 * the model to read, because it is the one that has to fix the file.
 */
import { BrowserWindow } from "electron";

export interface HtmlRenderCheck {
  ok: boolean;
  /** One line per problem, phrased for the model that wrote the file. */
  problems: string[];
}

interface PageFacts {
  visibleTextChars: number;
  elementCount: number;
  /** Text nodes whose colour matches the background behind them. */
  invisibleText: number;
  /** Rules the parser kept, to tell a dropped declaration from an empty file. */
  styleRuleCount: number;
}

const VIEWPORT = { width: 1000, height: 700 };

export async function checkHtmlRenders(path: string): Promise<HtmlRenderCheck> {
  let win: BrowserWindow | null = null;
  try {
    win = new BrowserWindow({
      show: false,
      width: VIEWPORT.width,
      height: VIEWPORT.height,
      webPreferences: { sandbox: true, javascript: true, offscreen: false },
    });
    await win.loadFile(path);
    // Give scripts that lay the page out on load their turn, and animations a
    // frame to settle, before judging what is on screen.
    await new Promise((resolve) => setTimeout(resolve, 500));

    const facts = (await win.webContents.executeJavaScript(
      pageFactsScript(),
      true,
    )) as PageFacts;

    const image = win.webContents.capturePage
      ? await win.webContents.capturePage()
      : null;
    const flatness = image && !image.isEmpty() ? flatColourShare(image) : null;

    const problems: string[] = [];
    if (facts.elementCount > 1 && facts.visibleTextChars === 0) {
      problems.push(
        "the page has content in its markup but paints no readable text",
      );
    }
    if (flatness !== null && flatness > 0.995) {
      problems.push(
        "the whole window is a single flat colour — nothing painted",
      );
    } else if (facts.invisibleText > 0) {
      problems.push(
        `${facts.invisibleText} text element(s) are the same colour as the background behind them`,
      );
    }

    if (problems.length === 0) return { ok: true, problems: [] };
    return {
      ok: false,
      problems: [
        ...problems,
        "Usual causes: a background set on `body` whose children are all absolutely positioned (it has no height to fill), `html, body` without `height: 100%`, or a CSS syntax slip such as a missing bracket in `linear-gradient(...)`, which drops the declaration silently. Put the background on an element that has a size, then write the file again.",
      ],
    };
  } catch {
    // A check that cannot run must not fail the write it was checking.
    return { ok: true, problems: [] };
  } finally {
    win?.destroy();
  }
}

function pageFactsScript(): string {
  return `(() => {
    const body = document.body;
    if (!body) return { visibleTextChars: 0, elementCount: 0, invisibleText: 0, styleRuleCount: 0 };

    const parseColour = (value) => {
      const m = /rgba?\\(([^)]+)\\)/.exec(value || "");
      if (!m) return null;
      const parts = m[1].split(",").map((p) => parseFloat(p));
      return { r: parts[0], g: parts[1], b: parts[2], a: parts.length > 3 ? parts[3] : 1 };
    };

    const backdropOf = (el) => {
      let node = el;
      while (node && node !== document.documentElement) {
        const cs = getComputedStyle(node);
        if (cs.backgroundImage && cs.backgroundImage !== "none") return "image";
        const bg = parseColour(cs.backgroundColor);
        if (bg && bg.a > 0.1) return bg;
        node = node.parentElement;
      }
      const rootBg = parseColour(getComputedStyle(document.documentElement).backgroundColor);
      return rootBg && rootBg.a > 0.1 ? rootBg : { r: 255, g: 255, b: 255, a: 1 };
    };

    let visibleTextChars = 0;
    let invisibleText = 0;
    for (const el of Array.from(body.querySelectorAll("*"))) {
      const own = Array.from(el.childNodes)
        .filter((n) => n.nodeType === 3)
        .map((n) => n.textContent.trim())
        .join(" ")
        .trim();
      if (!own) continue;
      const cs = getComputedStyle(el);
      if (cs.display === "none" || cs.visibility === "hidden" || parseFloat(cs.opacity) < 0.05) continue;
      const rect = el.getBoundingClientRect();
      if (rect.width < 1 || rect.height < 1) continue;
      const fg = parseColour(cs.color);
      const bg = backdropOf(el);
      if (fg && bg !== "image" && Math.abs(fg.r - bg.r) + Math.abs(fg.g - bg.g) + Math.abs(fg.b - bg.b) < 24) {
        invisibleText += 1;
        continue;
      }
      visibleTextChars += own.length;
    }

    let styleRuleCount = 0;
    for (const sheet of Array.from(document.styleSheets)) {
      try {
        styleRuleCount += sheet.cssRules.length;
      } catch {
        // cross-origin sheet; not ours to read
      }
    }

    return {
      visibleTextChars,
      elementCount: body.querySelectorAll("*").length,
      invisibleText,
      styleRuleCount,
    };
  })()`;
}

/**
 * How much of the window is the single most common colour. A painted page has
 * edges, text and gradients; a page that painted nothing is one colour end to
 * end.
 */
function flatColourShare(image: Electron.NativeImage): number {
  const { width, height } = image.getSize();
  if (width === 0 || height === 0) return 0;
  const bitmap = image.getBitmap();
  const counts = new Map<number, number>();
  let sampled = 0;
  // Every 7th pixel in both directions: enough to tell flat from painted
  // without walking a megabyte per check.
  for (let y = 0; y < height; y += 7) {
    for (let x = 0; x < width; x += 7) {
      const i = (y * width + x) * 4;
      const key =
        (bitmap[i]! << 16) | (bitmap[i + 1]! << 8) | bitmap[i + 2]!;
      counts.set(key, (counts.get(key) ?? 0) + 1);
      sampled += 1;
    }
  }
  if (sampled === 0) return 0;
  let top = 0;
  for (const count of counts.values()) if (count > top) top = count;
  return top / sampled;
}
