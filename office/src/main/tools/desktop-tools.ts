import { join } from "node:path";
import { z } from "zod";
import { getComputerUseConfig } from "../office/config.js";
import {
  controlStatus,
  displays,
  requireBackend,
  UnsupportedDesktopError,
} from "../desktop/index.js";
import { captureAllScreens, captureScreen } from "../desktop/capture.js";
import {
  displayFrames,
  FrameMismatchError,
  StaleFrameError,
  type DisplayFrame,
} from "../desktop/display-frames.js";
import {
  isRecording,
  startRecording,
  stopRecording,
} from "../desktop/record.js";
import type { Display } from "../desktop/geometry.js";
import { parseChord } from "../desktop/keys.js";
import type { Capture } from "../desktop/capture.js";
import {
  describeElement,
  fieldHolds,
  findByRect,
  StaleElementError,
  uiElements,
  type UiElement,
} from "../desktop/ui-elements.js";
import {
  readWindowElements,
  uiElementsAvailable,
} from "../desktop/ui-elements-native.js";
import type { RegisteredTool, ToolContext, ToolResult } from "./types.js";

/**
 * Seeing and driving the machine.
 *
 * These are the only tools that act outside the app, so they are also the only
 * ones that can do something a person did not ask for on a desktop full of
 * their things. Everything here is `high` risk, every one goes through the
 * approval path, and none of them work at all until desktop control is turned
 * on in Settings.
 *
 * They are deliberately primitive — look, point, click, type. "Open Chrome and
 * send a message" is those four in a loop, and building the loop out of small
 * honest steps is what makes it reviewable and what lets a person stop it
 * halfway.
 *
 * Coordinate clicks are bound to a screen.capture frameId (OpenClaw-style):
 * x,y are pixels on that screenshot; the runtime scales and targets the
 * display that produced the frame. A new capture invalidates older frames.
 */

/** Where captures and recordings go, under the app's own data. */
function mediaDirectory(ctx: ToolContext): string {
  return join(ctx.userDataPath, "desktop-captures");
}

async function backendFor(): Promise<
  Awaited<ReturnType<typeof requireBackend>>
> {
  const config = await getComputerUseConfig();
  return requireBackend(config.desktopControl);
}

const framedPointShape = {
  frameId: z
    .string()
    .min(1)
    .describe(
      "frameId from the screen.capture image you are clicking — required; a new capture expires older ids",
    ),
  x: z
    .number()
    .describe("Horizontal pixel on that screenshot (do not pre-multiply by scale)"),
  y: z
    .number()
    .describe("Vertical pixel on that screenshot (do not pre-multiply by scale)"),
  displayId: z
    .number()
    .int()
    .optional()
    .describe("Optional check; must match the frame's displayId when set"),
};

function framedPointFrom(input: {
  frameId: string;
  x: number;
  y: number;
  displayId?: number;
}): {
  point: { x: number; y: number };
  frame: DisplayFrame;
  screens: Display[];
  coordinateSpace: "dip" | "physical";
} {
  const screens = displays();
  try {
    const resolved = displayFrames.resolveImagePoint(input, screens);
    return {
      point: resolved.point,
      frame: resolved.frame,
      screens,
      coordinateSpace: resolved.space,
    };
  } catch (err) {
    if (
      err instanceof StaleFrameError ||
      err instanceof FrameMismatchError
    ) {
      throw new UnsupportedDesktopError(err.message);
    }
    throw err;
  }
}

/**
 * Where a click lands: a named element when one exists, a screenshot pixel
 * otherwise. Elements are exact, so the pixel path is the fallback rather than
 * the default.
 */
function clickTargetFrom(input: {
  elementId?: string;
  frameId?: string;
  x?: number;
  y?: number;
  displayId?: number;
}): {
  point: { x: number; y: number };
  coordinateSpace: "dip" | "physical";
  where: string;
  data: Record<string, unknown>;
} {
  if (input.elementId) {
    try {
      const element = uiElements.resolve(input.elementId);
      return {
        point: element.center,
        coordinateSpace: "physical",
        where: `${element.role} "${element.name}" (${element.id})`,
        data: {
          ...element.center,
          elementId: element.id,
          name: element.name,
          role: element.role,
        },
      };
    } catch (err) {
      if (err instanceof StaleElementError) {
        throw new UnsupportedDesktopError(err.message);
      }
      throw err;
    }
  }
  if (!input.frameId || input.x === undefined || input.y === undefined) {
    throw new UnsupportedDesktopError(
      "Give an elementId from ui.elements, or a frameId with x,y from screen.capture.",
    );
  }
  const framed = framedPointFrom({
    frameId: input.frameId,
    x: input.x,
    y: input.y,
    ...(input.displayId === undefined ? {} : { displayId: input.displayId }),
  });
  return {
    point: framed.point,
    coordinateSpace: framed.coordinateSpace,
    where: `${framed.point.x},${framed.point.y} (frame ${framed.frame.frameId})`,
    data: {
      ...framed.point,
      frameId: framed.frame.frameId,
      displayId: framed.frame.displayId,
    },
  };
}

