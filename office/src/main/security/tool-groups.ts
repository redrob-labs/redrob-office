import type { ToolGroup } from "./types.js";

export type ToolGroupId = ToolGroup | "group:doc";

const TOOL_GROUPS: Record<string, ToolGroupId> = {
  "fs.read": "group:fs",
  "fs.write": "group:fs",
  "fs.list": "group:fs",
  apply_patch: "group:fs",
  "fs.patch.undo": "group:fs",
  "shell.exec": "group:runtime",
  "app.launch": "group:ui",
  "app.focus": "group:ui",
  // Seeing and driving the desktop is the ui group, because it is the same
  // reach: outside this app's own window, onto whatever is there.
  "screen.displays": "group:ui",
  "screen.capture": "group:ui",
  "ui.elements": "group:ui",
  "ui.pick": "group:ui",
  "screen.record.start": "group:ui",
  "screen.record.stop": "group:ui",
  "input.move": "group:ui",
  "input.click": "group:ui",
  "input.type": "group:ui",
  "input.key": "group:ui",
  "input.scroll": "group:ui",
  "web.search": "group:web",
  "web.fetch": "group:web",
  "net.httpPost": "group:network",
  "memory.manage": "group:automation",
  "settings.update": "group:automation",
  // Workspace retrieval and explicitly approved independent agent runs.
  "workspace.search": "group:automation",
  "agents.delegate": "group:automation",
  "browser.open": "group:web",
  "browser.elements": "group:web",
  "browser.read": "group:web",
  "browser.click": "group:web",
  "browser.type": "group:web",
  "browser.scroll": "group:web",
  "browser.back": "group:web",
  "browser.waitFor": "group:web",
  "browser.close": "group:web",
  "doc.create": "group:doc",
  "doc.open": "group:doc",
  "doc.outline": "group:doc",
  "doc.readRange": "group:doc",
  "doc.search": "group:doc",
  "doc.close": "group:doc",
  "doc.undo": "group:doc",
  "doc.preview": "group:doc",
  "sheet.writeRange": "group:doc",
  "sheet.addFormula": "group:doc",
  "sheet.sort": "group:doc",
  "sheet.insertRows": "group:doc",
  "sheet.chart": "group:doc",
  "doc.findReplace": "group:doc",
  "doc.insertSection": "group:doc",
  "doc.applyStyle": "group:doc",
  "slide.add": "group:doc",
  "slide.setText": "group:doc",
  "slide.insertImage": "group:doc",
  "slide.reorder": "group:doc",
};

export function toolGroupOf(toolName: string): ToolGroupId {
  if (toolName.startsWith("mcp__")) return "group:network";
  return TOOL_GROUPS[toolName] ?? "group:automation";
}

export function toolsInGroup(group: ToolGroupId): string[] {
  return Object.entries(TOOL_GROUPS)
    .filter(([, g]) => g === group)
    .map(([name]) => name);
}

export const DOC_WRITE_TOOLS = new Set([
  "sheet.writeRange",
  "sheet.addFormula",
  "sheet.sort",
  "sheet.insertRows",
  "sheet.chart",
  "doc.findReplace",
  "doc.insertSection",
  "doc.applyStyle",
  "doc.undo",
  "slide.add",
  "slide.setText",
  "slide.insertImage",
  "slide.reorder",
]);

export const DOC_READ_TOOLS = new Set([
  "doc.open",
  "doc.outline",
  "doc.readRange",
  "doc.search",
  "doc.close",
  "doc.preview",
]);

/**
 * Tools a person always signs off on: they leave the machine, or they drive
 * another application that can publish or send on our behalf.
 */
export const APPROVAL_REQUIRED_TOOLS = new Set<string>([
  "net.httpPost",
  "app.launch",
  "app.focus",
  // Every one of these acts on the desktop rather than in this app, so none of
  // them may happen without a person saying so.
  "screen.capture",
  "ui.elements",
  "ui.pick",
  "screen.record.start",
  "screen.record.stop",
  "input.move",
  "input.click",
  "input.type",
  "input.key",
  "input.scroll",
]);

export { TOOL_GROUPS };
