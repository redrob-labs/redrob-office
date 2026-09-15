import { EventEmitter } from "node:events";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * A stand-in for llama-server. Only the surface the module touches is real:
 * stdout/stderr streams, an exit code, and kill().
 */
class FakeProc extends EventEmitter {
  stdout = new EventEmitter();
  stderr = new EventEmitter();
  exitCode: number | null = null;
  signalCode: string | null = null;
  killed = false;
  readonly port: number;

  constructor(port: number) {
    super();
    this.port = port;
  }

  kill(): boolean {
    this.killed = true;
    this.exitCode = 0;
    this.emit("exit", 0, null);
    return true;
  }
}

const spawned: FakeProc[] = [];

vi.mock("node:child_process", () => ({
  spawn: (_binary: string, args: string[]) => {
    const port = Number(args[args.indexOf("--port") + 1]);
    const proc = new FakeProc(port);
    spawned.push(proc);
    return proc;
  },
}));

vi.mock("node:fs", async (importOriginal) => ({
  ...(await importOriginal<typeof import("node:fs")>()),
  existsSync: () => true,
}));

vi.mock("node:fs/promises", async (importOriginal) => ({
  ...(await importOriginal<typeof import("node:fs/promises")>()),
  access: async () => undefined,
}));

const {
  ensureLlamaServer,
  getLlamaServerStatus,
  resetLlamaServerForTests,
  stopLlamaServer,
} = await import("./llama-server.js");

/** Ports that answer /health. Anything else refuses, like a port nobody bound. */
const bound = new Set<number>();

beforeEach(() => {
  spawned.length = 0;
  bound.clear();
  vi.stubGlobal("fetch", async (url: string | URL) => {
    const port = Number(new URL(String(url)).port);
    if (!bound.has(port)) throw new Error("fetch failed");
    return new Response(JSON.stringify({ status: "ok" }), { status: 200 });
  });
});

afterEach(() => {
  resetLlamaServerForTests();
  vi.unstubAllGlobals();
});

const CONFIG = {
  backendId: "win-x64-cuda" as const,
  modelPath: "C:/models/model.gguf",
};

/** Let the health poller run at least one more iteration. */
async function poll(times = 3): Promise<void> {
  for (let i = 0; i < times; i += 1) {
    await new Promise((resolve) => setTimeout(resolve, 450));
  }
}

describe("ensureLlamaServer", () => {
  it("returns the port once the server answers", async () => {
    const start = ensureLlamaServer(CONFIG);
    await poll(1);
    bound.add(spawned[0]!.port);
    await expect(start).resolves.toBe(spawned[0]!.port);
    expect(getLlamaServerStatus().running).toBe(true);
  });

  // The bug: a start that lost the race kept probing its own dead port until the
  // 180s health timeout, then tore down the healthy server that had replaced it.
  // The person saw "health timeout" quoting a log that said "model loaded".
  it("does not kill a healthy server when an older start loses the race", async () => {
    // First start never binds, so its health probe keeps failing.
    const first = ensureLlamaServer(CONFIG);
    await poll(1);
    expect(spawned).toHaveLength(1);

    // Something restarts the server while the first start is still waiting.
    stopLlamaServer();
    const second = ensureLlamaServer(CONFIG);
    await poll(1);
    expect(spawned).toHaveLength(2);
    const healthy = spawned[1]!;
    bound.add(healthy.port);

    await expect(second).resolves.toBe(healthy.port);

    // The superseded start settles on the running server rather than reporting a
    // timeout, and above all does not kill it on the way out.
    await expect(first).resolves.toBe(healthy.port);
    expect(healthy.killed).toBe(false);
    expect(getLlamaServerStatus().port).toBe(healthy.port);
    expect(getLlamaServerStatus().running).toBe(true);
  }, 20_000);

  it("blames the process that actually failed, not its replacement", async () => {
    const first = ensureLlamaServer(CONFIG);
    await poll(1);
    const failing = spawned[0]!;
    failing.stderr.emit("data", Buffer.from("first process could not bind\n"));

    stopLlamaServer();
    const second = ensureLlamaServer(CONFIG);
    await poll(1);
    const healthy = spawned[1]!;
    healthy.stderr.emit("data", Buffer.from("srv llama_server: model loaded\n"));
    bound.add(healthy.port);

    await expect(second).resolves.toBe(healthy.port);
    await expect(first).resolves.toBe(healthy.port);
  }, 20_000);
});
