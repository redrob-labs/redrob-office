import { describe, expect, it } from "vitest";
import {
  claimsSendSuccess,
  claimsWork,
  deniesSendSuccess,
  gateSendClaim,
  hasPostSendLook,
  isSendAsk,
  endedWithoutDoing,
  unverifiedSendReply,
} from "./send-verify.js";
import type { SendProof } from "./send-proof.js";

describe("send-verify", () => {
  it("spots success claims", () => {
    expect(
      claimsSendSuccess('"안녕하세요" 메시지가 성공적으로 전송되었습니다.'),
    ).toBe(true);
    expect(claimsSendSuccess("The message was sent successfully.")).toBe(true);
    expect(claimsSendSuccess("슬랙을 열었습니다.")).toBe(false);
  });

  // Posting to a channel is said differently, and none of it used to count.
  it("spots the words used for posting, not only for sending", () => {
    expect(claimsSendSuccess("redrob-labs 채널에 올렸습니다.")).toBe(true);
    expect(claimsSendSuccess("근황 정리해서 공유드렸습니다.")).toBe(true);
    expect(claimsSendSuccess("메시지를 전송했습니다.")).toBe(true);
    expect(claimsSendSuccess("Posted it to the channel.")).toBe(true);
  });

  it("hears an answer that owns up", () => {
    expect(deniesSendSuccess("전송을 확인하지 못했습니다.")).toBe(true);
    expect(deniesSendSuccess("채널을 찾지 못했어요.")).toBe(true);
    expect(deniesSendSuccess("어느 채널로 보낼까요?")).toBe(true);
    expect(deniesSendSuccess("올렸습니다.")).toBe(false);
  });

  // The list of ways to say "done" can never be complete, so a run that typed
  // into the app and then said anything but "I could not" is a claim.
  it("treats a summary after typing as a claim of having done it", () => {
    const ask = "redrob-labs 채널에 근황 정리해서 올려줘";
    expect(
      claimsWork({
        instruction: ask,
        text: "labs.redrob.ai 근황입니다. Eval, Image, Studio를 공개했고 Series A를 마쳤습니다.",
        toolTrace: ["app.focus", "ui.elements", "input.type", "input.key"],
      }),
    ).toBe(true);
    expect(
      claimsWork({
        instruction: ask,
        text: "채널을 찾지 못해서 올리지 못했습니다.",
        toolTrace: ["app.focus", "input.type"],
      }),
    ).toBe(false);
    // Nothing was typed, so there is nothing to have got wrong here.
    expect(
      claimsWork({
        instruction: ask,
        text: "근황을 정리해봤습니다.",
        toolTrace: ["web.search"],
      }),
    ).toBe(false);
    // Reading is not sending, even when the word 메시지 is in the ask.
    expect(
      claimsWork({
        instruction: "슬랙 메시지 뭐 왔는지 읽어줘",
        text: "장훈님이 회의 시간을 물어보셨습니다.",
        toolTrace: ["app.focus", "input.type", "ui.elements"],
      }),
    ).toBe(false);
  });

  it("takes a look after sending, by elements or by screenshot", () => {
    expect(
      hasPostSendLook([
        "screen.capture",
        "input.click",
        "input.type",
        "input.key",
      ]),
    ).toBe(false);
    expect(hasPostSendLook(["input.type", "input.key", "screen.capture"])).toBe(
      true,
    );
    expect(hasPostSendLook(["input.type", "input.key", "ui.elements"])).toBe(
      true,
    );
  });

  // "정리해놔" is a post with no posting word in it, so the whole gate sat out
  // the turn that promised to do it later.
  it("counts leaving something in a channel as a send ask", () => {
    expect(
      isSendAsk("내 슬랙에서 redrob-labs 채널에 페이지 요약해서 정리해놔"),
    ).toBe(true);
    expect(isSendAsk("회의록 남겨줘")).toBe(true);
  });

  it("catches a turn that ends on 잠시만 기다려 주십시오", () => {
    expect(
      endedWithoutDoing({
        instruction: "redrob-labs 채널에 요약해서 정리해놔",
        text: "요약하여 정리해 드리겠습니다. 잠시만 기다려 주십시오.",
        toolTrace: ["web.search"],
      }),
    ).toBe(true);
  });

  it("covers send asks outside Slack too", () => {
    expect(isSendAsk("카톡으로 안녕하세요 보내줘")).toBe(true);
    expect(isSendAsk("Type this into the form and submit")).toBe(true);
    expect(isSendAsk("redrob-labs 채널에 근황 정리해서 올려줘")).toBe(true);
    expect(isSendAsk("오늘 날씨 알려줘")).toBe(false);
  });
});

