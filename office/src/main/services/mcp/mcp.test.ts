import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { McpManager } from "./manager.js";
import { McpClient } from "./client.js";
import { MCP_HUB_CATALOG, mcpInstallTarget } from "../../../shared/mcp.js";
import { getComputerTool, listComputerTools, registryToolCloudDefinition } from "../../tools/registry.js";
import { toolGroupOf } from "../../security/tool-groups.js";

describe("McpManager & MCP Client", () => {
  let tmpDir = "";

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), "redrob-mcp-test-"));
  });

  afterEach(() => {
    if (tmpDir) {
      rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it("saves, loads, and manages MCP server configurations", async () => {
    const manager = new McpManager();
    await manager.initialize(tmpDir);

    expect(manager.listServers()).toEqual([]);

    const created = await manager.addServer({
      name: "Figma",
      transport: "stdio",
      command: "node",
      args: ["-e", "console.log('figma')"],
      description: "Figma Design Tools",
      enabled: false,
    });

    expect(created.name).toBe("Figma");
    expect(created.transport).toBe("stdio");
    expect(created.enabled).toBe(false);

    const list = manager.listServers();
    expect(list.length).toBe(1);
    expect(list[0]?.name).toBe("Figma");

    // Update server
    const updated = await manager.updateServer(created.id, {
      description: "Updated Figma Tools",
    });
    expect(updated?.description).toBe("Updated Figma Tools");

    // Remove server
    const removed = await manager.removeServer(created.id);
    expect(removed).toBe(true);
    expect(manager.listServers().length).toBe(0);
  });

  it("hands back a saved server without waiting for its handshake", async () => {
    const manager = new McpManager();
    await manager.initialize(tmpDir);

    // A command that never speaks MCP: the handshake can only end in a timeout.
    // Save still has to return, and it has to say the server is connecting.
    const started = Date.now();
    const created = await manager.addServer({
      name: "Slow server",
      transport: "stdio",
      command: process.execPath,
      args: ["-e", "setTimeout(() => {}, 60_000)"],
      enabled: true,
    });

    expect(Date.now() - started).toBeLessThan(5_000);
    expect(created.status).toBe("connecting");
    expect(manager.beginConnect("no-such-server")).toBeNull();

    await manager.removeServer(created.id);
  });

  it("offers only invocations that can actually be run", () => {
    expect(MCP_HUB_CATALOG.length).toBeGreaterThan(0);

    const ids = MCP_HUB_CATALOG.map((item) => item.id);
    expect(new Set(ids).size).toBe(ids.length);

    for (const item of MCP_HUB_CATALOG) {
      expect(item.name.length, item.id).toBeGreaterThan(0);
      expect(item.description.length, item.id).toBeGreaterThan(0);
      expect(item.author.length, item.id).toBeGreaterThan(0);

      if (item.transport === "stdio") {
        expect(item.command, item.id).toBeTruthy();
        expect(item.args?.length, item.id).toBeGreaterThan(0);
      } else {
        expect(item.url, item.id).toMatch(/^https?:\/\//);
      }

      // The first-generation reference servers are archived and marked
      // deprecated on npm; two of the names never existed at all. Installing
      // one of those is a dead end, so the catalog must not name them.
      for (const arg of item.args ?? []) {
        expect(arg, item.id).not.toMatch(/^@modelcontextprotocol\/server-/);
      }
    }

    // At least one server has to be usable without going to fetch a credential
    // first, or the store cannot be tried at all.
    expect(MCP_HUB_CATALOG.some((item) => !item.envTemplate)).toBe(true);
  });

  it("offers background messaging integrations with bounded defaults", () => {
    const messaging = MCP_HUB_CATALOG.filter(
      (item) => item.category === "communication",
    );
    expect(messaging.map((item) => item.id)).toEqual([
      "slack",
      "discord",
      "whatsapp",
    ]);
    expect(messaging.every((item) => item.transport === "stdio")).toBe(true);
    expect(
      messaging.every((item) => item.docsUrl?.startsWith("https://")),
    ).toBe(true);
    expect(
      messaging.find((item) => item.id === "slack")?.envTemplate
        ?.SLACK_MCP_TOOLS,
    ).toBe("essentials");
    expect(
      messaging.find((item) => item.id === "discord")?.envTemplate
        ?.DISCORD_MCP_TOOLSETS,
    ).toBe("discovery,messages,dm");
  });

  it("names a server's tools after the server, not after its generated id", async () => {
    const manager = new McpManager();
    await manager.initialize(tmpDir);

    const a = await manager.addServer({
      name: "Chrome DevTools",
      transport: "stdio",
      command: "node",
      enabled: false,
    });
    const b = await manager.addServer({
      name: "Chrome DevTools",
      transport: "stdio",
      command: "node",
      enabled: false,
    });

    const prefixOf = (id: string) =>
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (manager as any).toolPrefixFor((manager as any).configs.find((c: any) => c.id === id));

    expect(prefixOf(a.id)).toMatch(/^Chrome_DevTools/);
    // Two servers with one name would otherwise claim the same tool names.
    expect(prefixOf(a.id)).not.toBe(prefixOf(b.id));

    const client = new McpClient({
      id: a.id,
      name: "Chrome DevTools",
      transport: "stdio",
      enabled: true,
      command: "node",
    });
    expect(client.toolPrefix).toBe("Chrome_DevTools");
  });

  it("reconfigures an installed hub entry instead of installing it twice", () => {
    const installed = [
      { id: "mcp_1786949489164_0x21t", name: "Chrome DevTools" },
      { id: "mcp_1786950146132_hpfa3", name: "Figma" },
    ];

    // The second press of a hub button has to land on the server already there;
    // a second copy under the same name is what forces tool names to carry a
    // slice of an internal id.
    expect(mcpInstallTarget(installed, "Chrome DevTools")).toBe(
      "mcp_1786949489164_0x21t",
    );
    expect(mcpInstallTarget(installed, "chrome devtools ")).toBe(
      "mcp_1786949489164_0x21t",
    );
    expect(mcpInstallTarget(installed, "Notion")).toBeNull();
    expect(mcpInstallTarget([], "Figma")).toBeNull();
  });

  it("correctly routes toolGroupOf for MCP tools to network group", () => {
    expect(toolGroupOf("mcp__figma__get_file")).toBe("group:network");
    expect(toolGroupOf("mcp__github__create_issue")).toBe("group:network");
    expect(toolGroupOf("fs.read")).toBe("group:fs");
  });

  it("exposes registered MCP tools in registry and cloud definitions", async () => {
    const manager = new McpManager();
    await manager.initialize(tmpDir);

    // Create a mock server client with active tools
    const client = new McpClient({
      id: "figma",
      name: "Figma",
      transport: "stdio",
      enabled: true,
      command: "node",
    });
    client.status = "connected";
    client.tools = [
      {
        name: "get_file",
        fullName: "mcp__figma__get_file",
        serverId: "figma",
        serverName: "Figma",
        description: "Get Figma file JSON by key",
        inputSchema: {
          type: "object",
          properties: {
            fileKey: { type: "string" },
          },
          required: ["fileKey"],
        },
      },
    ];

    // Inject into manager clients map
    (manager as any).clients.set("figma", client);

    const registeredTools = manager.getRegisteredTools();
    expect(registeredTools.length).toBe(1);
    expect(registeredTools[0]?.name).toBe("mcp__figma__get_file");
    expect(registeredTools[0]?.risk).toBe("high");

    const allTools = manager.listAllTools();
    expect(allTools.length).toBe(1);
    expect(allTools[0]?.name).toBe("get_file");
    expect(allTools[0]?.fullName).toBe("mcp__figma__get_file");
  });
});
