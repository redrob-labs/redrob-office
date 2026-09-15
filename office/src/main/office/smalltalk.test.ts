import { describe, expect, it } from "vitest";

import { classifySmalltalk } from "./smalltalk";

describe("classifySmalltalk", () => {
  it("reads the greetings a Korean office actually opens with", () => {
    for (const line of ["좋은 아침", "안녕하세요", "안뇽", "하이", "반갑습니다"]) {
      expect(classifySmalltalk(line)).toBe("greeting");
    }
  });

  it("reads English greetings", () => {
    for (const line of ["hi", "Hello", "hey", "Good morning", "morning"]) {
      expect(classifySmalltalk(line)).toBe("greeting");
    }
  });

  it("separates thanks and goodbyes from hellos", () => {
    expect(classifySmalltalk("감사합니다")).toBe("thanks");
    expect(classifySmalltalk("고마워요")).toBe("thanks");
    expect(classifySmalltalk("thanks")).toBe("thanks");
    expect(classifySmalltalk("퇴근할게요")).toBe("farewell");
    expect(classifySmalltalk("good night")).toBe("farewell");
  });

  it("ignores the punctuation and emoji warmth is written with", () => {
    expect(classifySmalltalk("안녕!!")).toBe("greeting");
    expect(classifySmalltalk("좋은 아침~")).toBe("greeting");
    expect(classifySmalltalk("hi 👋")).toBe("greeting");
    expect(classifySmalltalk("  안녕하세요  ")).toBe("greeting");
  });

  // A Korean IME emits a fullwidth tilde or a wave dash, not the ASCII one, and
  // an office that only greeted back the US-keyboard spelling sent the rest to a
  // manager who answered a "good morning~" with an essay and an approval card.
  it("reads a greeting a Korean IME decorated", () => {
    expect(classifySmalltalk("좋은 아침\uFF5E")).toBe("greeting");
    expect(classifySmalltalk("좋은 아침\u301C")).toBe("greeting");
    expect(classifySmalltalk("안녕하세요\uFF01")).toBe("greeting");
    expect(classifySmalltalk("반가워요\u3002")).toBe("greeting");
  });

  // The costly direction of error. A greeting that gets worked is today's
  // behaviour; work that gets greeted loses the ask with no way to recover it.
  it("treats a greeting with an ask attached as work", () => {
    expect(classifySmalltalk("안녕하세요, NDA 검토 부탁해요")).toBeNull();
    expect(classifySmalltalk("hi, can you review this contract")).toBeNull();
    expect(classifySmalltalk("good morning - draft the Q3 plan please")).toBeNull();
  });

  it("treats real goals as work", () => {
    for (const line of [
      "Check this NDA",
      "Redrob Signal v3.0 기획서 초안 잡아 줘",
      "매출 데이터 정리해서 표로 만들어 줘",
    ]) {
      expect(classifySmalltalk(line)).toBeNull();
    }
  });

  it("has nothing to say about an empty line", () => {
    expect(classifySmalltalk("")).toBeNull();
    expect(classifySmalltalk("   ")).toBeNull();
  });

  // The catalog only answers what it is sure of. Everything else - a bare "야",
  // an inflected "좋은 아침이라니까" - goes to a manager, and the scheduler is what
  // keeps that manager's refusal out of the room. This classifier is not the
  // thing standing between a reader and an essay, so it does not have to guess.
  it("stays silent rather than guessing at an interjection", () => {
    for (const line of ["야", "음", "뭐해", "그래서"]) {
      expect(classifySmalltalk(line)).toBeNull();
    }
  });
});
