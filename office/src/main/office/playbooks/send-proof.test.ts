import { describe, expect, it } from "vitest";
import {
  candidatesFor,
  messageVisible,
  normalizeForMatch,
  proofNeedles,
  unprovenSendReply,
} from "./send-proof.js";

describe("messageVisible", () => {
  const thread = [
    "Janghoon Lee  19:58  안녕하세요, 테스트입니다.",
    "Message input",
    "Send",
  ];

  it("finds the message inside a rendered row", () => {
    expect(messageVisible(thread, "안녕하세요, 테스트입니다.")).toBe(true);
  });

  it("ignores spacing and punctuation differences", () => {
    expect(messageVisible(thread, "안녕하세요 테스트입니다")).toBe(true);
  });

  it("says no when the thread does not contain it", () => {
    expect(messageVisible(thread, "회의 내일 3시로 옮겨주세요")).toBe(false);
  });

  it("refuses to prove anything from a very short message", () => {
    expect(messageVisible(["네"], "네")).toBe(false);
  });

  // The message went through, Slack broke it over several rows on the way in,
  // and the person was told it had not been sent.
  it("finds a long message that the app split across rows", () => {
    const sent =
      "온디바이스 AI 뉴스 요약입니다. 퀄컴이 NPU 성능을 크게 올린 XR 칩을 공개했고, " +
      "구글은 안드로이드에 제미나이 기능을 확대했습니다. 애플은 카메라 에어팟을 준비 중입니다.";
    const rows = [
      "Janghoon Lee  21:20  온디바이스 AI 뉴스 요약입니다. 퀄컴이 NPU 성능을 크게 올린 XR 칩을 공개했고,",
      "구글은 안드로이드에 제미나이 기능을 확대했습니다.",
      "애플은 카메라 에어팟을 준비 중입니다.",
    ];
    expect(messageVisible(rows, sent)).toBe(true);
  });

  // Reflowed on the way in: the emoji shortcode became a picture and the app
  // hung "(edited)" off the end. Most of the text is still there.
  it("survives the app rewriting parts of a long message", () => {
    const sent =
      "회의록 정리해서 올려두었습니다 https://example.com/notes/2026-08-12 확인 부탁드려요 :bow:";
    const rows = [
      "Janghoon Lee  21:20  회의록 정리해서 올려두었습니다 " +
        "https://example.com/notes/2026-08-12 확인 부탁드려요 (edited)",
    ];
    expect(messageVisible(rows, sent)).toBe(true);
  });

  it("does not stitch a message out of two unrelated rows", () => {
    const rows = ["회의록 정리해서", "올려두었습니다"];
    expect(messageVisible(rows, "회의록 정리해서 올려두었습니다")).toBe(false);
  });
});

describe("proofNeedles", () => {
  const ask = "슬랙으로 장훈한테 아까 그거 요약해서 더 짧게 보내줘";

  // The whole bug: the instruction says "shorter", the model decides what that
  // means, and the window is then searched for words nobody ever typed.
  it("looks for what was typed, longest first, before the instruction", () => {
    const needles = proofNeedles(ask, ["장훈", "온디바이스 AI 뉴스 세 줄 요약입니다"]);
    expect(needles[0]).toBe("온디바이스 AI 뉴스 세 줄 요약입니다");
  });

  it("drops typed fragments too short to prove anything", () => {
    expect(proofNeedles(ask, ["장", " "])).toEqual([]);
  });

  it("falls back to the quoted body when nothing was typed", () => {
    const quoted = '슬랙으로 장훈한테 "안녕하세요 테스트입니다" 보내줘';
    expect(proofNeedles(quoted, [])).toEqual(["안녕하세요 테스트입니다"]);
  });
});

describe("candidatesFor", () => {
  it("collects the rows that could be the person", () => {
    const names = [
      "Seunghyun Seok",
      "Seunghyun Park",
      "redrob-signal-engineering",
      "Message input",
    ];
    expect(candidatesFor(names, "석승현 부대표님")).toEqual([
      "Seunghyun Seok",
      "Seunghyun Park",
    ]);
  });

  it("returns nothing when nobody matches", () => {
    expect(candidatesFor(["Slackbot", "Threads"], "석승현")).toEqual([]);
  });
});

describe("unprovenSendReply", () => {
  const ask = '슬랙으로 석승현 부대표님한테 "안녕하세요 테스트입니다" 보내줘';

  it("asks which person when several could match", () => {
    const reply = unprovenSendReply(ask, {
      ok: false,
      reason: "not-visible",
      candidates: ["Seunghyun Seok", "Seunghyun Park"],
    });
    expect(reply.text).toMatch(/여러 명/);
    expect(reply.options).toEqual(["Seunghyun Seok", "Seunghyun Park"]);
  });

  it("asks for the Slack name when nobody matched", () => {
    const reply = unprovenSendReply(ask, {
      ok: false,
      reason: "not-visible",
      candidates: [],
    });
    expect(reply.text).toMatch(/찾지 못했/);
    expect(reply.options.length).toBeGreaterThan(0);
  });

  it("never claims delivery when the window could not be read", () => {
    const reply = unprovenSendReply("send it on Slack", {
      ok: false,
      reason: "unreadable",
      candidates: [],
    });
    expect(reply.text).toMatch(/cannot confirm/i);
  });
});

describe("normalizeForMatch", () => {
  it("flattens what a chat app does to typed text", () => {
    expect(normalizeForMatch(" Hello,  World! ")).toBe("helloworld");
  });
});
