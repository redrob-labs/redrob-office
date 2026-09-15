import { afterEach, describe, expect, it } from "vitest";
import {
  abortAllApprovals,
  pendingApprovals,
  settleApproval,
  waitForApproval,
} from "./approval-waiters";

afterEach(() => {
  abortAllApprovals();
});

describe("waitForApproval", () => {
  it("resolves with the decision a person made", async () => {
    const waited = waitForApproval("call-1", { timeoutMs: 5_000 });
    expect(pendingApprovals()).toBe(1);
    expect(settleApproval("call-1", "approved")).toBe(true);
    await expect(waited).resolves.toBe("approved");
    expect(pendingApprovals()).toBe(0);
  });

  it("carries a standing yes as its own answer", async () => {
    const waited = waitForApproval("call-always", { timeoutMs: 5_000 });
    settleApproval("call-always", "approved_always");
    await expect(waited).resolves.toBe("approved_always");
  });

  it("resolves rather than throws when the answer is no", async () => {
    const waited = waitForApproval("call-2", { timeoutMs: 5_000 });
    settleApproval("call-2", "rejected");
    await expect(waited).resolves.toBe("rejected");
  });

  it("gives up rather than holding a run open forever", async () => {
    await expect(waitForApproval("call-3", { timeoutMs: 5 })).resolves.toBe("timeout");
    expect(pendingApprovals()).toBe(0);
  });

  it("lets go when the run is aborted", async () => {
    const controller = new AbortController();
    const waited = waitForApproval("call-4", { timeoutMs: 5_000, signal: controller.signal });
    controller.abort();
    await expect(waited).resolves.toBe("aborted");
  });

  it("does not wait at all on a signal that has already aborted", async () => {
    const controller = new AbortController();
    controller.abort();
    await expect(
      waitForApproval("call-5", { timeoutMs: 5_000, signal: controller.signal }),
    ).resolves.toBe("aborted");
    expect(pendingApprovals()).toBe(0);
  });

  it("replaces an older waiter for the same call rather than stranding it", async () => {
    const first = waitForApproval("call-6", { timeoutMs: 5_000 });
    const second = waitForApproval("call-6", { timeoutMs: 5_000 });
    await expect(first).resolves.toBe("aborted");
    expect(pendingApprovals()).toBe(1);
    settleApproval("call-6", "approved");
    await expect(second).resolves.toBe("approved");
  });

  it("settles each decision once, so a repeated click changes nothing", async () => {
    const waited = waitForApproval("call-7", { timeoutMs: 5_000 });
    expect(settleApproval("call-7", "approved")).toBe(true);
    expect(settleApproval("call-7", "rejected")).toBe(false);
    await expect(waited).resolves.toBe("approved");
  });
});

describe("settleApproval", () => {
  it("is harmless for an approval nobody is waiting on", () => {
    expect(settleApproval("floor-owned", "approved")).toBe(false);
  });
});
