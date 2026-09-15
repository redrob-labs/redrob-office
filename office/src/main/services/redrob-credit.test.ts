import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { beforeEach, describe, expect, it } from "vitest";

import { isUpstreamModelFailure } from "../redrob-code/turn-errors.js";

import {
  __resetCreditState,
  clearCreditBlock,
  creditState,
  isOutOfCredit,
  noteCreditSpent,
  noteOutOfCredit,
  outOfCreditMessage,
} from "./redrob-credit.js";

/**
 * What Office is allowed to believe about credit.
 *
 * The rule under test is not a calculation, it is a refusal to guess: the only
 * fact available to a workspace key is that the console said no, and the app must
 * not turn a cleared block into a claim that a payment worked.
 */

describe("telling out of credit from throttled", () => {
  it("recognises the console's own refusal", () => {
    for (const message of [
      "This workspace is out of credit (balance $0.00). Top up to keep making requests.",
      "console request failed: 402 Payment Required",
      'upstream error {"error":{"type":"insufficient_quota","code":"insufficient_quota"}}',
    ]) {
      expect(isOutOfCredit(new Error(message)), message).toBe(true);
    }
  });

  it("does not read a throttle or an ordinary failure as an empty balance", () => {
    for (const message of [
      "429 Too Many Requests: rate limit exceeded",
      "the model is overloaded, try again",
      "socket closed before the turn finished",
      "401 invalid_api_key",
    ]) {
      expect(isOutOfCredit(new Error(message)), message).toBe(false);
    }
  });

  it("says what to do about it, in both languages, without an em dash", () => {
    const en = outOfCreditMessage("en");
    const ko = outOfCreditMessage("ko");
    expect(en).toMatch(/out of credit/i);
    expect(en).toMatch(/Nothing was changed/i);
    expect(ko).toContain("크레딧");
    expect(ko).not.toBe(en);
    for (const message of [en, ko]) {
      expect(message).not.toMatch(/[—–]/);
    }
  });
});

describe("what the app remembers about credit", () => {
  beforeEach(() => {
    __resetCreditState();
  });

  it("starts knowing nothing, which is not the same as blocked", () => {
    expect(creditState()).toEqual({
      blocked: false,
      refusedAt: null,
      detail: null,
    });
  });

  it("keeps the console's sentence, because it names the balance it saw", () => {
    noteOutOfCredit(
      new Error("This workspace is out of credit (balance $0.00). Top up."),
    );
    const state = creditState();
    expect(state.blocked).toBe(true);
    expect(state.detail).toContain("balance $0.00");
    expect(state.refusedAt).toBeTruthy();
  });

  it("clears itself when a later request was billed, which is proof credit exists", () => {
    noteOutOfCredit(new Error("out of credit"));
    expect(creditState().blocked).toBe(true);
    noteCreditSpent();
    expect(creditState().blocked).toBe(false);
  });

  it("clearing the block on the person's word records no payment at all", () => {
    noteOutOfCredit(new Error("out of credit (balance $0.00)"));
    const after = clearCreditBlock();
    // No balance, no amount, no receipt: nothing here can say a payment settled.
    expect(after).toEqual({ blocked: false, refusedAt: null, detail: null });
    expect(Object.keys(after)).toEqual(["blocked", "refusedAt", "detail"]);
  });

  it("does not invent a refusal when a turn simply succeeded", () => {
    noteCreditSpent();
    expect(creditState().blocked).toBe(false);
    expect(creditState().detail).toBeNull();
  });
});

describe("which classification wins", () => {
  it("overlaps with the throttle rule, so the order in chat.ts is load bearing", () => {
    const refusal = new Error(
      'insufficient_quota: this workspace is out of credit (balance $0.00)',
    );
    // Both match. Waiting fixes one of them and only paying fixes the other, so
    // asking about credit first is what stops the app telling someone to wait.
    expect(isOutOfCredit(refusal)).toBe(true);
    expect(isUpstreamModelFailure(refusal)).toBe(true);

    const chat = readFileSync(
      join(dirname(fileURLToPath(import.meta.url)), "chat.ts"),
      "utf8",
    );
    const creditAt = chat.indexOf("isOutOfCredit(error)");
    const throttleAt = chat.indexOf("isUpstreamModelFailure(error)");
    expect(creditAt).toBeGreaterThan(-1);
    expect(throttleAt).toBeGreaterThan(-1);
    expect(creditAt).toBeLessThan(throttleAt);
  });
});
