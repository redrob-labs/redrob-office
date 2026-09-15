import type { BrowserTarget } from "../office/config.js";

export type { BrowserTarget };

/**
 * Pages always open in the person's default OS browser.
 * The in-app Electron browser target is gone.
 */
export function resolveBrowserTarget(
  _requested: string | undefined,
  _configured: BrowserTarget,
): BrowserTarget {
  return "system";
}

/**
 * What the model is told after a page went to the person's own browser.
 */
export function systemBrowserNote(url: string): string {
  return [
    `Opened ${url} in the person's default browser.`,
    "There is no in-app browser. browser.elements / browser.click / browser.type / browser.read do not apply.",
    "To drive the page, use screen.capture and ui.elements on that window, or a Chrome MCP server.",
  ].join(" ");
}