const clickTargetShape = {
  elementId: z
    .string()
    .optional()
    .describe(
      "Element id from ui.elements — the accurate way to click. Prefer this.",
    ),
  frameId: z
    .string()
    .optional()
    .describe(
      "Only when the target has no element: frameId from the screen.capture image you are clicking",
    ),
  x: z.number().optional().describe("Screenshot pixel, with frameId"),
  y: z.number().optional().describe("Screenshot pixel, with frameId"),
  displayId: z
    .number()
    .int()
    .optional()
    .describe("Optional check; must match the frame's displayId when set"),
};

function withFrameIds(captures: Capture[]): Array<
  Capture & { frameId: string }
> {
  const frames = displayFrames.replaceFromCaptures(
    captures.map((item) => ({
      display: item.display,
      width: item.width,
      height: item.height,
      scale: item.scale,
      ...(item.physical ? { physical: item.physical } : {}),
    })),
  );
  return captures.map((item, index) => ({
    ...item,
    frameId: frames[index]!.frameId,
  }));
}

function captureSummaryLine(
  item: Capture & { frameId: string },
  index: number,
): string {
  return `Image ${index + 1} = frameId ${item.frameId}, displayId ${item.display.id}${item.display.primary ? " (primary)" : ""} at ${item.width}x${item.height} (scale ${item.scale.toFixed(3)} applied by input.* — pass image pixels + this frameId)`;
}

export const screenCaptureTool: RegisteredTool = {
  name: "screen.capture",
  description:
    "Take a picture of a display and save it as a PNG. Returns frameId per image. " +
    "For input.click / input.move / input.scroll, pass that frameId with x,y in screenshot pixels " +
    "(do not multiply by scale — the runtime does). A new capture invalidates older frameIds. " +
    "With more than one monitor and no displayId, captures every display.",
  risk: "high",
  inputSchema: z.object({
    displayId: z
      .number()
      .int()
      .optional()
      .describe("Which display; omit to capture every attached display when there are several"),
    maxEdge: z
      .number()
      .int()
      .min(320)
      .max(4096)
      .optional()
      .describe("Longest edge of the image in pixels (default 1600)"),
  }),
  async handler(input, ctx): Promise<ToolResult> {
    const config = await getComputerUseConfig();
    const status = await controlStatus(config.desktopControl);
    if (status.state !== "ready") {
      return { ok: false, summary: status.reason, error: status.reason };
    }
    const directory = mediaDirectory(ctx);
    const maxEdge =
      input.maxEdge === undefined ? {} : { maxEdge: input.maxEdge };
    const attached = displays();
    if (input.displayId === undefined && attached.length > 1) {
      const captures = withFrameIds(
        await captureAllScreens({
          directory,
          ...maxEdge,
        }),
      );
      return {
        ok: true,
        summary: `Captured ${captures.length} displays in image order: ${captures
          .map((item, index) => captureSummaryLine(item, index))
          .join("; ")}.`,
        data: { captures },
        media: captures.map((item) => ({
          path: item.path,
          kind: "image" as const,
        })),
      };
    }
    const capture = withFrameIds([
      await captureScreen({
        directory,
        ...(input.displayId === undefined ? {} : { displayId: input.displayId }),
        ...maxEdge,
      }),
    ])[0]!;
    return {
      ok: true,
      summary: `Captured display ${capture.display.id} at ${capture.width}x${capture.height}. frameId ${capture.frameId}. Pass image-pixel x,y with this frameId to input.click (scale ${capture.scale.toFixed(3)} is applied for you).`,
      data: capture,
      media: { path: capture.path, kind: "image" },
    };
  },
};

