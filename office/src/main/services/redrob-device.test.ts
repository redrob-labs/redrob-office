import { describe, expect, it } from "vitest";

import { REDROB_CONSOLE_API_BASE } from "../../shared/office-api.js";
import {
  collectRedrobDeviceConnect,
  createRedrobDeviceConnections,
  REDROB_DEVICE_PRODUCT,
  RedrobDeviceStartError,
} from "./redrob-device.js";

/**
 * The device grant, exercised against a stand-in console that answers the way
 * apps/api/src/device does. What these lock is the part a person feels: a
 * refusal stays refused, a lost network does not, and the renderer never gets
 * anything it could exchange for a key.
 */

interface Call {
  url: string;
  body: unknown;
}

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

/** A console that answers from a script, and records what it was asked. */
function scriptedConsole(
  script: Array<Response | (() => Response | Promise<Response>)>,
): { fetchImpl: (url: string, init?: RequestInit) => Promise<Response>; calls: Call[] } {
  const calls: Call[] = [];
  let index = 0;
  return {
    calls,
    fetchImpl: async (url, init) => {
      calls.push({
        url,
        body: init?.body ? JSON.parse(String(init.body)) : undefined,
      });
      const next = script[Math.min(index, script.length - 1)];
      index += 1;
      if (next === undefined) throw new Error("console script exhausted");
      return typeof next === "function" ? await next() : next;
    },
  };
}

const AUTHORIZED = {
  deviceCode: "device-secret-code",
  userCode: "K7QM-2XR9",
  verificationUri: "https://console.redrob.ai/connect",
  verificationUriComplete: "https://console.redrob.ai/connect?code=K7QM-2XR9",
  expiresIn: 600,
  interval: 5,
};