describe("endedWithoutDoing", () => {
  const ask = "redrob-labs 채널에 labs.redrob.ai 근황 정리해서 올려줘";

  // The whole turn: research, a summary, and "이제 보내드리겠습니다" as the last
  // sentence of a run that is over.
  it("catches a turn that ends on the announcement", () => {
    expect(
      endedWithoutDoing({
        instruction: ask,
        text: "정리했습니다. 이 내용을 바탕으로 슬랙 메시지를 작성하여 보내드리겠습니다.",
        toolTrace: ["web.search", "web.fetch"],
      }),
    ).toBe(true);
    expect(
      endedWithoutDoing({
        instruction: ask,
        text: "Got it. I'll now post this to the channel.",
        toolTrace: ["web.search"],
      }),
    ).toBe(true);
  });

  // A correct observation, a correct next step, and a finished turn. The model
  // narrated its own way out of the work.
  it("catches a turn that ends on the step still outstanding", () => {
    expect(
      endedWithoutDoing({
        instruction: ask,
        text: "redrob-labs 채널이 아니라 strategy_redrob-ai 채널이 열렸습니다. redrob-labs 채널을 찾아서 열어야 합니다.",
        toolTrace: ["app.focus", "ui.elements", "input.click"],
      }),
    ).toBe(true);
    expect(
      endedWithoutDoing({
        instruction: ask,
        text: "The wrong conversation opened. I should search for the channel again.",
        toolTrace: ["ui.elements"],
      }),
    ).toBe(true);
  });

  it("lets a turn stop when it stopped to ask", () => {
    expect(
      endedWithoutDoing({
        instruction: ask,
        text: "채널이 두 개 보입니다. 어느 쪽에 올릴까요?",
        toolTrace: ["ui.elements"],
      }),
    ).toBe(false);
  });

  it("says nothing when the message was actually typed", () => {
    expect(
      endedWithoutDoing({
        instruction: ask,
        text: "정리해서 올려드리겠습니다.",
        toolTrace: ["input.click", "input.type", "input.key"],
      }),
    ).toBe(false);
  });

  it("leaves a plain answer alone", () => {
    expect(
      endedWithoutDoing({
        instruction: ask,
        text: "labs.redrob.ai 근황은 다음과 같습니다. Eval, Image, Studio를 공개했습니다.",
        toolTrace: ["web.search"],
      }),
    ).toBe(false);
    expect(
      endedWithoutDoing({
        instruction: "오늘 날씨 알려줘",
        text: "확인해서 알려드리겠습니다.",
        toolTrace: [],
      }),
    ).toBe(false);
  });

  it("answers in the person's language when unverified", () => {
    expect(unverifiedSendReply("슬랙으로 보내줘")).toMatch(/단정할 수 없/);
    expect(unverifiedSendReply("send on Slack")).toMatch(/could not confirm/i);
  });

});

