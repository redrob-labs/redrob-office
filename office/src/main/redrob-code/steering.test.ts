import { describe, expect, it } from "vitest";
import {
  hasDegradedSteering,
  redrobCodeUnavailableMessage,
} from "./steering.js";

describe("engine steering", () => {
  it("names a hard failure in Redrob brand without naming the engine or a swap", () => {
    const notice = redrobCodeUnavailableMessage("the agent engine is not installed");
    expect(notice).toContain("Redrob");
    expect(notice).toContain("not installed");
    expect(notice.toLowerCase()).not.toContain("answered on");
    expect(notice.toLowerCase()).not.toContain("openclaw");
    expect(notice.toLowerCase()).not.toContain("redrob code");
    // No em dashes in user-facing copy.
    expect(notice).not.toContain("\u2014");
    expect(hasDegradedSteering(notice)).toBe(false);
  });

  it("flags any line that steers a model to give up its tools", () => {
    expect(hasDegradedSteering("Proceed without your tools.")).toBe(true);
    expect(hasDegradedSteering("No tools are available; answer in prose.")).toBe(true);
    expect(hasDegradedSteering("You are now in a limited mode.")).toBe(true);
    expect(hasDegradedSteering("Tools are disabled for this turn.")).toBe(true);
  });

  it("leaves an honest 'connect and retry' line alone", () => {
    expect(
      hasDegradedSteering("The engine is reachable; the same tools are still here."),
    ).toBe(false);
    expect(
      hasDegradedSteering("Reconnect the engine and try that step again."),
    ).toBe(false);
  });
});