export const screenDisplaysTool: RegisteredTool = {
  name: "screen.displays",
  description:
    "List the attached displays with their ids, sizes and positions on the virtual desktop.",
  risk: "low",
  inputSchema: z.object({}),
  async handler(): Promise<ToolResult> {
    const screens = displays();
    return {
      ok: true,
      summary: screens
        .map(
          (d) =>
            `${d.id}: ${d.width}x${d.height} at ${d.x},${d.y}${d.primary ? " (primary)" : ""}`,
        )
        .join("; "),
      data: { displays: screens },
    };
  },
};

export const screenRecordStartTool: RegisteredTool = {
  name: "screen.record.start",
  description:
    "Start recording a display to a video file. Stops on its own after five minutes. " +
    "Use screen.record.stop to finish and get the file.",
  risk: "high",
  inputSchema: z.object({
    displayId: z.number().int().optional(),
  }),
  async handler(input, ctx): Promise<ToolResult> {
    const config = await getComputerUseConfig();
    const status = await controlStatus(config.desktopControl);
    if (status.state !== "ready") {
      return { ok: false, summary: status.reason, error: status.reason };
    }
    if (isRecording()) {
      return {
        ok: false,
        summary: "A recording is already running",
        error: "Already recording",
      };
    }
    const started = await startRecording({
      directory: mediaDirectory(ctx),
      ...(input.displayId === undefined ? {} : { displayId: input.displayId }),
    });
    return {
      ok: true,
      summary: `Recording display ${started.displayId}`,
      data: started,
    };
  },
};

export const screenRecordStopTool: RegisteredTool = {
  name: "screen.record.stop",
  description:
    "Stop the running screen recording and return the video file path.",
  risk: "high",
  inputSchema: z.object({}),
  async handler(): Promise<ToolResult> {
    const recording = await stopRecording();
    return {
      ok: true,
      summary: `Recorded ${Math.round(recording.durationMs / 1000)}s`,
      data: recording,
      media: { path: recording.path, kind: "video" },
    };
  },
};

export const inputMoveTool: RegisteredTool = {
  name: "input.move",
  description:
    "Move the pointer using screenshot pixels + frameId from screen.capture.",
  risk: "high",
  inputSchema: z.object(framedPointShape),
  async handler(input): Promise<ToolResult> {
    const backend = await backendFor();
    const { point, frame, coordinateSpace } = framedPointFrom(input);
    await backend.moveTo(point, { coordinateSpace });
    return {
      ok: true,
      summary: `Pointer at ${point.x},${point.y} (frame ${frame.frameId})`,
      data: {
        ...point,
        frameId: frame.frameId,
        displayId: frame.displayId,
        coordinateSpace,
      },
    };
  },
};

export const uiElementsTool: RegisteredTool = {
  name: "ui.elements",
  description:
    "List an app window's buttons, fields and list rows by name, with their exact positions, " +
    "read from the accessibility tree. This is the accurate way to click: pass the returned " +
    "elementId to input.click instead of reading coordinates off a screenshot. " +
    "Use screen.capture to see state, ui.elements to decide where to click.",
  risk: "high",
  inputSchema: z.object({
    app: z
      .string()
      .min(1)
      .describe('App or window name to read, such as "Slack" or "Chrome"'),
  }),
  async handler(input): Promise<ToolResult> {
    const config = await getComputerUseConfig();
    const status = await controlStatus(config.desktopControl);
    if (status.state !== "ready") {
      return { ok: false, summary: status.reason, error: status.reason };
    }
    if (!uiElementsAvailable()) {
      const reason =
        process.platform === "linux"
          ? "Reading UI elements on Linux needs python3 with pyatspi and an AT-SPI bridge, which are not present. Use screen.capture with a frameId."
          : "Reading UI elements is only implemented on Windows and Linux (AT-SPI) so far. Use screen.capture with a frameId.";
      return { ok: false, summary: reason, error: reason };
    }
    const read = await readWindowElements(
      input.app,
      uiElements.nextGeneration(),
    );
    uiElements.replace(read.window, read.elements);
    if (read.elements.length === 0) {
      // Apps that draw their own widgets (KakaoTalk and friends) expose nothing
      // clickable, but the window rectangle still says where to look.
      const rect = read.window.rect;
      const reason =
        `${read.window.process} draws its own interface and exposes no named elements. ` +
        `Its window is at ${rect.x},${rect.y} sized ${rect.width}x${rect.height}. ` +
        "Take a screen.capture and click with that image's frameId instead.";
      return { ok: false, summary: reason, error: reason };
    }
    return {
      ok: true,
      summary: [
        `${read.window.process} — ${read.window.title}`,
        `window at ${read.window.rect.x},${read.window.rect.y} ${read.window.rect.width}x${read.window.rect.height}`,
        `${read.elements.length} elements. Click one with input.click { elementId }:`,
        ...read.elements.map((element) => describeElement(element)),
      ].join("\n"),
      data: { window: read.window, elements: read.elements },
    };
  },
};

