import { describe, expect, it } from "vitest";

import {
  EASY_FILE_CONTENT,
  easyFileMatches,
  scoreGeneralChat,
} from "./difficulty-rubric.js";

describe("difficulty benchmark rubric", () => {
  it("accepts a direct three-bullet idempotency answer", () => {
    const result = scoreGeneralChat(
      "- Idempotency means retries have the same effect. " +
        "- HTTP PUT /users/7 can be retried safely. " +
        "- Store an idempotency key for unsafe operations.",
    );
    expect(result).toEqual({
      bulletCount: 3,
      mentionsIdempotency: true,
      hasPutRetryExample: true,
    });
  });

  it("does not confuse prose with three bullets", () => {
    expect(scoreGeneralChat("Idempotency makes a PUT retry safe.").bulletCount).toBe(0);
  });

  it("allows a conventional final newline but no other file drift", () => {
    expect(easyFileMatches(`${EASY_FILE_CONTENT}\n`)).toBe(true);
    expect(easyFileMatches(EASY_FILE_CONTENT.replace("42", "41"))).toBe(false);
    expect(easyFileMatches(`extra\n${EASY_FILE_CONTENT}`)).toBe(false);
  });
});
