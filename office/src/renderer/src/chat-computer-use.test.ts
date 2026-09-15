import { describe, expect, it } from "vitest";
import {
  answersPendingAsk,
  apologisedForDesktop,
  asksForClarification,
  claimedDesktopWork,
  isCapabilityApology,
  looksLikeComputerUse,
  mergePendingAsk,
  promisedDesktopWork,
  shouldAutoComputerUse,
} from "./chat-computer-use";

describe("pending desktop questions", () => {
  const pending = {
    instruction: "슬랙으로 보내드려 요약해서 더 짧게",
    question:
      "I can help with that. What is the name of the person you want to send the Slack message to?",
  };

  it("treats a bare name as the answer, not a new question", () => {
    // The bug: this went to chat and came back as a bio of the person.
    expect(shouldAutoComputerUse({ latest: "석승현 부대표님" })).toBe(false);
    expect(answersPendingAsk({ latest: "석승현 부대표님", pending })).toBe(
      true,
    );
  });

  it("carries the answer back into the request the run stopped on", () => {
    expect(mergePendingAsk(pending, "석승현 부대표님")).toBe(
      "슬랙으로 보내드려 요약해서 더 짧게\n받는 사람: 석승현 부대표님",
    );
  });

  it("labels a non-person answer as extra information", () => {
    expect(
      mergePendingAsk(
        { instruction: "슬랙 열어줘", question: "어떤 워크스페이스로 갈까요?" },
        "맥킨리라이스",
      ),
    ).toBe("슬랙 열어줘\n추가 정보: 맥킨리라이스");
  });

  it("lets the person back out", () => {
    expect(answersPendingAsk({ latest: "아니 됐어", pending })).toBe(false);
    expect(answersPendingAsk({ latest: "취소", pending })).toBe(false);
  });

  it("reads a fresh errand as a fresh errand", () => {
    const essay = "오늘 ".repeat(60);
    expect(answersPendingAsk({ latest: essay, pending })).toBe(false);
  });

  it("only stands when a run actually asked", () => {
    expect(answersPendingAsk({ latest: "석승현 부대표님", pending: null })).toBe(
      false,
    );
  });

  it("spots a reply that ends in a question", () => {
    expect(asksForClarification(pending.question)).toBe(true);
    expect(asksForClarification("누구에게 보낼까요?")).toBe(true);
    expect(asksForClarification("받는 분 이름을 알려주세요")).toBe(true);
    expect(asksForClarification("메시지를 보냈습니다.")).toBe(false);
  });

  it("treats offered options as a question on their own", () => {
    expect(
      asksForClarification("이 중에 누구인지 골라주세요", ["석승현", "석승현"]),
    ).toBe(true);
  });
});

describe("MCP messaging routing", () => {
  it("keeps Slack sends in chat for MCP tools", () => {
    expect(
      looksLikeComputerUse(
        "슬랙으로 janghoon한테 최신 온디바이스 AI 모델 뉴스 요약해줘",
      ),
    ).toBe(false);
    expect(looksLikeComputerUse("슬랙에서 석승현 부대표님께 공유해줘")).toBe(
      false,
    );
    expect(looksLikeComputerUse("slack to janghoon the weekly numbers")).toBe(
      false,
    );
  });

  it("keeps messaging follow-ups in chat", () => {
    expect(
      shouldAutoComputerUse({
        latest: "그걸 장훈한테 보내줘",
        priorUserTexts: ["슬랙으로 janghoon한테 최신 뉴스 요약해줘"],
      }),
    ).toBe(false);
  });

  it("leaves a plain Slack question alone", () => {
    expect(looksLikeComputerUse("슬랙 채널 목록 보여줘")).toBe(false);
  });
});

describe("posting to a channel", () => {
  it("stays in chat for an MCP integration", () => {
    expect(
      shouldAutoComputerUse({
        latest: "redrob-labs 채널에 labs.redrob.ai 근황 정리해서 올려줘",
      }),
    ).toBe(false);
    expect(shouldAutoComputerUse({ latest: "#redrob-labs 에 공유해줘" })).toBe(
      false,
    );
  });

  it("leaves a question about a channel in chat", () => {
    expect(
      shouldAutoComputerUse({ latest: "redrob-labs 채널 어제 뭐 있었어" }),
    ).toBe(false);
    expect(
      shouldAutoComputerUse({ latest: "labs.redrob.ai 근황 정리해줘" }),
    ).toBe(false);
  });
});