describe("gateSendClaim", () => {
  const ask = '슬랙으로 석승현 부대표님한테 "안녕하세요 테스트입니다" 보내줘';
  const prove =
    (proof: SendProof) =>
    async (): Promise<SendProof> =>
      proof;

  it("lets a claim stand when the message is in the window", async () => {
    const gate = await gateSendClaim({
      instruction: ask,
      text: "메시지를 성공적으로 전송했습니다.",
      toolTrace: ["input.type", "input.key"],
      nudgesUsed: 0,
      canRetry: true,
      prove: prove({ ok: true }),
    });
    expect(gate.kind).toBe("allow");
  });

  it("sends the model back once when the window does not have it", async () => {
    const gate = await gateSendClaim({
      instruction: ask,
      text: "메시지를 성공적으로 전송했습니다.",
      toolTrace: ["input.type", "input.key", "screen.capture"],
      nudgesUsed: 0,
      canRetry: true,
      prove: prove({ ok: false, reason: "not-visible", candidates: [] }),
    });
    expect(gate.kind).toBe("retry");
  });

  it("replaces the answer with a question once the retry is spent", async () => {
    const gate = await gateSendClaim({
      instruction: ask,
      text: "메시지를 성공적으로 전송했습니다.",
      toolTrace: ["input.type", "input.key", "screen.capture"],
      nudgesUsed: 1,
      canRetry: true,
      prove: prove({
        ok: false,
        reason: "not-visible",
        candidates: ["Seunghyun Seok", "Seunghyun Park"],
      }),
    });
    expect(gate).toMatchObject({
      kind: "override",
      options: ["Seunghyun Seok", "Seunghyun Park"],
    });
    if (gate.kind === "override") expect(gate.text).not.toMatch(/전송/);
  });

  // A screenshot after typing was the old proof, and it is still all there is
  // when nobody quoted a message to look for.
  it("falls back to tool order when there is no quoted message", async () => {
    const allowed = await gateSendClaim({
      instruction: "슬랙으로 석승현한테 인사 좀 보내줘",
      text: "메시지를 성공적으로 전송했습니다.",
      toolTrace: ["input.type", "input.key", "screen.capture"],
      nudgesUsed: 0,
      canRetry: true,
      prove: prove({ ok: false, reason: "no-body", candidates: [] }),
    });
    expect(allowed.kind).toBe("allow");

    const blocked = await gateSendClaim({
      instruction: "슬랙으로 석승현한테 인사 좀 보내줘",
      text: "메시지를 성공적으로 전송했습니다.",
      toolTrace: ["input.type", "input.key"],
      nudgesUsed: 2,
      canRetry: true,
      prove: prove({ ok: false, reason: "no-body", candidates: [] }),
    });
    expect(blocked.kind).toBe("override");
  });

  // The window has to be searched for what went into it, not for the model's
  // reading of an instruction that only said "shorter".
  it("hands the typed text to whoever reads the window", async () => {
    let saw: readonly string[] = [];
    await gateSendClaim({
      instruction: "슬랙으로 장훈한테 아까 그거 요약해서 더 짧게 보내줘",
      text: "메시지를 성공적으로 전송했습니다.",
      toolTrace: ["input.type", "input.key"],
      typed: ["온디바이스 AI 뉴스 세 줄 요약입니다"],
      nudgesUsed: 0,
      canRetry: true,
      prove: async (_instruction, typed) => {
        saw = typed;
        return { ok: true };
      },
    });
    expect(saw).toEqual(["온디바이스 AI 뉴스 세 줄 요약입니다"]);
  });

  it("sends the model back to do what it said it would do", async () => {
    const gate = await gateSendClaim({
      instruction: "redrob-labs 채널에 근황 정리해서 올려줘",
      text: "정리했습니다. 이 내용을 바탕으로 슬랙 메시지를 작성하여 보내드리겠습니다.",
      toolTrace: ["web.search"],
      nudgesUsed: 0,
      canRetry: true,
      prove: prove({ ok: false, reason: "not-visible", candidates: [] }),
    });
    expect(gate.kind).toBe("retry");
    if (gate.kind === "retry") expect(gate.nudge).toMatch(/Do it now/i);
  });

  it("sends the model back when it stopped at the wrong channel", async () => {
    const gate = await gateSendClaim({
      instruction: "redrob-labs 채널에 근황 정리해서 올려줘",
      text: "redrob-labs 채널이 아니라 strategy_redrob-ai 채널이 열렸습니다. redrob-labs 채널을 찾아서 열어야 합니다.",
      toolTrace: ["app.focus", "ui.elements", "input.click"],
      nudgesUsed: 0,
      canRetry: true,
      prove: prove({ ok: false, reason: "not-visible", candidates: [] }),
    });
    expect(gate.kind).toBe("retry");
    if (gate.kind === "retry") expect(gate.nudge).toMatch(/Search again/i);
  });

  it("stays out of the way when nothing was claimed", async () => {
    const gate = await gateSendClaim({
      instruction: ask,
      text: "슬랙을 열었습니다.",
      toolTrace: [],
      nudgesUsed: 0,
      canRetry: true,
      prove: prove({ ok: false, reason: "not-visible", candidates: [] }),
    });
    expect(gate.kind).toBe("allow");
  });
});
