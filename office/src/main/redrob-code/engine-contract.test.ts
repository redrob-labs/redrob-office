/**
 * Engine contract: a real Redrob Code session driven through the V1 `/session`
 * surface, with Office's tools reaching the engine over the in-process MCP
 * bridge, exactly as chat drives it.
 *
 * Nothing about the session runtime, the tool loop, or the MCP merge is faked.
 * Only the Redrob Console gateway behind the engine is a local stub, because the
 * engine refuses to route to any provider other than Console and a contract test
 * cannot hold a real Console key.
 *
 * Requires an engine: `REDROB_CODE_BIN` for a release binary, or
 * `REDROB_CODE_DEV_ROOT` for a redrob-code checkout run through bun. Skipped
 * without one rather than passing vacuously.
 */
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { RedrobCodeEngine } from "./engine.js";
import { BRIDGE_SERVER_NAME, type BridgeTool } from "./mcp-bridge.js";
import { hasConfiguredRedrobCode } from "./sidecar.js";
import { prepareEngineEnvironment } from "./testing.js";

const TIMEOUT = 180_000;

/** One Office-style tool the bridge exposes, standing in for the real registry. */
function probeBridge(workspace: string) {
  const calls: Array<{ name: string; args: Record<string, unknown> }> = [];
  const tools: BridgeTool[] = [
    {
      name: "probe_write",
      description: "Write a marker file into the project so the test can prove the tool ran.",
      inputSchema: {
        type: "object",
        properties: { text: { type: "string" } },
        required: ["text"],
      },
    },
  ];
  return {
    calls,
    listTools: () => tools,
    callTool: async (name: string, args: Record<string, unknown>) => {
      calls.push({ name, args });
      if (name !== "probe_write") {
        return { text: `unknown tool ${name}`, isError: true };
      }
      // A real Office tool changes real state; this writes a file the test reads.
      const text = typeof args.text === "string" ? args.text : "";
      const { writeFileSync } = await import("node:fs");
      writeFileSync(join(workspace, "probe.out"), text);
      return { text: `wrote probe.out (${text.length} chars)` };
    },
  };
}

describe.skipIf(!hasConfiguredRedrobCode())("Redrob Code engine contract", () => {
  it(
    "runs a chat turn end to end: an Office tool executes through the MCP bridge",
    async () => {
      const environment = await prepareEngineEnvironment({
        // The model reaches the bridge tool as <server>_<tool>; the engine maps
        // that back to the bare name on tools/call.
        turns: [
          {
            kind: "tool",
            id: "call_1",
            name: `${BRIDGE_SERVER_NAME}_probe_write`,
            args: { text: "hiring plan for Q3" },
          },
          { kind: "text", text: "Wrote the marker for the Q3 hiring plan." },
        ],
      });
      const engine = new RedrobCodeEngine();
      const bridge = probeBridge(environment.workspace);

      try {
        await engine.ensureStarted({
          userData: environment.userData,
          apiKey: "rrk_contract_test",
          bridge: { listTools: bridge.listTools, callTool: bridge.callTool },
        });
        expect(engine.projectDirectory()).toBe(environment.workspace);

        const chunks: string[] = [];
        const tools: Array<{ phase: string; name: string; ok?: boolean }> = [];
        const turn = await engine.runTurn({
          chatId: "chat_contract",
          message: "Write the marker for the Q3 hiring plan.",
          timeoutMs: TIMEOUT - 20_000,
          onTextChunk: (chunk) => chunks.push(chunk),
          onToolEvent: (event) => tools.push(event),
        });

        expect(turn.error).toBe(null);

        // The Office tool really executed through the bridge, against the real
        // project directory. This is the "not just engine built-ins" assertion.
        expect(bridge.calls).toEqual([
          { name: "probe_write", args: { text: "hiring plan for Q3" } },
        ]);
        expect(existsSync(join(environment.workspace, "probe.out"))).toBe(true);
        expect(readFileSync(join(environment.workspace, "probe.out"), "utf8")).toBe(
          "hiring plan for Q3",
        );
        expect(turn.toolsRan).toBe(1);

        // The model saw the bridged tool on the very first call of the session,
        // prefixed with the server name. Registering the bridge and waiting for
        // its tools/list before the first prompt is what makes that true, so no
        // warm-up turn is needed.
        expect(environment.gateway.requests[0]?.tools).toContain(
          `${BRIDGE_SERVER_NAME}_probe_write`,
        );
        expect(JSON.stringify(environment.gateway.requests[0]?.messages)).toContain(
          "Write the marker for the Q3 hiring plan.",
        );

        // The settled answer arrived after the tool round: two real provider
        // turns (the tool call, then the answer).
        expect(turn.text).toBe("Wrote the marker for the Q3 hiring plan.");
        expect(turn.stopReason).toBe("stop");
        expect(environment.gateway.requests.length).toBe(2);
      } finally {
        await engine.stop();
        await environment.close();
      }
    },
    TIMEOUT,
  );

  it(
    "keeps one engine session per chat, so history is the engine's to hold",
    async () => {
      const environment = await prepareEngineEnvironment({ turns: [{ kind: "text", text: "ok" }] });
      const engine = new RedrobCodeEngine();
      const bridge = probeBridge(environment.workspace);

      try {
        await engine.ensureStarted({
          userData: environment.userData,
          apiKey: "rrk_contract_test",
          bridge: { listTools: bridge.listTools, callTool: bridge.callTool },
        });
        await engine.runTurn({
          chatId: "chat_a",
          message: "first",
          timeoutMs: TIMEOUT - 20_000,
        });
        const second = await engine.runTurn({
          chatId: "chat_a",
          message: "second",
          timeoutMs: TIMEOUT - 20_000,
        });

        expect(second.error).toBe(null);
        // The engine replayed the first exchange into the second request, which
        // is the persistence this repo no longer has to carry for a turn.
        const replayed = JSON.stringify(environment.gateway.requests.at(-1)?.messages);
        expect(replayed).toContain("first");
        expect(replayed).toContain("second");
      } finally {
        await engine.stop();
        await environment.close();
      }
    },
    TIMEOUT,
  );

  it(
    "reports a provider failure as a turn error instead of throwing",
    async () => {
      const environment = await prepareEngineEnvironment({
        turns: [{ kind: "http-error", status: 401, message: "Invalid API key" }],
      });
      const engine = new RedrobCodeEngine();
      const bridge = probeBridge(environment.workspace);

      try {
        await engine.ensureStarted({
          userData: environment.userData,
          apiKey: "rrk_contract_test",
          bridge: { listTools: bridge.listTools, callTool: bridge.callTool },
        });
        const turn = await engine.runTurn({
          chatId: "chat_b",
          message: "anything",
          timeoutMs: 60_000,
        });
        expect(turn.text).toBe("");
        expect(turn.stopReason).toBe("error");
        expect(turn.error).not.toBe(null);
      } finally {
        await engine.stop();
        await environment.close();
      }
    },
    TIMEOUT,
  );
});