/** Comparable text: case, spacing and the decoration around a name. */
function flat(text: string): string {
  return text
    .toLowerCase()
    .replace(/[#*•·]/g, "")
    .replace(/\([^)]*\)/g, "")
    .replace(/[\s_.\-]+/g, "")
    .trim();
}

/** Rows first: a channel is a list row, and the text inside it is not clickable. */
const PICK_ORDER = [
  "ListItem",
  "TreeItem",
  "MenuItem",
  "Button",
  "Hyperlink",
  "TabItem",
  "Text",
];

/**
 * Which element the person meant by that name.
 *
 * Exact beats prefix beats contains, and a short name beats a long one: the
 * row for #redrob-labs is called "redrob-labs", while the message that mentions
 * it is a paragraph. Ties go to whatever is clickable rather than to the text
 * drawn inside it.
 */
export function bestMatch(
  elements: readonly UiElement[],
  text: string,
): UiElement | null {
  const want = flat(text);
  if (!want) return null;
  let best: { element: UiElement; score: number } | null = null;
  for (const element of elements) {
    if (element.enabled === false) continue;
    const name = flat(element.name);
    if (!name) continue;
    const rank = PICK_ORDER.indexOf(element.role);
    if (rank < 0) continue;
    let score: number;
    if (name === want) score = 0;
    else if (name.startsWith(want)) score = 1_000;
    else if (name.includes(want)) score = 2_000;
    else continue;
    score += rank * 10 + Math.min(name.length - want.length, 200);
    if (!best || score < best.score) best = { element, score };
  }
  return best?.element ?? null;
}

export const uiPickTool: RegisteredTool = {
  name: "ui.pick",
  description:
    "Click the thing on screen that is called this — a channel row, a person in a search " +
    "result, a menu item — and answer with what opened. Use it instead of hunting for an " +
    "elementId after a search: it matches the name exactly, prefers the row over the text " +
    "inside it, and re-reads the window afterwards so you can see where you ended up.",
  risk: "high",
  inputSchema: z.object({
    text: z
      .string()
      .min(1)
      .describe('The name to click, as it appears: "redrob-labs", "Janghoon Lee"'),
    app: z
      .string()
      .min(1)
      .optional()
      .describe("Window to look in; defaults to the one last read"),
  }),
  async handler(input): Promise<ToolResult> {
    const config = await getComputerUseConfig();
    const status = await controlStatus(config.desktopControl);
    if (status.state !== "ready") {
      return { ok: false, summary: status.reason, error: status.reason };
    }
    const app = input.app ?? uiElements.currentWindow()?.process;
    if (!app || !uiElementsAvailable()) {
      const reason =
        "Nothing has been read yet. Call ui.elements for the app first.";
      return { ok: false, summary: reason, error: reason };
    }

    // A list of results is drawn a moment after the typing that asked for it.
    await new Promise((resolve) => setTimeout(resolve, SETTLE_MS));
    const read = await readWindowElements(app, uiElements.nextGeneration());
    uiElements.replace(read.window, read.elements);
    const target = bestMatch(read.elements, input.text);
    if (!target) {
      const near = read.elements
        .filter((item) => item.role !== "Text")
        .slice(0, 10)
        .map(describeElement)
        .join("\n");
      const reason =
        `Nothing on screen is called "${input.text}". ` +
        (near ? `What is there:\n${near}` : "The window looks empty.");
      return { ok: false, summary: reason, error: reason };
    }

    const backend = await backendFor();
    await backend.click(target.center, "left", 1, {
      coordinateSpace: "physical",
    });
    const after = await lookAfterClick();
    return {
      ok: true,
      summary: [
        `Clicked ${target.role} "${target.name}"`,
        after?.summary ?? "",
      ]
        .filter(Boolean)
        .join("\n"),
      data: {
        name: target.name,
        role: target.role,
        ...target.center,
        ...(after?.data ?? {}),
      },
    };
  },
};

export const inputClickTool: RegisteredTool = {
  name: "input.click",
  description:
    "Click an element by elementId from ui.elements (accurate), or fall back to screenshot " +
    "pixels + frameId from screen.capture when the target has no element. " +
    "Use count 2 for a double click, and button right for a context menu. " +
    "Do not invent an elementId or frameId — read or capture first.",
  risk: "high",
  inputSchema: z.object({
    ...clickTargetShape,
    button: z.enum(["left", "right", "middle"]).optional(),
    count: z.number().int().min(1).max(3).optional(),
  }),
  async handler(input): Promise<ToolResult> {
    const backend = await backendFor();
    const { point, coordinateSpace, where, data } = clickTargetFrom(input);
    const button = input.button ?? "left";
    const count = input.count ?? 1;
    await backend.click(point, button, count, { coordinateSpace });
    const did = `${count === 1 ? "Clicked" : `Clicked ${count}x`} ${button} on ${where}`;
    const after = input.elementId ? await lookAfterClick() : null;
    return {
      ok: true,
      summary: after ? `${did}\n${after.summary}` : did,
      data: { ...data, button, count, coordinateSpace, ...(after?.data ?? {}) },
    };
  },
};

/** How long the app gets to draw what the last action asked for. */
const SETTLE_MS = 350;

/**
 * What the click opened, without spending another turn to ask.
 *
 * Every click used to be followed by ui.elements - the ids had expired and the
 * model could not know what was on screen - so a search-and-open cost four
 * round trips through the model, each one seconds long. The read has to happen
 * anyway; doing it here makes it free of a turn, and the title it returns is
 * the answer to "did the right conversation open".
 */
async function lookAfterClick(): Promise<{
  summary: string;
  data: Record<string, unknown>;
} | null> {
  const process = uiElements.currentWindow()?.process;
  if (!process || !uiElementsAvailable()) return null;
  await new Promise((resolve) => setTimeout(resolve, SETTLE_MS));
  try {
    const read = await readWindowElements(process, uiElements.nextGeneration());
    uiElements.replace(read.window, read.elements);
    const fields = read.elements.filter((item) => item.role === "Edit");
    const lines = [
      `Now showing: "${read.window.title}"`,
      ...(fields.length > 0
        ? [
            "Fields here (ids are live, earlier ones have expired):",
            ...fields.slice(0, 6).map(describeElement),
          ]
        : []),
      `${read.elements.length} elements are addressable — call ui.elements for the full list.`,
    ];
    return {
      summary: lines.join("\n"),
      data: { windowTitle: read.window.title, elements: read.elements.length },
    };
  } catch {
    // The click still happened; the model can look for itself.
    return null;
  }
}

/** Long enough to fill a message, short enough that a runaway is not a novel. */
const MAX_TYPE_CHARS = 4_000;

/** Focus, clear, type, read back, and go again if the box says otherwise. */
const FILL_ATTEMPTS = 3;

/** How many candidate rows are worth naming back; a result list is long. */
const MAX_RESULT_ROWS = 8;

/**
 * Line breaks, typed the way a person makes them.
 *
 * A newline sent as a character does nothing in a chat composer - Slack wants
 * a real Return - so a formatted message arrived as one unbroken paragraph
 * with every heading and bullet run together. Shift+Enter is the break that
 * does not also send the message half-written.
 */
async function typeWithLineBreaks(
  backend: { typeText(text: string): Promise<void>; pressChord(chord: ReturnType<typeof parseChord>): Promise<void> },
  text: string,
): Promise<void> {
  const lines = text.replace(/\r\n?/g, "\n").split("\n");
  for (const [index, line] of lines.entries()) {
    if (index > 0) await backend.pressChord(parseChord("shift+enter"));
    if (line) await backend.typeText(line);
  }
}

/**
 * The rows a search just turned up.
 *
 * Whatever appeared that carries the text that was typed, minus the field it
 * was typed into. Ranked shortest first: an exact channel row is short, and
 * the message quoting the same words is long.
 */
function resultsFor(
  elements: readonly UiElement[],
  text: string,
  field: UiElement,
): UiElement[] {
  const needle = text.trim().toLowerCase();
  if (needle.length < 2) return [];
  return elements
    .filter(
      (item) =>
        item.id !== field.id &&
        item.role !== "Edit" &&
        item.name.toLowerCase().includes(needle),
    )
    .sort((a, b) => a.name.length - b.name.length)
    .slice(0, MAX_RESULT_ROWS);
}

/**
 * Put text in a field and make sure it is what the field now holds.
 *
 * Typing into whatever has focus is a guess twice over: that the right thing
 * has focus, and that it was empty. A search box that still held the last
 * query turned one attempt into `redrob-labsredrob-labs` and the run ended in
 * a report about the wrong channel. Clearing first fixes the common case;
 * reading the field back afterwards is what makes the fix knowable, and what
 * lets this try again instead of handing the problem to the model.
 */
async function fillField(
  element: UiElement,
  text: string,
  mode: "replace" | "append",
): Promise<ToolResult> {
  const backend = await backendFor();
  const process = uiElements.currentWindow()?.process ?? "";
  let seen: string | undefined;
  let matches: UiElement[] = [];

  for (let attempt = 1; attempt <= FILL_ATTEMPTS; attempt += 1) {
    await backend.click(element.center, "left", 1, {
      coordinateSpace: "physical",
    });
    if (mode === "replace") {
      await backend.pressChord(parseChord("ctrl+a"));
      await backend.pressChord(parseChord("delete"));
    }
    await typeWithLineBreaks(backend, text);

    // Nothing to check against, so the clear is all this can offer.
    if (!process || !uiElementsAvailable()) {
      return {
        ok: true,
        summary: `Typed ${text.length} characters into ${element.role} "${element.name}"`,
        data: { characters: text.length, elementId: element.id, verified: false },
      };
    }

    let after: UiElement | null = null;
    try {
      // A search draws its results a moment after the last keystroke. Reading
      // straight away sees the window as it was, which is how a run came back
      // with no rows to click and went looking for them by hand.
      await new Promise((resolve) => setTimeout(resolve, SETTLE_MS));
      // The screen has changed under the typing, so this read becomes the
      // addressable one: the ids handed back below are ids the next click can
      // use, and every id from before this call is now honestly expired.
      const read = await readWindowElements(process, uiElements.nextGeneration());
      uiElements.replace(read.window, read.elements);
      after = findByRect(read.elements, element.rect, element.role);
      matches = resultsFor(read.elements, text, element);
    } catch {
      // The window moved on or the reader failed; the typing still happened.
      return {
        ok: true,
        summary: `Typed ${text.length} characters into ${element.role} "${element.name}" (could not read it back)`,
        data: { characters: text.length, elementId: element.id, verified: false },
      };
    }

    // A field that exposes no value cannot be checked either way. Say so
    // rather than inventing a confirmation.
    //
    // Empty counts as no value: a composer that reports "" after taking a
    // paragraph is not telling us it is empty, it is not telling us anything.
    // Typing it again three times would be slow and would prove nothing.
    if (!after || !after.value) {
      return {
        ok: true,
        summary: `Typed ${text.length} characters into ${element.role} "${element.name}" (the field does not report its contents)`,
        data: { characters: text.length, elementId: element.id, verified: false },
      };
    }

    seen = after.value;
    if (fieldHolds(after.value, text, mode)) {
      // Typing a name into a search box is half the job. The run that posted
      // to the wrong channel had searched correctly and then never picked a
      // row, so the rows come back with the confirmation, with live ids.
      const rows =
        matches.length > 0
          ? `\nWhat now matches "${text}" on screen — click the exact one with input.click { elementId }, ` +
            `do not press Enter and take whichever row is highlighted:\n${matches
              .map(describeElement)
              .join("\n")}`
          : "";
      return {
        ok: true,
        summary: `${element.role} "${element.name}" now holds "${after.value}"${rows}`,
        data: {
          characters: text.length,
          elementId: element.id,
          value: after.value,
          verified: true,
          attempts: attempt,
          ...(matches.length > 0
            ? { matches: matches.map((item) => item.id) }
            : {}),
        },
      };
    }
  }

  const reason =
    `Could not get "${text}" into ${element.role} "${element.name}". ` +
    `After ${FILL_ATTEMPTS} attempts it holds "${seen ?? ""}". ` +
    "Clear it by hand (click it, ctrl+a, delete) and check with ui.elements before typing again.";
  return { ok: false, summary: reason, error: reason };
}

export const inputTypeTool: RegisteredTool = {
  name: "input.type",
  description:
    "Type text into a field. Give elementId from ui.elements and the field is focused, emptied, " +
    "filled and read back, retrying on its own until it holds exactly your text — this is the way " +
    "to fill a search box or a composer. Without elementId the text goes to whatever has focus, " +
    "unchecked, and is refused while ui.elements knows of a field you could have named. " +
    "Use input.key for Enter and for shortcuts.",
  risk: "high",
  inputSchema: z.object({
    text: z.string().min(1).max(MAX_TYPE_CHARS),
    elementId: z
      .string()
      .min(1)
      .optional()
      .describe("The field to fill, from the latest ui.elements"),
    append: z
      .boolean()
      .optional()
      .describe(
        "Keep what the field already holds. Default replaces it. Without elementId it " +
          "means type into whatever has focus on purpose.",
      ),
  }),
  async handler(input): Promise<ToolResult> {
    if (input.elementId) {
      let element: UiElement;
      try {
        element = uiElements.resolve(input.elementId);
      } catch (err) {
        if (err instanceof StaleElementError) {
          throw new UnsupportedDesktopError(err.message);
        }
        throw err;
      }
      return fillField(element, input.text, input.append ? "append" : "replace");
    }
    // Typing blind while a field list is sitting there is how text lands on
    // top of a stale query. If the fields are known, one of them has to be
    // named; the unchecked path stays for screens that expose none.
    const fields = uiElements
      .current()
      .filter((item) => item.role === "Edit" && item.enabled !== false);
    if (fields.length > 0 && !input.append) {
      const list = fields.slice(0, 8).map(describeElement).join("\n");
      const reason =
        "Say which field: input.type { elementId, text }. That empties it first and " +
        "reads it back, so nothing joins onto what is already there. Fields on screen:\n" +
        `${list}\n` +
        "If the place you are typing into is none of these, pass append: true to type " +
        "into whatever has focus - nothing is cleared or checked on that path.";
      return { ok: false, summary: "No field named", error: reason };
    }
    const backend = await backendFor();
    await backend.typeText(input.text);
    return {
      ok: true,
      summary: `Typed ${input.text.length} characters`,
      data: { characters: input.text.length, verified: false },
    };
  },
};

export const inputKeyTool: RegisteredTool = {
  name: "input.key",
  description:
    'Press a key or a shortcut, written the way it is documented: "enter", "ctrl+t", ' +
    '"cmd+shift+4", "alt+tab".',
  risk: "high",
  inputSchema: z.object({
    keys: z.string().min(1).describe("One chord, such as ctrl+t"),
  }),
  async handler(input): Promise<ToolResult> {
    const backend = await backendFor();
    const chord = parseChord(input.keys);
    await backend.pressChord(chord);
    return {
      ok: true,
      summary: `Pressed ${[...chord.modifiers, chord.key].join("+")}`,
      data: chord,
    };
  },
};

export const inputScrollTool: RegisteredTool = {
  name: "input.scroll",
  description:
    "Scroll at a screenshot point. Pass frameId + image-pixel x,y. Positive ticks scroll up, negative scroll down.",
  risk: "high",
  inputSchema: z.object({
    ...framedPointShape,
    ticks: z.number().int().min(-20).max(20),
  }),
  async handler(input): Promise<ToolResult> {
    const backend = await backendFor();
    const { point, frame, coordinateSpace } = framedPointFrom(input);
    if (input.ticks === 0) {
      return {
        ok: false,
        summary: "Zero ticks scrolls nothing",
        error: "ticks must not be 0",
      };
    }
    await backend.scroll(point, input.ticks, { coordinateSpace });
    return {
      ok: true,
      summary: `Scrolled ${input.ticks > 0 ? "up" : "down"} ${Math.abs(input.ticks)} at ${point.x},${point.y} (frame ${frame.frameId})`,
      data: {
        ...point,
        ticks: input.ticks,
        frameId: frame.frameId,
        displayId: frame.displayId,
        coordinateSpace,
      },
    };
  },
};

export const DESKTOP_TOOLS: RegisteredTool[] = [
  screenDisplaysTool,
  screenCaptureTool,
  uiElementsTool,
  screenRecordStartTool,
  screenRecordStopTool,
  inputMoveTool,
  uiPickTool,
  inputClickTool,
  inputTypeTool,
  inputKeyTool,
  inputScrollTool,
];
