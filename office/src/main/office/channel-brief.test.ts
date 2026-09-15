import { describe, expect, it } from "vitest";
import {
  buildChannelBrief,
  REQUEST_SOFT_CAP,
  trimRequestInstruction,
} from "./channel-brief.js";
import type { QueuedRow } from "./queue/queue.js";
import type { FloorMessage } from "./bus/types.js";

function row(
  id: string,
  message: FloorMessage,
  extras: Partial<QueuedRow> = {},
): QueuedRow {
  return {
    id,
    traceId: message.traceId,
    depth: message.depth,
    type: message.type,
    from: message.from,
    to: message.to,
    channelId: message.channelId,
    createdAt: message.createdAt,
    notBefore: message.notBefore,
    message,
    attempts: 0,
    state: "done",
    ...extras,
  };
}

describe("buildChannelBrief", () => {
  it("summarises human goals and deliveries without the current row", () => {
    const brief = buildChannelBrief(
      [
        row("h1", {
          id: "h1",
          type: "REQUEST",
          from: "floor-intake",
          to: "manager",
          origin: "human",
          saidAs: "최근 AI 모델 엑셀로 남겨놔라",
          instruction: "long intake wrapper around the goal",
          needs: [{ kind: "task", id: "goal" }],
          dueBy: 1,
          traceId: "t",
          depth: 0,
          channelId: "general",
          createdAt: 1,
          notBefore: 1,
        }),
        row("skip-me", {
          id: "skip-me",
          type: "REQUEST",
          from: "manager",
          to: "writer",
          origin: "staff",
          instruction: "current orders",
          needs: [{ kind: "task", id: "sheet", label: "sheet" }],
          dueBy: 2,
          traceId: "t",
          depth: 1,
          channelId: "general",
          createdAt: 2,
          notBefore: 2,
        }),
      ],
      "skip-me",
    );
    expect(brief).toContain("Recent channel context");
    expect(brief).toContain("최근 AI 모델 엑셀로 남겨놔라");
    expect(brief).not.toContain("current orders");
    expect(brief).not.toContain("long intake wrapper");
  });

  // Carried whole, another seat's orders read as orders to whoever is reading
  // the brief, and a turn answered the wrong assignment because of it.
  it("names another seat's assignment without repeating its orders", () => {
    const brief = buildChannelBrief([
      row("a1", {
        id: "a1",
        type: "REQUEST",
        from: "manager",
        to: "writer",
        origin: "system",
        instruction: "Post the pricing webhook to the partner endpoint.",
        needs: [{ kind: "task", id: "t1", label: "price snapshot" }],
        dueBy: 2,
        traceId: "t",
        depth: 1,
        channelId: "general",
        createdAt: 2,
        notBefore: 2,
      }),
    ]);
    expect(brief).toContain("manager asked writer for price snapshot");
    expect(brief).not.toContain("pricing webhook");
  });

  // The manager's own answers are audit events, not bus messages, so they never
  // rode in the brief. Without them a follow-up read as the person talking to
  // themselves, and the manager argued about who had asked whom.
  it("folds the seat's own answers into the thread, in time order", () => {
    const brief = buildChannelBrief(
      [
        row("h1", {
          id: "h1",
          type: "REQUEST",
          from: "floor-intake",
          to: "manager",
          origin: "human",
          saidAs: "최근에 LFM 2.5 출시됐다는데",
          instruction: "wrapper",
          needs: [{ kind: "task", id: "g" }],
          dueBy: 1,
          traceId: "t1",
          depth: 0,
          channelId: "general",
          createdAt: 10,
          notBefore: 10,
        }),
        row("h2", {
          id: "h2",
          type: "REQUEST",
          from: "floor-intake",
          to: "manager",
          origin: "human",
          saidAs: "지난주에 나온거 얘기하는거야",
          instruction: "wrapper",
          needs: [{ kind: "task", id: "g" }],
          dueBy: 1,
          traceId: "t2",
          depth: 0,
          channelId: "general",
          createdAt: 30,
          notBefore: 30,
        }),
      ],
      undefined,
      [{ createdAt: 20, role: "Manager", text: "LFM 2.5 얘기 맞나요?" }],
    );
    const lines = brief.split("\n");
    // The answer sits between the two person turns it belongs between.
    const first = lines.findIndex((line) => line.includes("최근에 LFM 2.5"));
    const answer = lines.findIndex((line) => line.includes("Manager:"));
    const second = lines.findIndex((line) => line.includes("지난주에 나온거"));
    expect(first).toBeLessThan(answer);
    expect(answer).toBeLessThan(second);
    expect(lines[answer]).toContain("Manager:");
  });
});

describe("trimRequestInstruction", () => {
  it("leaves a short assignment alone", () => {
    const result = trimRequestInstruction("@Writer 엑셀로 정리해줘.");
    expect(result.trimmed).toBe(false);
    expect(result.text).toBe("@Writer 엑셀로 정리해줘.");
  });

  it("cuts a pasted table down to the first beat", () => {
    const paste = [
      "@Writer 아래 데이터로 엑셀 만들어줘",
      "",
      "1 | GPT-5 | OpenAI | 68",
      "2 | Gemini | Google | 64",
      "3 | o3 | OpenAI | 67",
      "4 | Claude | Anthropic | -",
      "5 | Grok | xAI | 67",
      "6 | o4 | OpenAI | 65",
      "7 | DeepSeek | DeepSeek | -",
      "8 | Qwen | Alibaba | -",
    ].join("\n");
    const result = trimRequestInstruction(paste);
    expect(result.trimmed).toBe(true);
    expect(result.text.length).toBeLessThan(paste.length);
    expect(result.text).toContain("channel context");
    expect(result.text).not.toContain("DeepSeek");
  });

  it("cuts anything past the soft cap", () => {
    const wall = "goal: ship it. ".repeat(REQUEST_SOFT_CAP);
    const result = trimRequestInstruction(wall);
    expect(result.trimmed).toBe(true);
    expect(result.text.length).toBeLessThan(wall.length);
  });
});
