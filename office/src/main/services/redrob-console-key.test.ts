import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  REDROB_CONSOLE_API_BASE,
  loadSetupState,
  saveLlmSettings,
  saveRemoteCredentials,
} from "./setup.js";

describe("Redrob Console inference key policy", () => {
  const roots: string[] = [];

  afterEach(async () => {
    vi.unstubAllGlobals();
    await Promise.all(
      roots.splice(0).map((root) =>
        rm(root, { recursive: true, force: true }),
      ),
    );
  });

  it("stores one key at the fixed Console base URL", async () => {
    const verify = vi.fn().mockResolvedValue(new Response("{}", { status: 200 }));
    vi.stubGlobal("fetch", verify);
    const root = await mkdtemp(join(tmpdir(), "redrob-console-key-"));
    roots.push(root);

    const state = await saveLlmSettings(root, {
      inferenceRoute: "openrouter",
      llmProviders: {
        openai: { apiKey: "redrob_test_key_abcdefghijklmnopqrstuvwxyz" },
        openrouter: { apiKey: "vendor-key-must-not-be-stored" },
        anthropic: { apiKey: "vendor-key-must-not-be-stored" },
      },
    });

    expect(state.inferenceRoute).toBe("openai");
    expect(state.llmProviders).toEqual({
      openai: {
        apiKey: "redrob_test_key_abcdefghijklmnopqrstuvwxyz",
        baseUrl: REDROB_CONSOLE_API_BASE,
      },
    });
    expect(state.remote).toBeNull();
    expect(verify).toHaveBeenCalledWith(
      `${REDROB_CONSOLE_API_BASE}/models`,
      expect.objectContaining({
        headers: {
          authorization:
            "Bearer redrob_test_key_abcdefghijklmnopqrstuvwxyz",
        },
      }),
    );
  });

  it("rejects a key that Console does not accept", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response("{}", { status: 401 })),
    );
    const root = await mkdtemp(join(tmpdir(), "redrob-console-key-"));
    roots.push(root);

    await expect(
      saveLlmSettings(root, {
        llmProviders: {
          openai: { apiKey: "not-a-valid-console-key-but-long-enough" },
        },
      }),
    ).rejects.toThrow(/not accepted by console\.redrob\.ai/);

    expect((await loadSetupState(root)).llmProviders).toEqual({});
  });

  it("drops legacy vendor keys and custom server configuration on load", async () => {
    const root = await mkdtemp(join(tmpdir(), "redrob-console-key-"));
    roots.push(root);
    const { writeFile } = await import("node:fs/promises");
    await writeFile(
      join(root, "setup.json"),
      JSON.stringify({
        mode: "redrob_remote",
        inferenceRoute: "openrouter",
        llmProviders: {
          openrouter: { apiKey: "legacy-openrouter-key" },
          anthropic: { apiKey: "legacy-anthropic-key" },
        },
        remote: {
          baseUrl: "https://custom.example",
          apiKey: "legacy-remote-key",
          consentedAt: new Date().toISOString(),
        },
      }),
    );

    const state = await loadSetupState(root);
    expect(state.llmProviders).toEqual({});
    expect(state.remote).toBeNull();
    expect(state.mode).toBe("local");
  });

  it("rejects the removed custom inference server API", async () => {
    const root = await mkdtemp(join(tmpdir(), "redrob-console-key-"));
    roots.push(root);
    await expect(
      saveRemoteCredentials(root, {
        baseUrl: "https://custom.example",
        apiKey: "custom-key",
      }),
    ).rejects.toThrow(/console\.redrob\.ai/);
  });
});
