import { describe, expect, it } from "vitest";
import {
  mentionTarget,
  resolveRecipient,
  stickyFromHistory,
} from "../channels/routing.js";

describe("channel routing", () => {
  const names = new Map([
    ["assistant", "Assistant"],
    ["researcher", "Researcher"],
    ["writer", "Writer"],
  ]);

  it("sends a one-member room to chat when the member is the assistant", () => {
    const routed = resolveRecipient({
      text: "hello",
      memberIds: ["assistant"],
      defaultMemberId: "assistant",
      namesById: names,
    });
    expect(routed).toEqual({ to: "assistant", viaChat: true });
  });

  it("routes an @mention to that teammate without using chat.ts", () => {
    const routed = resolveRecipient({
      text: "@researcher find this",
      memberIds: ["assistant", "researcher"],
      defaultMemberId: "assistant",
      namesById: names,
    });
    expect(routed).toEqual({ to: "researcher", viaChat: false });
  });

  // #general holds the whole workspace, so the assistant is almost never alone
  // in it. It still has no seat on the floor, so it still answers from chat.
  it("keeps the assistant on the chat path in a crowded room", () => {
    const routed = resolveRecipient({
      text: "hello",
      memberIds: ["assistant", "writer"],
      defaultMemberId: "assistant",
      namesById: names,
    });
    expect(routed).toEqual({ to: "assistant", viaChat: true });
  });

  it("falls back to the default member in a multi-member room", () => {
    const routed = resolveRecipient({
      text: "draft the plan",
      memberIds: ["assistant", "writer"],
      defaultMemberId: "writer",
      namesById: names,
    });
    expect(routed).toEqual({ to: "writer", viaChat: false });
  });

  it("matches mention names case-insensitively", () => {
    expect(
      mentionTarget("@Writer please", ["writer"], names),
    ).toBe("writer");
  });

  // The composer drops a name wherever the cursor is, so "이거 @writer 에게" has
  // to reach the writer as surely as a name typed at the front does.
  it("finds a name in the middle of a sentence", () => {
    expect(
      mentionTarget("이 초안 @writer 한번 봐줘", ["assistant", "writer"], names),
    ).toBe("writer");
    const routed = resolveRecipient({
      text: "이 초안 @writer 한번 봐줘",
      memberIds: ["assistant", "writer"],
      defaultMemberId: "assistant",
      namesById: names,
    });
    expect(routed).toEqual({ to: "writer", viaChat: false });
  });

  it("leaves an unknown handle as ordinary text", () => {
    expect(mentionTarget("mail me at a@b.com", ["writer"], names)).toBeNull();
  });

  // People call a teammate by name without reaching for @: after someone is
  // invited into #general, "장훈아 뭐하냐" has to land on 이장훈, not on Redrob
  // explaining that it is not 장훈.
  it("routes a bare Korean call to the teammate being spoken to", () => {
    const hangul = new Map([
      ["assistant", "Redrob"],
      ["lee-jh", "이장훈"],
    ]);
    expect(
      mentionTarget("장훈아 뭐하냐", ["assistant", "lee-jh"], hangul),
    ).toBe("lee-jh");
    expect(
      resolveRecipient({
        text: "장훈아 뭐하냐",
        memberIds: ["assistant", "lee-jh"],
        defaultMemberId: "assistant",
        namesById: hangul,
      }),
    ).toEqual({ to: "lee-jh", viaChat: false });
  });

  it("still leaves an ordinary line for the default member", () => {
    const hangul = new Map([
      ["assistant", "Redrob"],
      ["lee-jh", "이장훈"],
    ]);
    expect(
      resolveRecipient({
        text: "오늘 할 일 정리해줘",
        memberIds: ["assistant", "lee-jh"],
        defaultMemberId: "assistant",
        namesById: hangul,
      }),
    ).toEqual({ to: "assistant", viaChat: true });
  });

  // After @이장훈, a plain follow-up keeps talking to them — otherwise every
  // "응" / "그거 해" snaps back to Redrob and the thread dies.
  it("keeps a sticky teammate on a plain follow-up", () => {
    const hangul = new Map([
      ["assistant", "Redrob"],
      ["lee-jh", "이장훈"],
    ]);
    expect(
      resolveRecipient({
        text: "응 그거 해",
        memberIds: ["assistant", "lee-jh"],
        defaultMemberId: "assistant",
        namesById: hangul,
        stickyMemberId: "lee-jh",
      }),
    ).toEqual({ to: "lee-jh", viaChat: false });
  });

  it("lets an @mention break the sticky thread", () => {
    const hangul = new Map([
      ["assistant", "Redrob"],
      ["lee-jh", "이장훈"],
    ]);
    expect(
      resolveRecipient({
        text: "@assistant 이거 네가 해",
        memberIds: ["assistant", "lee-jh"],
        defaultMemberId: "assistant",
        namesById: hangul,
        stickyMemberId: "lee-jh",
      }),
    ).toEqual({ to: "assistant", viaChat: true });
  });

  // The chat path asks prepareChannelSend first; without sticky there, a plain
  // "너 뭐하냐" was classified as viaChat and never reached say().
  it("sticky beats the default even when the default is the assistant", () => {
    const hangul = new Map([
      ["assistant", "Redrob"],
      ["lee-jh", "이장훈"],
    ]);
    expect(
      resolveRecipient({
        text: "너 뭐하냐",
        memberIds: ["assistant", "lee-jh"],
        defaultMemberId: "assistant",
        namesById: hangul,
        stickyMemberId: "lee-jh",
      }),
    ).toEqual({ to: "lee-jh", viaChat: false });
  });

  it("recovers sticky from the last teammate event after a restart", () => {
    expect(
      stickyFromHistory(
        [
          {
            id: "1",
            channelId: "general",
            authorId: "human",
            type: "message",
            payload: {},
            ts: 1,
          },
          {
            id: "2",
            channelId: "general",
            authorId: "lee-jh",
            type: "progress",
            payload: { tool: "app.launch" },
            ts: 2,
          },
          {
            id: "3",
            channelId: "general",
            authorId: "human",
            type: "message",
            payload: {},
            ts: 3,
          },
        ],
        ["assistant", "lee-jh"],
      ),
    ).toBe("lee-jh");
  });
});
