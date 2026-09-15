import { describe, expect, it } from "vitest";
import type { ChatRow } from "./ChatSessionsPanel.js";

function recencyScore(row: ChatRow): number {
  if (row.updatedAt) {
    const ts =
      typeof row.updatedAt === "number"
        ? row.updatedAt
        : Date.parse(String(row.updatedAt));
    if (!Number.isNaN(ts) && ts > 0) return ts;
  }
  if (row.createdAt) {
    const ts =
      typeof row.createdAt === "number"
        ? row.createdAt
        : Date.parse(String(row.createdAt));
    if (!Number.isNaN(ts) && ts > 0) return ts;
  }
  return 0;
}

function sortChatRows(rows: ChatRow[]): ChatRow[] {
  return [...rows].sort((a, b) => {
    const scoreA = recencyScore(a);
    const scoreB = recencyScore(b);
    if (scoreA !== scoreB) return scoreB - scoreA;
    if (a.system !== b.system) return a.system ? -1 : 1;
    return a.name.localeCompare(b.name);
  });
}

describe("Chat Sessions and DMs recency sorting", () => {
  it("sorts chats with newest activity first", () => {
    const chats: ChatRow[] = [
      {
        id: "general",
        kind: "channel",
        name: "general",
        pinned: false,
        messageCount: 5,
        system: true,
        updatedAt: "2026-08-16T10:00:00.000Z",
      },
      {
        id: "project-alpha",
        kind: "channel",
        name: "project-alpha",
        pinned: false,
        messageCount: 12,
        system: false,
        updatedAt: "2026-08-16T14:30:00.000Z",
      },
      {
        id: "archive",
        kind: "channel",
        name: "archive",
        pinned: false,
        messageCount: 1,
        system: false,
        updatedAt: "2026-08-15T08:00:00.000Z",
      },
    ];

    const sorted = sortChatRows(chats);
    expect(sorted[0]?.id).toBe("project-alpha");
    expect(sorted[1]?.id).toBe("general");
    expect(sorted[2]?.id).toBe("archive");
  });

  it("floats active DMs above unmessaged DMs", () => {
    const dms: ChatRow[] = [
      {
        id: "assistant",
        kind: "dm",
        name: "Redrob",
        pinned: false,
        messageCount: 0,
        system: false,
        builtin: true,
      },
      {
        id: "designer",
        kind: "dm",
        name: "Devon Miller",
        pinned: false,
        messageCount: 4,
        system: false,
        updatedAt: "2026-08-16T15:00:00.000Z",
      },
      {
        id: "engineer",
        kind: "dm",
        name: "Alex Rivera",
        pinned: false,
        messageCount: 2,
        system: false,
        updatedAt: "2026-08-16T12:00:00.000Z",
      },
    ];

    const sorted = sortChatRows(dms);
    expect(sorted[0]?.id).toBe("designer");
    expect(sorted[1]?.id).toBe("engineer");
    expect(sorted[2]?.id).toBe("assistant");
  });
});
