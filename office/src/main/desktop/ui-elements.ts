/**
 * Naming what is on screen instead of guessing where it is.
 *
 * A screenshot asks the model to point at a pixel, and models are bad at that:
 * a Slack composer read off a 1600x900 PNG lands tens to hundreds of pixels
 * away, and the click hits whatever is underneath. The accessibility tree
 * already knows the exact rectangle of every button, field and conversation,
 * so the model picks an element by name and the runtime does the arithmetic.
 *
 * This module is the platform-free half: shaping, ranking and addressing
 * elements, plus the calibration that survives a reader running at a different
 * DPI awareness than the app. Reading the tree lives in ui-elements-win32.
 */

export interface UiRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface RawUiElement {
  name: string;
  /** UIA control type, already stripped of its "ControlType." prefix. */
  role: string;
  rect: UiRect;
  enabled?: boolean;
  /**
   * What is in the box, for anything that holds text.
   *
   * A field's `name` is its label or its placeholder, so it says nothing about
   * whether the field is empty. Without the value there is no way to tell a
   * fresh search box from one still holding the last thing typed into it, and
   * typing into the second appends: `redrob-labsredrob-labs`.
   */
  value?: string;
}

export interface UiElement extends RawUiElement {
  /** Addressable for one snapshot only — a later read expires it. */
  id: string;
  /** Physical-pixel point to click, the space SetCursorPos speaks. */
  center: { x: number; y: number };
}

export interface UiWindow {
  hwnd: number;
  title: string;
  process: string;
  rect: UiRect;
}

export class StaleElementError extends Error {}

/** Worth clicking or reading; containers and decoration are dropped. */
const KEEP_ROLES = new Set([
  "Button",
  "CheckBox",
  "ComboBox",
  "Edit",
  "Hyperlink",
  "ListItem",
  "MenuItem",
  "RadioButton",
  "Slider",
  "SplitButton",
  "TabItem",
  "Text",
  "TreeItem",
]);

/** Text is everywhere in a chat app; keep it, but never let it crowd out targets. */
const TEXT_ROLES = new Set(["Text"]);

export function stripControlType(programmaticName: string): string {
  return programmaticName.replace(/^ControlType\./, "");
}

function area(rect: UiRect): number {
  return Math.max(0, rect.width) * Math.max(0, rect.height);
}

function overlaps(rect: UiRect, window: UiRect): boolean {
  return (
    rect.x < window.x + window.width &&
    rect.x + rect.width > window.x &&
    rect.y < window.y + window.height &&
    rect.y + rect.height > window.y
  );
}

/**
 * Map a rect from the reader's coordinate space into true physical pixels.
 *
 * PowerShell hosting the UIA client may be DPI-unaware, in which case every
 * rectangle it reports is scaled by the monitor's factor. Comparing the window
 * it reported against the window rect the (DPI-aware) app measures gives the
 * correction without having to know the scale factor at all.
 */
export function calibrationFrom(
  reported: UiRect,
  actual: UiRect,
): (rect: UiRect) => UiRect {
  const scaleX = reported.width > 0 ? actual.width / reported.width : 1;
  const scaleY = reported.height > 0 ? actual.height / reported.height : 1;
  const sane = (value: number): number =>
    Number.isFinite(value) && value >= 0.2 && value <= 5 ? value : 1;
  const sx = sane(scaleX);
  const sy = sane(scaleY);
  return (rect) => ({
    x: Math.round(actual.x + (rect.x - reported.x) * sx),
    y: Math.round(actual.y + (rect.y - reported.y) * sy),
    width: Math.round(rect.width * sx),
    height: Math.round(rect.height * sy),
  });
}

export function centerOf(rect: UiRect): { x: number; y: number } {
  return {
    x: Math.round(rect.x + rect.width / 2),
    y: Math.round(rect.y + rect.height / 2),
  };
}

export interface SelectOptions {
  window: UiRect;
  max?: number;
  generation: number;
}

/**
 * Drop what nobody would point at, clipped to the window that owns it.
 *
 * Clipping is per window rather than per read: a dropdown or a modal is its own
 * top-level window sitting outside its parent's rectangle, and judging it
 * against the parent would throw away exactly the thing that just opened.
 */
