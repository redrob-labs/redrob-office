import { describe, expect, it } from "vitest";
import { redrobCodeEngineAvailable } from "./engine.js";
import { readBusEvents } from "./session.js";
import { BRIDGE_SERVER_NAME, MCP_PROTOCOL_VERSION } from "./mcp-bridge.js";
import { parseListeningLine, resolveRedrobCodeCommand, SERVER_LISTENING_PREFIX } from "./sidecar.js";

const stream = (chunks: string[]) =>
  new ReadableStream<Uint8Array>({
    start(controller) {
      const encoder = new TextEncoder();
      for (const piece of chunks) controller.enqueue(encoder.encode(piece));
      controller.close();
    },
  });

describe("readiness handshake", () => {
  it("pins the prefix Redrob Code matches consumers on", () => {
    expect(SERVER_LISTENING_PREFIX).toBe("redrob server listening");
  });

  it("takes the bound URL from the readiness line", () => {
    expect(parseListeningLine("redrob server listening on http://127.0.0.1:4096")).toBe(
      "http://127.0.0.1:4096",
    );
    // `--port 0` means the OS assigns, so the bound port only exists in this line.
    expect(parseListeningLine("redrob server listening on http://0.0.0.0:51234")).toBe(
      "http://0.0.0.0:51234",
    );
  });

  it("ignores other engine output", () => {
    expect(parseListeningLine("Warning: REDROB_SERVER_PASSWORD is not set")).toBe(null);
  });
});

describe("resolveRedrobCodeCommand", () => {
  it("prefers the packaged binary override", () => {
    expect(resolveRedrobCodeCommand({ REDROB_CODE_BIN: "/opt/redrob/redrob" })).toEqual({
      command: "/opt/redrob/redrob",
      args: [],
      source: "REDROB_CODE_BIN",
    });
  });

  it("runs a source checkout through bun when only a dev root is set", () => {
    expect(resolveRedrobCodeCommand({ REDROB_CODE_DEV_ROOT: "/repos/redrob-code" })).toEqual({
      command: "bun",
      args: ["run", "/repos/redrob-code/packages/redrob/src/index.ts"],
      source: "REDROB_CODE_DEV_ROOT",
    });
  });

  it("falls back to the installed binary, and treats a blank override as unset", () => {
    expect(resolveRedrobCodeCommand({}).source).toBe("PATH");
    expect(resolveRedrobCodeCommand({ REDROB_CODE_BIN: "  " }).source).toBe("PATH");
  });
});

describe("engine availability", () => {
  it("is available only when a sidecar is locatable, with no engine-selection flag", () => {
    // The engine is the only runtime; availability is the sidecar being present,
    // not an opt-in. Nothing on PATH must not read as available inside a package.
    expect(redrobCodeEngineAvailable({})).toBe(false);
    expect(redrobCodeEngineAvailable({ REDROB_CODE_BIN: "  " })).toBe(false);
    expect(redrobCodeEngineAvailable({ REDROB_CODE_BIN: "/opt/redrob/redrob" })).toBe(true);
    expect(redrobCodeEngineAvailable({ REDROB_CODE_DEV_ROOT: "/repos/redrob-code" })).toBe(true);
  });
});

describe("mcp bridge protocol constants", () => {
  it("negotiates the protocol version the engine's MCP client expects", () => {
    expect(MCP_PROTOCOL_VERSION).toBe("2025-06-18");
  });

  it("names the bridge so tools reach the model as <server>_<tool>", () => {
    expect(BRIDGE_SERVER_NAME).toBe("redrob-office");
  });
});

describe("readBusEvents", () => {
  it("decodes V1 bus events and keeps their properties", async () => {
    const events = [];
    for await (const event of readBusEvents(
      stream([
        'data: {"type":"message.part.updated","properties":{"part":{"sessionID":"ses_1","type":"text","text":"hi"}}}\n\n',
        ': ping\n\ndata: [DONE]\n\ndata: {"type":"session.idle","properties":{"sessionID":"ses_1"}}\n\n',
      ]),
    )) {
      events.push(event);
    }
    expect(events).toEqual([
      {
        type: "message.part.updated",
        properties: { part: { sessionID: "ses_1", type: "text", text: "hi" } },
      },
      { type: "session.idle", properties: { sessionID: "ses_1" } },
    ]);
  });

  it("reassembles a frame split across chunk boundaries", async () => {
    const events = [];
    for await (const event of readBusEvents(
      stream([
        'data: {"type":"message.part.up',
        'dated","properties":{"part":{"type":"text","text":"split"}}}\n\n',
      ]),
    )) {
      events.push(event);
    }
    expect(events).toEqual([
      { type: "message.part.updated", properties: { part: { type: "text", text: "split" } } },
    ]);
  });
});
