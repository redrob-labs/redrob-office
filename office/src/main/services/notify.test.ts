import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  isSupported: vi.fn(() => true),
  show: vi.fn(),
  constructed: [] as Array<Record<string, unknown>>,
}));

vi.mock("electron", () => {
  class FakeNotification {
    static isSupported = mocks.isSupported;
    constructor(options: Record<string, unknown>) {
      mocks.constructed.push(options);
    }
    show = mocks.show;
  }
  return { Notification: FakeNotification };
});

import { notices, notifyDesktop } from "./notify.js";

describe("notifyDesktop", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.constructed.length = 0;
    mocks.isSupported.mockReturnValue(true);
  });

  it("shows a silent notification and announces it", () => {
    const seen: unknown[] = [];
    notices.once("notice", (notice) => seen.push(notice));

    const shown = notifyDesktop({ title: "Day log", body: "Screen captured" });

    expect(shown).toBe(true);
    expect(mocks.show).toHaveBeenCalledTimes(1);
    expect(mocks.constructed[0]).toEqual({
      title: "Day log",
      body: "Screen captured",
      silent: true,
    });
    expect(seen).toEqual([{ title: "Day log", body: "Screen captured" }]);
  });

  it("makes a sound only when asked", () => {
    notifyDesktop({ title: "Day log", body: "Capture failed", sound: true });

    expect(mocks.constructed[0]).toMatchObject({ silent: false });
  });

  it("reports failure instead of throwing where the OS cannot notify", () => {
    mocks.isSupported.mockReturnValue(false);

    expect(notifyDesktop({ title: "Day log", body: "…" })).toBe(false);
    expect(mocks.show).not.toHaveBeenCalled();
  });
});
