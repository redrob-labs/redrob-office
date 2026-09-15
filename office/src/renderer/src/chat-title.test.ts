import { describe, expect, it } from "vitest";
import {
  deriveChatTitleFromUser,
  heuristicChatTitle,
  sanitizeGeneratedTitle,
} from "./chat-title";

describe("chat-title", () => {
  it("truncates long user text", () => {
    const title = deriveChatTitleFromUser("가".repeat(60));
    expect(title.endsWith("…")).toBe(true);
    expect(title.length).toBeLessThanOrEqual(40);
  });

  it("strips polite fillers for a shorter label", () => {
    expect(heuristicChatTitle("맥킨리라이스 알려줘")).toContain("맥킨리라이스");
    expect(heuristicChatTitle("Please summarize the Q3 hiring plan")).toMatch(/Q3|hiring/i);
  });

  it("sanitizes model titles", () => {
    expect(sanitizeGeneratedTitle('"맥킨리라이스 기업 소개"')).toBe("맥킨리라이스 기업 소개");
    expect(sanitizeGeneratedTitle("Title: Hello world")).toBe("Hello world");
  });
});