export function filterElements(
  raw: readonly RawUiElement[],
  window: UiRect,
): RawUiElement[] {
  const windowArea = area(window);
  const seen = new Set<string>();
  const kept: RawUiElement[] = [];
  for (const item of raw) {
    // A nameless control is decoration and there are hundreds of them, except
    // for a text field: an unlabelled composer is the one thing on the screen
    // most worth typing into, and dropping it forces a pixel guess.
    const name = item.name.trim() || (item.role === "Edit" ? "text field" : "");
    if (!name) continue;
    if (!KEEP_ROLES.has(item.role)) continue;
    if (item.rect.width <= 0 || item.rect.height <= 0) continue;
    if (!overlaps(item.rect, window)) continue;
    // A "button" the size of the window is a container that lied about itself.
    if (windowArea > 0 && area(item.rect) > windowArea * 0.9) continue;
    const key = `${item.role}|${name}|${item.rect.x},${item.rect.y}`;
    if (seen.has(key)) continue;
    seen.add(key);
    kept.push({ ...item, name });
  }
  return kept;
}

/** Budget, order and address what survived the filter. */
export function finalizeElements(
  kept: readonly RawUiElement[],
  generation: number,
  max = 120,
): UiElement[] {
  // Targets first when the list has to be cut, then reading order for the eye.
  const targets = kept.filter((item) => !TEXT_ROLES.has(item.role));
  const text = kept.filter((item) => TEXT_ROLES.has(item.role));
  const budgeted = [...targets, ...text].slice(0, max);
  budgeted.sort((a, b) => a.rect.y - b.rect.y || a.rect.x - b.rect.x);
  return budgeted.map((item, index) => ({
    ...item,
    id: `e${generation}.${index}`,
    center: centerOf(item.rect),
  }));
}

/**
 * Trim a raw tree to the elements a person would point at, in reading order.
 */
export function selectElements(
  raw: readonly RawUiElement[],
  options: SelectOptions,
): UiElement[] {
  return finalizeElements(
    filterElements(raw, options.window),
    options.generation,
    options.max ?? 120,
  );
}

/**
 * The same control, found again after another read.
 *
 * Ids do not survive a read, so a field that was just filled has to be located
 * by where it is. A text box does not move while you type into it, and a few
 * pixels of drift is the app settling rather than a different control.
 */
export function findByRect(
  elements: readonly UiElement[],
  rect: UiRect,
  role?: string,
): UiElement | null {
  const want = centerOf(rect);
  let best: { element: UiElement; distance: number } | null = null;
  for (const element of elements) {
    if (role && element.role !== role) continue;
    const distance =
      Math.abs(element.center.x - want.x) + Math.abs(element.center.y - want.y);
    if (distance > 24) continue;
    if (!best || distance < best.distance) best = { element, distance };
  }
  return best?.element ?? null;
}

/**
 * Whether the field ended up holding exactly what was typed into it.
 *
 * Strict on purpose. The failure this exists for is a search box that still
 * held `redrob-labs` and became `redrob-labsredrob-labs`, and every loose test
 * - contains, startsWith - calls that a success.
 */
export function fieldHolds(
  actual: string | undefined,
  text: string,
  mode: "replace" | "append" = "replace",
): boolean {
  if (actual === undefined) return false;
  const has = actual.replace(/\s+/g, " ").trim();
  const want = text.replace(/\s+/g, " ").trim();
  if (!want) return true;
  return mode === "append" ? has.endsWith(want) : has === want;
}

/** One line per element, short enough that a whole window fits in a prompt. */
export function describeElement(element: UiElement): string {
  // A field that already holds something is the difference between typing and
  // appending, so it belongs on the line rather than in a later surprise.
  const held = element.value?.trim() ?? "";
  const holding = held
    ? ` holding "${held.length > 60 ? `${held.slice(0, 60)}…` : held}"`
    : "";
  return `${element.id} ${element.role} "${element.name}"${holding} at ${element.center.x},${element.center.y}`;
}

/**
 * The last window read, so input.click can take an id instead of a pixel.
 * Ids carry their generation, so an id from an earlier read never silently
 * resolves to whatever now sits in that slot.
 */
export class UiElementStore {
  private generation = 0;
  private elements = new Map<string, UiElement>();
  private window: UiWindow | null = null;

  nextGeneration(): number {
    return this.generation + 1;
  }

  replace(window: UiWindow, elements: readonly UiElement[]): void {
    this.generation += 1;
    this.window = window;
    this.elements = new Map(elements.map((item) => [item.id, item]));
  }

  currentWindow(): UiWindow | null {
    return this.window;
  }

  /** Everything addressable right now, in the order it was read. */
  current(): UiElement[] {
    return [...this.elements.values()];
  }

  resolve(id: string): UiElement {
    const found = this.elements.get(id);
    if (!found) {
      throw new StaleElementError(
        `No element ${id} is addressable. Run ui.elements again and use an id from that answer.`,
      );
    }
    return found;
  }
}

export const uiElements = new UiElementStore();
