import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  autotitleChatSession,
  deleteChatSession,
  getChatSession,
  listChatSessions,
  openStore,
  renameChatSession,
  requiredStoreTables,
  saveChatSession,
  setChatSessionPinned,
} from "./index.js";

describe("requiredStoreTables", () => {
  it("includes chat_sessions", () => {
    expect(requiredStoreTables()).toContain("chat_sessions");
  });
});

describe("chat_sessions", () => {
  it("saves, lists, loads, renames, pins, and deletes transcripts", () => {
    const directory = mkdtempSync(join(tmpdir(), "redrob-store-chat-"));
    const store = openStore(join(directory, "store.sqlite"));
    try {
      const messages = [
        { id: "u-1", kind: "chat", role: "user", content: "Hello" },
        { id: "a-1", kind: "chat", role: "assistant", content: "Hi" },
      ];
      const saved = saveChatSession(store, {
        id: "chat-abc",
        title: "Hello",
        messagesJson: JSON.stringify(messages),
      });
      expect(saved.messageCount).toBe(2);
      expect(saved.title).toBe("Hello");
      expect(saved.pinned).toBe(false);

      const renamed = renameChatSession(store, "chat-abc", "Hiring notes");
      expect(renamed?.title).toBe("Hiring notes");
      expect(renamed?.titleLocked).toBe(true);

      // Auto title from first message must not overwrite a locked rename.
      saveChatSession(store, {
        id: "chat-abc",
        title: "Hello",
        messagesJson: JSON.stringify(messages),
      });
      expect(getChatSession(store, "chat-abc")?.title).toBe("Hiring notes");

      const pinned = setChatSessionPinned(store, "chat-abc", true);
      expect(pinned?.pinned).toBe(true);

      saveChatSession(store, {
        id: "chat-xyz",
        title: "Later",
        messagesJson: JSON.stringify([{ id: "u-1", kind: "chat", role: "user", content: "x" }]),
      });
      const listed = listChatSessions(store);
      expect(listed[0]?.id).toBe("chat-abc");
      expect(listed[0]?.pinned).toBe(true);

      expect(deleteChatSession(store, "chat-abc")).toBe(true);
      expect(listChatSessions(store)).toHaveLength(1);
    } finally {
      store.close();
      rmSync(directory, { recursive: true, force: true });
    }
  });

  it("does not bump updatedAt when the transcript is unchanged", () => {
    const directory = mkdtempSync(join(tmpdir(), "redrob-store-chat-noop-"));
    const store = openStore(join(directory, "store.sqlite"));
    try {
      const messages = JSON.stringify([
        { id: "u-1", kind: "chat", role: "user", content: "Hello" },
      ]);
      const first = saveChatSession(store, {
        id: "chat-noop",
        title: "Hello",
        messagesJson: messages,
      });
      const again = saveChatSession(store, {
        id: "chat-noop",
        title: "Hello",
        messagesJson: messages,
      });
      expect(again.updatedAt).toBe(first.updatedAt);
      expect(getChatSession(store, "chat-noop")?.updatedAt).toBe(first.updatedAt);
    } finally {
      store.close();
      rmSync(directory, { recursive: true, force: true });
    }
  });

  it("autotitle sets a title without locking, and a rename wins over it", () => {
    const directory = mkdtempSync(join(tmpdir(), "redrob-store-autotitle-"));
    const store = openStore(join(directory, "db.sqlite"));
    try {
      const msgs = JSON.stringify([
        { id: "u-1", kind: "chat", role: "user", content: "hi" },
      ]);
      saveChatSession(store, { id: "c1", title: "hi", messagesJson: msgs });

      // Auto title updates the title but does NOT lock it.
      const titled = autotitleChatSession(store, "c1", "Weather in Seoul");
      expect(titled?.title).toBe("Weather in Seoul");
      expect(titled?.titleLocked).toBe(false);

      // A plain save no longer clobbers the auto title.
      saveChatSession(store, { id: "c1", title: "hi", messagesJson: msgs });
      expect(getChatSession(store, "c1")?.title).toBe("Weather in Seoul");

      // A user rename locks; auto title must not override it after that.
      renameChatSession(store, "c1", "My thread");
      const blocked = autotitleChatSession(store, "c1", "Something else");
      expect(blocked?.title).toBe("My thread");
      expect(getChatSession(store, "c1")?.title).toBe("My thread");
      expect(getChatSession(store, "c1")?.titleLocked).toBe(true);
    } finally {
      store.close();
      rmSync(directory, { recursive: true, force: true });
    }
  });
});
