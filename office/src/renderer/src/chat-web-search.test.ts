import { describe, expect, it } from "vitest";
import {
  isSearchDirective,
  isVagueFollowUp,
  needsLiveFacts,
  priorTopicFromHistory,
  resolveWebSearchQuery,
  shouldAutoWebSearch,
} from "./chat-web-search";

describe("chat-web-search", () => {
  it("treats typos and search-only lines as directives", () => {
    expect(isSearchDirective("검색해서 알려줘")).toBe(true);
    expect(isSearchDirective("검새해서 알려줘")).toBe(true);
    expect(isSearchDirective("찾아봐")).toBe(true);
    expect(isSearchDirective("맥킨리라이스 요즘 뭐해?")).toBe(false);
  });

  it("detects live-fact questions like 요즘 뭐해", () => {
    expect(needsLiveFacts("맥킨리라이스 요즘 뭐해?")).toBe(true);
    expect(needsLiveFacts("채용 메일 초안 써 줘")).toBe(false);
  });

  it("resolves follow-up search to the prior topic", () => {
    const prior = ["맥킨리라이스 요즘 뭐해?", "회사야"];
    expect(resolveWebSearchQuery("검색해서 알려줘", prior)).toMatch(/맥킨리라이스/);
    expect(resolveWebSearchQuery("검색해서 알려줘", prior)).not.toMatch(/^검색/);
    expect(resolveWebSearchQuery("회사야", ["맥킨리라이스 요즘 뭐해?"])).toMatch(
      /맥킨리라이스/,
    );
    expect(resolveWebSearchQuery("맥킨리라이스 회사 검색해서 알려줘", [])).toMatch(
      /맥킨리라이스/,
    );
    expect(resolveWebSearchQuery("맥킨리라이스 회사 검색해서 알려줘", [])).not.toMatch(
      /검색해서/,
    );
  });

  it("auto-searches on first ask and on post-ignorance follow-ups", () => {
    expect(
      shouldAutoWebSearch({
        latest: "맥킨리라이스 요즘 뭐해?",
        priorUserTexts: [],
        webSearchEnabled: true,
      }),
    ).toBe(true);

    expect(
      shouldAutoWebSearch({
        latest: "검색해서 알려줘",
        priorUserTexts: ["맥킨리라이스 요즘 뭐해?"],
        lastAssistantText: "저는 맥킨리라이스에 대한 정보를 가지고 있지 않습니다.",
        webSearchEnabled: true,
      }),
    ).toBe(true);

    expect(
      shouldAutoWebSearch({
        latest: "회사야",
        priorUserTexts: ["맥킨리라이스 요즘 뭐해?"],
        webSearchEnabled: true,
      }),
    ).toBe(true);

    expect(priorTopicFromHistory(["맥킨리라이스 요즘 뭐해?", "검색해서 알려줘"])).toBe(
      "맥킨리라이스",
    );
  });

  it("defaults Korean weather/time queries to Seoul", () => {
    expect(resolveWebSearchQuery("와 지금 날씨 너무 더운데 몇시냐", [])).toMatch(
      /^서울 /,
    );
    expect(resolveWebSearchQuery("서울 날씨", [])).toMatch(/^서울/);
    expect(resolveWebSearchQuery("부산 날씨 어때", [])).not.toMatch(/^서울 /);
  });
});