describe("capability apologies", () => {
  const apology =
    "죄송합니다. 현재 레드롭 오피스에서는 슬랙 메시지 전송 기능을 지원하지 않습니다. 슬랙에 직접 복사해서 보내주시면 됩니다.";

  it("does not turn a missing messaging MCP into desktop control", () => {
    expect(
      apologisedForDesktop({
        ask: "슬랙으로 janghoon한테 뉴스 요약해줘",
        reply: apology,
      }),
    ).toBe(false);
    expect(
      apologisedForDesktop({
        ask: "send this on slack to janghoon",
        reply: "I cannot directly send Slack messages. Please copy and paste it.",
      }),
    ).toBe(false);
  });

  it("does not fire on a refusal about something else", () => {
    expect(
      apologisedForDesktop({
        ask: "내일 날씨 알려줘",
        reply: "죄송합니다. 그 정보는 지원하지 않습니다.",
      }),
    ).toBe(false);
    expect(
      apologisedForDesktop({
        ask: "슬랙 켜줘",
        reply: "슬랙을 실행했습니다.",
      }),
    ).toBe(false);
  });

  it("treats a Mousepad capability refusal as desktop work", () => {
    expect(
      apologisedForDesktop({
        ask: "Open Mousepad and type exactly GATEWAY NATIVE APPROVAL OK into the editor.",
        reply:
          "It seems Mousepad is not installed or not in the system's PATH. I cannot open it.",
      }),
    ).toBe(true);
  });

  it("keeps the refusal out of what a desktop run reads", () => {
    expect(isCapabilityApology(apology)).toBe(true);
    expect(isCapabilityApology("메시지를 보냈습니다.")).toBe(false);
  });
});

describe("an ask with no verb the router knew", () => {
  const ask =
    "내 슬랙에서 redrob-labs 채널에 labs.redrob.ai 페이지 요약해서 정리해놔";

  it("keeps channel posting on the MCP path", () => {
    expect(looksLikeComputerUse(ask)).toBe(false);
    expect(
      looksLikeComputerUse("redrob-labs 채널에 회의록 남겨줘"),
    ).toBe(false);
    expect(looksLikeComputerUse("슬랙 #general 에 적어놔")).toBe(false);
  });

  it("treats a promise to do it later as not having done it", () => {
    expect(
      promisedDesktopWork({
        ask,
        reply:
          "레드롭 오피스에서 슬랙 redrob-labs 채널에 labs.redrob.ai 페이지를 요약하여 정리해 드리겠습니다. 잠시만 기다려 주십시오.",
      }),
    ).toBe(false);
    expect(
      promisedDesktopWork({
        ask: "슬랙으로 장훈한테 보내줘",
        reply: "I'll send that now.",
      }),
    ).toBe(false);
  });

  it("leaves an answer that actually answers alone", () => {
    expect(
      promisedDesktopWork({
        ask,
        reply: "labs.redrob.ai는 Eval, Image, Studio를 공개하고 있습니다.",
      }),
    ).toBe(false);
    expect(
      promisedDesktopWork({
        ask: "오늘 일정 알려줘",
        reply: "정리해 드리겠습니다. 잠시만 기다려 주십시오.",
      }),
    ).toBe(false);
  });
});

describe("claims about work chat cannot have done", () => {
  it("does not reroute MCP messaging results to desktop control", () => {
    expect(
      claimedDesktopWork({
        ask: "redrob-labs 채널에 근황 정리해서 올려줘",
        reply: "redrob-labs 채널에 근황을 정리해서 올렸습니다.",
      }),
    ).toBe(false);
    expect(
      claimedDesktopWork({
        ask: "슬랙으로 장훈한테 보내줘",
        reply: "장훈님께 메시지를 전송했습니다.",
      }),
    ).toBe(false);
    expect(
      claimedDesktopWork({
        ask: "send it on slack",
        reply: "I have sent the summary.",
      }),
    ).toBe(false);
  });

  it("leaves an answer that only drafted something alone", () => {
    expect(
      claimedDesktopWork({
        ask: "슬랙에 보낼 내용 정리해줘",
        reply: "아래 내용으로 정리했습니다. 확인해보시고 말씀해주세요.",
      }),
    ).toBe(false);
    expect(
      claimedDesktopWork({
        ask: "오늘 뉴스 정리해줘",
        reply: "정리해서 올렸습니다.",
      }),
    ).toBe(false);
  });
});

describe("chat-computer-use", () => {
  it("spots open-chrome / calendar check asks", () => {
    expect(
      looksLikeComputerUse(
        "나 구글 캘린던데 그냥 크롬 열어서 캘린다 간다음에 확인해줘",
      ),
    ).toBe(true);
    expect(looksLikeComputerUse("open chrome and check google calendar")).toBe(
      true,
    );
    expect(looksLikeComputerUse("오늘 날씨 어때")).toBe(false);
  });

  it("auto-routes follow-ups after a calendar thread", () => {
    expect(
      shouldAutoComputerUse({
        latest: "확인해줘",
        priorUserTexts: ["구글 캘린더 좀 봐줘"],
      }),
    ).toBe(true);
    expect(
      shouldAutoComputerUse({
        latest: "고마워",
        priorUserTexts: ["구글 캘린더 좀 봐줘"],
      }),
    ).toBe(false);
  });

  it("keeps Slack DM asks on the MCP path", () => {
    expect(
      looksLikeComputerUse(
        "슬랙 열어서 석승현 부대표한테 Redrob Office에서 테스트 메시지 보내줘",
      ),
    ).toBe(false);
    expect(
      looksLikeComputerUse("Open Slack and DM Janghoon a short hello"),
    ).toBe(false);
    expect(looksLikeComputerUse("슬랙 채널 목록 알려줘")).toBe(false);
  });

  it("keeps Slack send follow-ups on the MCP path", () => {
    expect(
      shouldAutoComputerUse({
        latest: "석승현한테도 보내",
        priorUserTexts: [
          "슬랙 열어서 이장훈한테 테스트 메시지 보내줘",
        ],
      }),
    ).toBe(false);
  });
});

