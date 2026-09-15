import { beforeEach, describe, expect, it } from "vitest";
import {
  controlStatus,
  isStopped,
  requireBackend,
  resolveDesktopControlForWork,
  resumeAfterStop,
  stopEverything,
  UnsupportedDesktopError,
  __setBackendForTest,
  type DesktopBackend,
} from "./index";

/*
 * The gate in front of the pointer.
 *
 * These are the properties that matter most in this whole feature: that
 * nothing drives the machine until someone says so, and that the stop really
 * stops. Both are cheap to get wrong in a refactor and expensive to discover
 * afterwards, so they are asserted here rather than left to the live probe.
 */

const backend = {
  name: "test",
  moveTo: async () => undefined,
  click: async () => undefined,
  typeText: async () => undefined,
  pressChord: async () => undefined,
  scroll: async () => undefined,
  cursor: async () => ({ x: 0, y: 0 }),
} satisfies DesktopBackend;

beforeEach(() => {
  resumeAfterStop();
  __setBackendForTest(backend);
});

describe("controlStatus", () => {
  it("is off until it is turned on, even where the machine could do it", async () => {
    const status = await controlStatus(false);
    expect(status.state).toBe("off");
    expect(status.reason).toMatch(/Settings/);
  });

  it("is ready once it is turned on", async () => {
    expect((await controlStatus(true)).state).toBe("ready");
  });

  it("says the machine cannot do it, separately from not being allowed to", async () => {
    __setBackendForTest(null);
    const status = await controlStatus(true);
    expect(status.state).toBe("unsupported");
    expect(status.backend).toBeNull();
  });
});

describe("the stop", () => {
  it("overrides being turned on", async () => {
    expect((await controlStatus(true)).state).toBe("ready");
    stopEverything();
    expect((await controlStatus(true)).state).toBe("stopped");
  });

  it("stays stopped, so a second press cannot hand the pointer back", async () => {
    stopEverything();
    stopEverything();
    expect(isStopped()).toBe(true);
    expect((await controlStatus(true)).state).toBe("stopped");
  });

  it("is cleared only deliberately", async () => {
    stopEverything();
    resumeAfterStop();
    expect((await controlStatus(true)).state).toBe("ready");
  });
});

describe("resolveDesktopControlForWork", () => {
  it("turns control on when work needs the screen", async () => {
    let enabled = false;
    const gate = await resolveDesktopControlForWork({
      enabled: false,
      turnOn: async () => {
        enabled = true;
      },
    });
    expect(gate).toEqual({
      ok: true,
      state: "ready",
      justEnabled: true,
      reason: "",
    });
    expect(enabled).toBe(true);
  });

  it("does not clear a panic stop", async () => {
    stopEverything();
    let turnedOn = false;
    const gate = await resolveDesktopControlForWork({
      enabled: false,
      turnOn: async () => {
        turnedOn = true;
      },
    });
    expect(gate.ok).toBe(false);
    expect(gate.state).toBe("stopped");
    expect(turnedOn).toBe(false);
  });
});

describe("requireBackend", () => {
  it("hands over the backend when everything allows it", async () => {
    await expect(requireBackend(true)).resolves.toBe(backend);
  });

  it("refuses with the reason rather than a bare failure", async () => {
    await expect(requireBackend(false)).rejects.toThrow(
      UnsupportedDesktopError,
    );
    await expect(requireBackend(false)).rejects.toThrow(/Settings/);
  });

  it("refuses after the stop, however it was configured", async () => {
    stopEverything();
    await expect(requireBackend(true)).rejects.toThrow(/Stopped by hand/);
  });
});
