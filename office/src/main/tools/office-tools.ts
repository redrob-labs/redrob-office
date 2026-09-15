import { z } from "zod";
import {
  addMemory,
  deleteMemory,
  listMemories,
  updateMemory,
} from "@redrob/store";
import { loadSetupState, saveLlmSettings } from "../services/setup.js";
import { closeToolStore, toolStore } from "./tool-store.js";
import type { RegisteredTool, ToolResult } from "./types.js";

/**
 * The app's own state, as tools the assistant can drive from the chat box.
 *
 * These do not touch the machine or leave it, so they sit in group:automation
 * and skip the desktop approval path: a person asking "remember that I prefer
 * short replies" or "switch me to Pro" has already consented by asking. What
 * keeps them safe is their narrowness — memory is free text the user can see
 * and delete in Settings, and the settings tool exposes only the four
 * user-facing model toggles, never the security profile or allow-lists.
 */

/** Test-only: drop the cached handle so a temp dir is not held open. */
export function __closeOfficeToolStore(): void {
  closeToolStore();
}

export const memoryManageTool: RegisteredTool = {
  name: "memory.manage",
  description:
    "Manage the things the assistant remembers about the user (the same list shown in " +
    "Settings → Memory). action=list returns them; action=add stores a new fact from `body`; " +
    "action=update rewrites the memory with `id` to `body`; action=delete removes the memory " +
    "with `id`. Use it when the user asks to remember, change, or forget a fact about them.",
  risk: "high",
  inputSchema: z.object({
    action: z.enum(["list", "add", "update", "delete"]),
    body: z
      .string()
      .max(2000)
      .optional()
      .describe("The memory text, for add and update"),
    id: z
      .string()
      .optional()
      .describe("The memory id, for update and delete (get it from action=list)"),
  }),
  async handler(input, ctx): Promise<ToolResult> {
    const store = toolStore(ctx.userDataPath);
    try {
      if (input.action === "list") {
        const memories = listMemories(store);
        return {
          ok: true,
          summary:
            memories.length === 0
              ? "No memories are stored yet."
              : `${memories.length} memories:\n` +
                memories.map((m) => `- (${m.id}) ${m.body}`).join("\n"),
          data: { memories },
        };
      }
      if (input.action === "add") {
        const body = input.body?.trim();
        if (!body) {
          return { ok: false, summary: "add needs a body", error: "Missing body" };
        }
        const memory = addMemory(store, { body, source: "manual" });
        return {
          ok: true,
          summary: `Remembered: "${memory.body}" (${memory.id})`,
          data: { memory },
        };
      }
      if (input.action === "update") {
        if (!input.id || !input.body?.trim()) {
          return {
            ok: false,
            summary: "update needs id and body",
            error: "Missing id or body",
          };
        }
        const memory = updateMemory(store, input.id, input.body.trim());
        if (!memory) {
          return {
            ok: false,
            summary: `No memory with id ${input.id}`,
            error: "Not found",
          };
        }
        return {
          ok: true,
          summary: `Updated ${memory.id}: "${memory.body}"`,
          data: { memory },
        };
      }
      // delete
      if (!input.id) {
        return { ok: false, summary: "delete needs an id", error: "Missing id" };
      }
      const removed = deleteMemory(store, input.id);
      return removed
        ? { ok: true, summary: `Deleted memory ${input.id}`, data: { id: input.id } }
        : {
            ok: false,
            summary: `No memory with id ${input.id}`,
            error: "Not found",
          };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return { ok: false, summary: `Memory action failed: ${message}`, error: message };
    }
  },
};

export const settingsUpdateTool: RegisteredTool = {
  name: "settings.update",
  description:
    "Read or change the user-facing Redrob Office model settings (Settings → Models). " +
    "Call with no fields to read the current values. Provide webSearchEnabled (bool) to change it. " +
    "It cannot touch API keys, allowed folders, the computer-use security profile, or exec settings.",
  risk: "high",
  inputSchema: z.object({
    webSearchEnabled: z.boolean().optional(),
  }),
  async handler(input, ctx): Promise<ToolResult> {
    const summarize = (s: {
      inferenceRoute: string;
      webSearchEnabled: boolean;
    }): string => `route=${s.inferenceRoute}, webSearch=${s.webSearchEnabled}`;

    const patch: Parameters<typeof saveLlmSettings>[1] = {};
    if (input.webSearchEnabled !== undefined)
      patch.webSearchEnabled = input.webSearchEnabled;

    try {
      if (Object.keys(patch).length === 0) {
        const state = await loadSetupState(ctx.userDataPath);
        return {
          ok: true,
          summary: `Current settings: ${summarize(state)}`,
          data: {
            inferenceRoute: state.inferenceRoute,
            webSearchEnabled: state.webSearchEnabled,
          },
        };
      }
      const next = await saveLlmSettings(ctx.userDataPath, patch);
      return {
        ok: true,
        summary: `Settings updated. Now: ${summarize(next)}`,
        data: {
          inferenceRoute: next.inferenceRoute,
          webSearchEnabled: next.webSearchEnabled,
        },
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return { ok: false, summary: `Settings update failed: ${message}`, error: message };
    }
  },
};

export const OFFICE_TOOLS: RegisteredTool[] = [memoryManageTool, settingsUpdateTool];
