import { describe, expect, it } from "vitest";

import { classifyField, scoreFields } from "./accuracy.js";

describe("classifyField", () => {
  it("marks equal values ok", () => {
    expect(classifyField("김민수", "김민수")).toBe("ok");
    expect(classifyField(48, 48)).toBe("ok");
  });

  it("marks miss when gold present and prediction absent", () => {
    expect(classifyField("a@b.com", "없음")).toBe("miss");
    expect(classifyField("a@b.com", "")).toBe("miss");
  });

  it("marks hallucination when gold absent and prediction invented", () => {
    expect(classifyField("없음", "홍길동")).toBe("hallucination");
    expect(classifyField("", "010-0000-0000")).toBe("hallucination");
  });

  it("marks value_wrong when both present but differ", () => {
    expect(classifyField("김민수", "홍길동")).toBe("value_wrong");
  });
});

describe("scoreFields", () => {
  it("scores each path", () => {
    const scores = scoreFields(
      { "/name": "Ada", "/email": "" },
      { "/name": "Ada", "/email": "x@y.com" },
    );
    expect(scores.find((row) => row.path === "/name")?.classification).toBe("ok");
    expect(scores.find((row) => row.path === "/email")?.classification).toBe("hallucination");
  });
});