describe("device connect", () => {
  it("asks the console for a code as this product, and keeps the device code to itself", async () => {
    const console_ = scriptedConsole([jsonResponse(200, AUTHORIZED)]);
    const connections = createRedrobDeviceConnections({
      fetchImpl: console_.fetchImpl,
      baseUrl: "https://console.example/api/backend/v1",
      newId: () => "local-1",
    });

    const started = await connections.start();

    expect(console_.calls[0]?.url).toBe(
      "https://console.example/api/backend/v1/device/authorize",
    );
    expect(console_.calls[0]?.body).toEqual({ product: REDROB_DEVICE_PRODUCT });
    expect(started).toEqual({
      id: "local-1",
      userCode: "K7QM-2XR9",
      verificationUri: "https://console.redrob.ai/connect",
      verificationUriComplete:
        "https://console.redrob.ai/connect?code=K7QM-2XR9",
      expiresAt: expect.any(Number),
      intervalMs: 5000,
    });
    expect(JSON.stringify(started)).not.toContain(AUTHORIZED.deviceCode);
  });

  it("uses the console's own base url by default, so the key routes where inference does", () => {
    expect(REDROB_CONSOLE_API_BASE).toBe(
      "https://console.redrob.ai/api/backend/v1",
    );
  });

  it("waits while the console says the code is not approved, then hands back the key once", async () => {
    const console_ = scriptedConsole([
      jsonResponse(200, AUTHORIZED),
      jsonResponse(400, { error: "authorization_pending" }),
      jsonResponse(200, { apiKey: "rrk_pub_secret", apiKeyName: "Redrob Office" }),
    ]);
    const connections = createRedrobDeviceConnections({
      fetchImpl: console_.fetchImpl,
      newId: () => "local-1",
    });

    const started = await connections.start();
    expect(await connections.poll(started.id)).toEqual({ status: "pending" });
    expect(await connections.poll(started.id)).toEqual({
      status: "connected",
      key: "rrk_pub_secret",
    });

    // The record is gone with the key, so a second collection is not possible.
    expect(connections.pendingCount()).toBe(0);
    expect(await connections.poll(started.id)).toEqual({ status: "expired" });
    expect(console_.calls[1]?.body).toEqual({ deviceCode: AUTHORIZED.deviceCode });
  });

  it("reports slow_down as itself, so the caller can widen its interval", async () => {
    const console_ = scriptedConsole([
      jsonResponse(200, AUTHORIZED),
      jsonResponse(400, { error: "slow_down" }),
    ]);
    const connections = createRedrobDeviceConnections({
      fetchImpl: console_.fetchImpl,
    });
    const started = await connections.start();
    expect(await connections.poll(started.id)).toEqual({ status: "slow_down" });
    // Still pending: slow down is an instruction, not a refusal.
    expect(connections.pendingCount()).toBe(1);
  });

  it("stops for good when the person declines, and never asks again", async () => {
    const console_ = scriptedConsole([
      jsonResponse(200, AUTHORIZED),
      jsonResponse(403, { error: "access_denied" }),
    ]);
    const connections = createRedrobDeviceConnections({
      fetchImpl: console_.fetchImpl,
    });
    const started = await connections.start();

    expect(await connections.poll(started.id)).toEqual({ status: "denied" });
    expect(connections.pendingCount()).toBe(0);
    expect(await connections.poll(started.id)).toEqual({ status: "expired" });
    // Two calls only: authorize and the one poll that was refused.
    expect(console_.calls).toHaveLength(2);
  });

  it("stops when the console says the code expired", async () => {
    const console_ = scriptedConsole([
      jsonResponse(200, AUTHORIZED),
      jsonResponse(400, { error: "expired_token" }),
    ]);
    const connections = createRedrobDeviceConnections({
      fetchImpl: console_.fetchImpl,
    });
    const started = await connections.start();
    expect(await connections.poll(started.id)).toEqual({ status: "expired" });
    expect(connections.pendingCount()).toBe(0);
  });

  it("treats invalid_grant as final rather than turning it into another attempt", async () => {
    const console_ = scriptedConsole([
      jsonResponse(200, AUTHORIZED),
      jsonResponse(400, { error: "invalid_grant" }),
    ]);
    const connections = createRedrobDeviceConnections({
      fetchImpl: console_.fetchImpl,
    });
    const started = await connections.start();
    expect(await connections.poll(started.id)).toEqual({
      status: "failed",
      code: "invalid_grant",
    });
    expect(connections.pendingCount()).toBe(0);
  });

  it("keeps waiting when the network drops, because that is not the console's answer", async () => {
    let poll = 0;
    const connections = createRedrobDeviceConnections({
      fetchImpl: async (url) => {
        if (url.endsWith("/device/authorize")) return jsonResponse(200, AUTHORIZED);
        poll += 1;
        if (poll === 1) throw new TypeError("fetch failed");
        return jsonResponse(200, { apiKey: "rrk_pub_secret" });
      },
    });
    const started = await connections.start();

    expect(await connections.poll(started.id)).toEqual({ status: "unreachable" });
    expect(connections.pendingCount()).toBe(1);
    expect(await connections.poll(started.id)).toEqual({
      status: "connected",
      key: "rrk_pub_secret",
    });
  });

  it("expires a code locally once the console's own deadline has passed", async () => {
    let clock = 1_000;
    const console_ = scriptedConsole([jsonResponse(200, AUTHORIZED)]);
    const connections = createRedrobDeviceConnections({
      fetchImpl: console_.fetchImpl,
      now: () => clock,
    });
    const started = await connections.start();
    expect(started.expiresAt).toBe(1_000 + 600_000);

    clock += 600_001;
    expect(await connections.poll(started.id)).toEqual({ status: "expired" });
    // No second call: the deadline was reached without asking the console again.
    expect(console_.calls).toHaveLength(1);
  });

  it("falls back to the bare confirm page when the console sends no prefilled link", async () => {
    const console_ = scriptedConsole([
      jsonResponse(200, { ...AUTHORIZED, verificationUriComplete: "" }),
    ]);
    const connections = createRedrobDeviceConnections({
      fetchImpl: console_.fetchImpl,
    });
    const started = await connections.start();
    expect(started.verificationUriComplete).toBe(
      "https://console.redrob.ai/connect",
    );
  });

  it("says the console is unreachable rather than inventing a code", async () => {
    const connections = createRedrobDeviceConnections({
      fetchImpl: async () => {
        throw new TypeError("fetch failed");
      },
    });
    await expect(connections.start()).rejects.toBeInstanceOf(
      RedrobDeviceStartError,
    );
    expect(connections.pendingCount()).toBe(0);
  });

  it("refuses a start that came back without a usable code", async () => {
    const console_ = scriptedConsole([
      jsonResponse(200, { userCode: "K7QM-2XR9" }),
    ]);
    const connections = createRedrobDeviceConnections({
      fetchImpl: console_.fetchImpl,
    });
    await expect(connections.start()).rejects.toMatchObject({
      code: "device_start_incomplete",
    });
  });

  it("stops a caller from stockpiling live codes", async () => {
    const connections = createRedrobDeviceConnections({
      fetchImpl: async () => jsonResponse(200, AUTHORIZED),
    });
    for (let index = 0; index < 8; index += 1) {
      await connections.start();
    }
    await expect(connections.start()).rejects.toMatchObject({
      code: "device_connect_busy",
    });
    expect(connections.pendingCount()).toBe(8);
  });

  it("forgets a cancelled connection, so a later poll cannot collect it", async () => {
    const connections = createRedrobDeviceConnections({
      fetchImpl: async () => jsonResponse(200, AUTHORIZED),
    });
    const started = await connections.start();
    expect(connections.cancel(started.id)).toBe(true);
    expect(connections.cancel(started.id)).toBe(false);
    expect(await connections.poll(started.id)).toEqual({ status: "expired" });
  });
});

