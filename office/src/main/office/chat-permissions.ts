import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

/**
 * What a chat (or channel) has already been allowed to do.
 *
 * A permission answered once per call turns a six-step task into six trips to
 * a prompt, which trains people to click Approve without reading. "Always
 * allow" is scoped to that conversation/channel and written to disk so a
 * restart does not ask the same question again.
 */

export type ChatPermission = "allow_once" | "allow_always" | "deny";

const granted = new Map<string, Set<string>>();
let storePath: string | null = null;

function hydrateFromDisk(): void {
  granted.clear();
  if (!storePath) return;
  try {
    const raw = readFileSync(storePath, "utf8");
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return;
    for (const [chatId, tools] of Object.entries(
      parsed as Record<string, unknown>,
    )) {
      if (!Array.isArray(tools)) continue;
      const set = new Set<string>();
      for (const tool of tools) {
        if (typeof tool === "string" && tool.trim()) set.add(tool.trim());
      }
      if (set.size > 0) granted.set(chatId, set);
    }
  } catch {
    // Missing or corrupt file → start empty.
  }
}

function persist(): void {
  if (!storePath) return;
  const payload: Record<string, string[]> = {};
  for (const [chatId, tools] of granted) {
    payload[chatId] = [...tools].sort();
  }
  try {
    writeFileSync(storePath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
  } catch {
    // Disk full / locked — keep the in-memory grant for this run.
  }
}

/** Call once at boot with the app userData directory. */
export function configureChatPermissions(userDataPath: string): void {
  storePath = join(userDataPath, "chat-permissions.json");
  hydrateFromDisk();
}

/** True when this chat has already said yes to this tool for good. */
export function isAlwaysAllowed(chatId: string, tool: string): boolean {
  return granted.get(chatId)?.has(tool) === true;
}

export function allowAlways(chatId: string, tool: string): void {
  const id = chatId.trim();
  const name = tool.trim();
  if (!id || !name) return;
  const tools = granted.get(id) ?? new Set<string>();
  tools.add(name);
  granted.set(id, tools);
  persist();
}

/** Everything this chat has standing permission for, for showing it back. */
export function alwaysAllowedIn(chatId: string): string[] {
  return [...(granted.get(chatId) ?? [])].sort();
}

/** Takes back the standing permissions for one chat, or for all of them. */
export function revokeAlways(chatId?: string): void {
  if (chatId === undefined) granted.clear();
  else granted.delete(chatId);
  persist();
}
