import { z } from "zod";
import { openUrlInBackground } from "./app-tools.js";
import { systemBrowserNote } from "./browser-target.js";
import { isSafeBrowserUrl } from "../services/browser-session.js";
import type { RegisteredTool, ToolResult } from "./types.js";

/**
 * Web pages open in the person's default OS browser only.
 *
 * The old in-app Electron "Redrob Browser" is gone: it confused people who
 * asked to open a link and got a second Chromium window inside the app.
 * Element-level drive tools still exist as stubs so older prompts fail with a
 * clear message instead of hanging on a missing window.
 */

const IN_APP_BROWSER_GONE =
  "The in-app browser was removed. Pages open in the person's default browser only. " +
  "Call browser.open to open a URL there. To drive the page, use screen.capture / ui.elements " +
  "on that window, or connect a Chrome MCP server.";

export const browserOpenTool: RegisteredTool = {
  name: "browser.open",
  description:
    "Open an https:// page in the person's default system browser. " +
    "The agent cannot read that window through browser.elements / browser.click. " +
    "Use this when the person asks to open a link or look at a page themselves.",
  risk: "high",
  inputSchema: z.object({
    url: z.string().url().describe("Absolute https:// URL"),
    target: z
      .enum(["app", "system"])
      .optional()
      .describe("Ignored; pages always open in the system browser"),
  }),
  async handler(input, ctx): Promise<ToolResult> {
    if (!isSafeBrowserUrl(input.url)) {
      const error =
        "Only public https:// URLs are allowed (private, loopback and metadata hosts are blocked).";
      return { ok: false, summary: error, error };
    }
    const opened = await openUrlInBackground(input.url, ctx.signal);
    if (!opened.ok) {
      return {
        ok: false,
        summary: `Could not open browser: ${opened.error}`,
        error: opened.error,
      };
    }
    return {
      ok: true,
      summary: systemBrowserNote(input.url),
      data: { url: input.url, target: "system" as const },
    };
  },
};

function goneResult(): ToolResult {
  return { ok: false, summary: IN_APP_BROWSER_GONE, error: IN_APP_BROWSER_GONE };
}

export const browserElementsTool: RegisteredTool = {
  name: "browser.elements",
  description:
    "Deprecated: the in-app browser was removed. Opens no longer create a readable page.",
  risk: "low",
  inputSchema: z.object({}),
  async handler(): Promise<ToolResult> {
    return goneResult();
  },
};

export const browserClickTool: RegisteredTool = {
  name: "browser.click",
  description:
    "Deprecated: the in-app browser was removed. Use screen.capture / ui.elements on the system browser, or a Chrome MCP server.",
  risk: "high",
  inputSchema: z.object({
    mark: z.number().int().positive().describe("Unused"),
  }),
  async handler(): Promise<ToolResult> {
    return goneResult();
  },
};

export const browserTypeTool: RegisteredTool = {
  name: "browser.type",
  description:
    "Deprecated: the in-app browser was removed. Use input.type on the system browser after screen.capture / ui.elements, or a Chrome MCP server.",
  risk: "high",
  inputSchema: z.object({
    mark: z.number().int().positive().describe("Unused"),
    text: z.string().describe("Unused"),
    submit: z.boolean().optional(),
  }),
  async handler(): Promise<ToolResult> {
    return goneResult();
  },
};

export const browserScrollTool: RegisteredTool = {
  name: "browser.scroll",
  description: "Deprecated: the in-app browser was removed.",
  risk: "low",
  inputSchema: z.object({
    direction: z.enum(["up", "down"]).optional(),
    amount: z.number().optional(),
  }),
  async handler(): Promise<ToolResult> {
    return goneResult();
  },
};

export const browserBackTool: RegisteredTool = {
  name: "browser.back",
  description: "Deprecated: the in-app browser was removed.",
  risk: "low",
  inputSchema: z.object({}),
  async handler(): Promise<ToolResult> {
    return goneResult();
  },
};

export const browserWaitForTool: RegisteredTool = {
  name: "browser.waitFor",
  description: "Deprecated: the in-app browser was removed.",
  risk: "low",
  inputSchema: z.object({
    text: z.string().optional(),
    timeoutMs: z.number().optional(),
  }),
  async handler(): Promise<ToolResult> {
    return goneResult();
  },
};

export const browserReadTool: RegisteredTool = {
  name: "browser.read",
  description: "Deprecated: the in-app browser was removed.",
  risk: "low",
  inputSchema: z.object({}),
  async handler(): Promise<ToolResult> {
    return goneResult();
  },
};

export const browserCloseTool: RegisteredTool = {
  name: "browser.close",
  description: "Deprecated: the in-app browser was removed. No-op.",
  risk: "low",
  inputSchema: z.object({}),
  async handler(): Promise<ToolResult> {
    return {
      ok: true,
      summary: "No in-app browser is open.",
    };
  },
};

export const BROWSER_TOOLS: RegisteredTool[] = [
  browserOpenTool,
  browserElementsTool,
  browserClickTool,
  browserTypeTool,
  browserScrollTool,
  browserBackTool,
  browserWaitForTool,
  browserReadTool,
  browserCloseTool,
];