describe("collecting a connection for the renderer", () => {
  it("stores the key on this side and answers with the snapshot, never the key", async () => {
    const console_ = scriptedConsole([
      jsonResponse(200, AUTHORIZED),
      jsonResponse(200, { apiKey: "rrk_pub_secret" }),
    ]);
    const connections = createRedrobDeviceConnections({
      fetchImpl: console_.fetchImpl,
    });
    const stored: string[] = [];
    const started = await connections.start();

    const view = await collectRedrobDeviceConnect(
      connections,
      started.id,
      async (key) => {
        stored.push(key);
        return { state: { llmProviders: { openai: { apiKey: "*".repeat(32) } } } };
      },
    );

    expect(stored).toEqual(["rrk_pub_secret"]);
    expect(view.status).toBe("connected");
    expect(JSON.stringify(view)).not.toContain("rrk_pub_secret");
    expect(JSON.stringify(view)).not.toContain(AUTHORIZED.deviceCode);
  });

  it("does not store anything while the console is still waiting", async () => {
    const console_ = scriptedConsole([
      jsonResponse(200, AUTHORIZED),
      jsonResponse(400, { error: "authorization_pending" }),
      jsonResponse(400, { error: "slow_down" }),
      jsonResponse(403, { error: "access_denied" }),
    ]);
    const connections = createRedrobDeviceConnections({
      fetchImpl: console_.fetchImpl,
    });
    const stored: string[] = [];
    const store = async (key: string) => {
      stored.push(key);
      return {};
    };
    const started = await connections.start();

    expect(await collectRedrobDeviceConnect(connections, started.id, store)).toEqual({
      status: "pending",
    });
    // Renamed for the renderer, still the console's instruction to wait longer.
    expect(await collectRedrobDeviceConnect(connections, started.id, store)).toEqual({
      status: "slowDown",
    });
    expect(await collectRedrobDeviceConnect(connections, started.id, store)).toEqual({
      status: "denied",
    });
    expect(stored).toEqual([]);
  });

  it("answers a blank id without asking the console anything", async () => {
    const console_ = scriptedConsole([jsonResponse(200, AUTHORIZED)]);
    const connections = createRedrobDeviceConnections({
      fetchImpl: console_.fetchImpl,
    });
    expect(
      await collectRedrobDeviceConnect(connections, "   ", async () => ({})),
    ).toEqual({ status: "expired" });
    expect(console_.calls).toHaveLength(0);
  });
});
