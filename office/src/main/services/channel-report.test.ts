import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { getChatSession, openStore, saveChatSession } from "@redrob/store";
import {
  appendChannelReport,
  transcriptIdForChannel,
  transcriptWith,
} from "./channel-report.js";
import { closeToolStore } from "../tools/tool-store.js";

const directories: string[] = [];

afterEach(() => {
  closeToolStore();
  for (const directory of directories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

function freshDir(): string {
  const directory = mkdtempSync(join(tmpdir(), "redrob-report-"));
  directories.push(directory);
  return directory;
}

describe("transcriptIdForChannel", () => {
  it("uses the room's own transcript when it exists", () => {
    const id = transcriptIdForChannel(
      [{ id: "chat-ch~general", updatedAt: "2026-08-01T00:00:00.000Z" }],
      "general",
    );
    expect(id).toBe("chat-ch~general");
  });

  it("falls back to the newest transcript the room actually opens", () => {
    const id = transcriptIdForChannel(
      [
        { id: "chat-old", updatedAt: "2026-08-01T00:00:00.000Z" },
        { id: "chat-new", updatedAt: "2026-08-09T00:00:00.000Z" },
      ],
      "general",
    );
    // Sessions from before rooms were chats all belong to #general.
    expect(id).toBe("chat-new");
  });

  it("names the room's transcript when there is nothing to fall back to", () => {
    expect(transcriptIdForChannel([], "releases")).toBe("chat-ch~releases");
  });
});

describe("transcriptWith", () => {
  it("adds one assistant message and leaves the rest alone", () => {
    const json = transcriptWith(
      JSON.stringify([{ id: "chat-1", kind: "chat", role: "user", content: "hi" }]),
      { text: "It ran.", authorId: "assistant", at: "2026-08-17T09:00:00.000Z" },
    );
    const parsed = JSON.parse(json) as Array<Record<string, unknown>>;
    expect(parsed).toHaveLength(2);
    expect(parsed[0]!.content).toBe("hi");
    expect(parsed[1]).toMatchObject({
      kind: "chat",
      role: "assistant",
      content: "It ran.",
      authorId: "assistant",
      at: "2026-08-17T09:00:00.000Z",
    });
  });

  it("starts a transcript when the stored one is unreadable", () => {
    const parsed = JSON.parse(
      transcriptWith("not json", {
        text: "It ran.",
        authorId: "assistant",
        at: "2026-08-17T09:00:00.000Z",
      }),
    ) as unknown[];
    expect(parsed).toHaveLength(1);
  });
});

describe("appendChannelReport", () => {
  it("writes into the transcript the room reads back", () => {
    const directory = freshDir();
    const { sessionId } = appendChannelReport({
      userData: directory,
      channelId: "general",
      text: "Scheduled run of “Standup nudge”\n\nAsked for standup notes.",
      title: "general",
    });
    expect(sessionId).toBe("chat-ch~general");

    // Read through a separate handle: what a fresh app launch would see.
    const store = openStore(join(directory, "redrob.sqlite"));
    const record = getChatSession(store, "chat-ch~general");
    store.close();
    expect(record?.messageCount).toBe(1);
    expect(record?.messagesJson).toContain("Standup nudge");
  });

  it("appends to a transcript that is already there instead of replacing it", () => {
    const directory = freshDir();
    const store = openStore(join(directory, "redrob.sqlite"));
    saveChatSession(store, {
      id: "chat-ch~releases",
      title: "releases",
      messagesJson: JSON.stringify([
        { id: "chat-1", kind: "chat", role: "user", content: "who watches this room" },
      ]),
    });
    store.close();

    appendChannelReport({
      userData: directory,
      channelId: "releases",
      text: "Scheduled run of “Release notes”\n\nNothing merged this week.",
    });
    appendChannelReport({
      userData: directory,
      channelId: "releases",
      text: "Scheduled run of “Release notes”\n\nTwo merges, both internal.",
    });

    const reader = openStore(join(directory, "redrob.sqlite"));
    const record = getChatSession(reader, "chat-ch~releases");
    reader.close();
    expect(record?.messageCount).toBe(3);
    expect(record?.title).toBe("releases");
    expect(record?.messagesJson).toContain("both internal");
  });
});
