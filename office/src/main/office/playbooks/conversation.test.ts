import { describe, expect, it } from "vitest";
import {
  conversationFromField,
  conversationFromTitle,
  isSearchField,
  looksLikeSearchTerm,
  wrongConversationBlock,
} from "./conversation.js";

const ASK = "redrob-labs 채널에 labs.redrob.ai 근황 정리해서 올려줘";

describe("what is open", () => {
  it("reads the conversation out of a Slack title", () => {
    expect(
      conversationFromTitle("redrob-labs (Channel) - McKinley Rice - Slack"),
    ).toBe("redrob-labs");
    expect(
      conversationFromTitle("(3) strategy_redrob-ai (Channel) - Slack"),
    ).toBe("strategy_redrob-ai");
    expect(
      conversationFromTitle("Janghoon Lee (DM) - McKinley Rice - Slack"),
    ).toBe("Janghoon Lee");
  });

  it("says nothing when the title shows no conversation", () => {
    expect(conversationFromTitle("Slack")).toBe(null);
    expect(conversationFromTitle("McKinley Rice - Slack")).toBe(null);
  });

  // A channel name typed to find the channel is then written all over the
  // window, so counting it as sent text proves a send that never happened.
  it("tells a search box from a composer", () => {
    expect(isSearchField("Search")).toBe(true);
    expect(isSearchField("검색")).toBe(true);
    expect(isSearchField("Jump to a conversation")).toBe(true);
    expect(isSearchField("Message #redrob-labs")).toBe(false);
    expect(isSearchField("")).toBe(false);
  });

  it("reads the conversation off the composer's own label", () => {
    expect(conversationFromField("Message #redrob-labs")).toBe("redrob-labs");
    expect(conversationFromField("redrob-labs에 메시지 보내기")).toBe(
      "redrob-labs",
    );
    expect(conversationFromField("Search")).toBe(null);
  });
});

describe("wrongConversationBlock", () => {
  it("holds the message back when another channel is open", () => {
    const blocked = wrongConversationBlock({
      tool: "input.type",
      text: "labs.redrob.ai 근황을 정리했습니다. Eval, Image, Studio를 공개했고",
      windowTitle: "strategy_redrob-ai (Channel) - McKinley Rice - Slack",
      instruction: ASK,
    });
    expect(blocked).toMatch(/strategy_redrob-ai/);
    expect(blocked).toMatch(/input\.click/);
  });

  it("does not read a label's parenthetical as part of the name", () => {
    expect(
      wrongConversationBlock({
        tool: "input.type",
        text: "labs.redrob.ai 근황을 정리했습니다. Eval, Image, Studio를 공개했고",
        fieldName: "Message #redrob-labs (channel)",
        instruction: ASK,
      }),
    ).toBe(null);
  });

  it("believes the composer's label over the window title", () => {
    expect(
      wrongConversationBlock({
        tool: "input.type",
        text: "labs.redrob.ai 근황을 정리했습니다. Eval, Image, Studio를 공개했고",
        fieldName: "Message #redrob-labs",
        windowTitle: "strategy_redrob-ai (Channel) - Slack",
        instruction: ASK,
      }),
    ).toBe(null);
  });

  it("lets the channel name through to the search box", () => {
    expect(
      wrongConversationBlock({
        tool: "input.type",
        text: "redrob-labs",
        windowTitle: "strategy_redrob-ai (Channel) - Slack",
        instruction: ASK,
      }),
    ).toBe(null);
    expect(looksLikeSearchTerm("redrob", "redrob-labs")).toBe(true);
    expect(looksLikeSearchTerm("근황을 정리했습니다", "redrob-labs")).toBe(false);
  });

  it("stays quiet when it cannot tell what is open", () => {
    expect(
      wrongConversationBlock({
        tool: "input.type",
        text: "긴 메시지 본문입니다 정리해서 올립니다",
        windowTitle: "Slack",
        instruction: ASK,
      }),
    ).toBe(null);
  });

  it("leaves a DM alone, where a name can be written many ways", () => {
    expect(
      wrongConversationBlock({
        tool: "input.type",
        text: "최신 온디바이스 AI 모델 뉴스 요약입니다",
        windowTitle: "Seunghyun Seok (DM) - McKinley Rice - Slack",
        instruction: "슬랙으로 석승현 부대표님한테 뉴스 요약해서 보내줘",
      }),
    ).toBe(null);
  });

  it("only guards typing", () => {
    expect(
      wrongConversationBlock({
        tool: "input.key",
        text: "enter",
        windowTitle: "strategy_redrob-ai (Channel) - Slack",
        instruction: ASK,
      }),
    ).toBe(null);
  });
});
