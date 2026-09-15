import {
  readWindowElements as readWindowsElements,
  uiElementsAvailable as windowsUiElementsAvailable,
  type UiReadResult,
} from "./ui-elements-win32.js";
import {
  linuxUiElementsAvailable,
  readLinuxWindowElements,
} from "./ui-elements-linux.js";

/**
 * One entry point for reading the accessibility tree, whichever OS we are on.
 *
 * Windows speaks UI Automation through a PowerShell host; Linux speaks AT-SPI
 * through a pyatspi reader. Both return the same shape, so the tools above do
 * not care which one answered.
 */

export type { UiReadResult };

export function uiElementsAvailable(): boolean {
  if (process.platform === "win32") return windowsUiElementsAvailable();
  if (process.platform === "linux") return linuxUiElementsAvailable();
  return false;
}

export function readWindowElements(
  match: string,
  generation: number,
  max?: number,
): Promise<UiReadResult> {
  if (process.platform === "linux") {
    return readLinuxWindowElements(match, generation, max);
  }
  return readWindowsElements(match, generation, max);
}
