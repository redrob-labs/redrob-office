/**
 * MCP Server Manager.
 *
 * Coordinates configured MCP servers:
 * - Persists and loads configs from `userData/mcp-servers.json`
 * - Starts / stops McpClient instances
 * - Exposes active tools as RegisteredTool objects for the app's tool registry
 * - Handles auto-connect on startup
 */

import { existsSync } from "node:fs";
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { EventEmitter } from "node:events";
import { z } from "zod";
import { nowMs } from "../../app-time.js";
import {
  mcpToolSlug,
  type McpConfigState,
  type McpServerConfig,
  type McpServerView,
  type McpToolView,
} from "../../../shared/mcp.js";
import type { RegisteredTool, ToolResult } from "../../tools/types.js";
import { McpClient } from "./client.js";

const MCP_CONFIG_FILE = "mcp-servers.json";

export class McpManager extends EventEmitter {
  private clients = new Map<string, McpClient>();
  private configs: McpServerConfig[] = [];
  private userDataPath: string = "";

  constructor() {
    super();
  }

  public async initialize(userDataPath: string): Promise<void> {
    this.userDataPath = userDataPath;
    await this.loadConfig();

    // Auto-connect enabled servers
    for (const server of this.configs) {
      if (server.enabled && server.autoConnect !== false) {
        this.startConnect(server.id);
      }
    }
  }

  public async loadConfig(): Promise<McpConfigState> {
    if (!this.userDataPath) return { servers: [] };
    const filePath = join(this.userDataPath, MCP_CONFIG_FILE);

    if (!existsSync(filePath)) {
      this.configs = [];
      return { servers: [] };
    }

    try {
      const raw = await readFile(filePath, "utf8");
      const parsed = JSON.parse(raw) as McpConfigState;
      this.configs = Array.isArray(parsed?.servers) ? parsed.servers : [];
      return { servers: this.configs };
    } catch (err) {
      console.error("[mcp] Failed to parse mcp-servers.json:", err);
      this.configs = [];
      return { servers: [] };
    }
  }

  public async saveConfig(): Promise<void> {
    if (!this.userDataPath) return;
    const filePath = join(this.userDataPath, MCP_CONFIG_FILE);
    const state: McpConfigState = { servers: this.configs };
    await writeFile(filePath, JSON.stringify(state, null, 2), "utf8");
    this.emit("change");
  }

  public listServers(): McpServerView[] {
    return this.configs.map((cfg) => {
      const client = this.clients.get(cfg.id);
      return {
        id: cfg.id,
        name: cfg.name,
        enabled: cfg.enabled,
        transport: cfg.transport,
        command: cfg.command,
        args: cfg.args,
        env: cfg.env,
        url: cfg.url,
        description: cfg.description,
        status: client ? client.status : "disconnected",
        error: client?.error,
        tools: client ? client.tools : [],
      };
    });
  }

  public async addServer(config: Omit<McpServerConfig, "id"> & { id?: string }): Promise<McpServerView> {
    const id = config.id?.trim() || `mcp_${nowMs()}_${Math.random().toString(36).slice(2, 7)}`;
    const newConfig: McpServerConfig = {
      id,
      name: config.name.trim(),
      enabled: config.enabled ?? true,
      transport: config.transport,
      command: config.command?.trim(),
      args: config.args ?? [],
      env: config.env ?? {},
      url: config.url?.trim(),
      description: config.description?.trim(),
      autoConnect: config.autoConnect ?? true,
    };

    // Replace if exists, else append
    const existingIndex = this.configs.findIndex((c) => c.id === id);
    if (existingIndex >= 0) {
      this.configs[existingIndex] = newConfig;
    } else {
      this.configs.push(newConfig);
    }

    await this.saveConfig();

    if (newConfig.enabled) {
      this.startConnect(id);
    }

    const views = this.listServers();
    return views.find((v) => v.id === id)!;
  }

  /**
   * Start the handshake and return at once.
   *
   * Connecting can take tens of seconds — `npx` may have to fetch the package
   * before the server even starts, and a wrong credential is only found out at
   * the far end of a 30s request timeout. The caller is a person who just
   * pressed Save, so the config is written and the list reports `connecting`
   * and then the outcome; nothing is hidden by not waiting here.
   *
   * `connectServer` registers the client and marks it `connecting` before its
   * first `await`, so a `listServers()` right after this call already shows the
   * new state.
   */
  private startConnect(id: string): void {
    void this.connectServer(id).catch((err) => {
      console.warn(`[mcp] Failed to connect ${id}:`, err);
    });
  }

  /**
   * The prefix a server's tools are exposed under.
   *
   * Taken from what the person named the server, so `mcp__Chrome_DevTools__…`
   * is what a model and an approval prompt see. Two servers sharing a name
   * would claim the same tool names, so in that case both keep a tail of their
   * own id to tell them apart.
   */
  private toolPrefixFor(config: McpServerConfig): string {
    const base = mcpToolSlug(config.name) || mcpToolSlug(config.id);
    const shared = this.configs.some(
      (other) =>
        other.id !== config.id &&
        (mcpToolSlug(other.name) || mcpToolSlug(other.id)) === base,
    );
    return shared ? `${base}_${mcpToolSlug(config.id).slice(-5)}` : base;
  }

  /** Start connecting and report the state as it stands right now. */
  public beginConnect(id: string): McpServerView | null {
    if (!this.configs.some((c) => c.id === id)) return null;
    this.startConnect(id);
    return this.listServers().find((v) => v.id === id) ?? null;
  }

  public async updateServer(
    id: string,
    updates: Partial<Omit<McpServerConfig, "id">>,
  ): Promise<McpServerView | null> {
    const index = this.configs.findIndex((c) => c.id === id);
    if (index < 0) return null;

    const current = this.configs[index]!;
    const next: McpServerConfig = {
      ...current,
      ...updates,
      id: current.id,
    };

    this.configs[index] = next;
    await this.saveConfig();

    // Reconnect if config changed and is connected
    const client = this.clients.get(id);
    if (client) {
      client.disconnect();
      this.clients.delete(id);
    }

    if (next.enabled) {
      this.startConnect(id);
    }

    const views = this.listServers();
    return views.find((v) => v.id === id) ?? null;
  }

  public async removeServer(id: string): Promise<boolean> {
    const index = this.configs.findIndex((c) => c.id === id);
    if (index < 0) return false;

    const client = this.clients.get(id);
    if (client) {
      client.disconnect();
      this.clients.delete(id);
    }

    this.configs.splice(index, 1);
    await this.saveConfig();
    return true;
  }

  public async connectServer(id: string): Promise<McpServerView | null> {
    const config = this.configs.find((c) => c.id === id);
    if (!config) return null;

    let client = this.clients.get(id);
    if (client) {
      if (client.status === "connected") {
        const views = this.listServers();
        return views.find((v) => v.id === id) ?? null;
      }
      client.disconnect();
    }

    client = new McpClient(config);
    client.toolPrefix = this.toolPrefixFor(config);
    this.clients.set(id, client);

    client.on("status", () => {
      this.emit("change");
    });
    client.on("tools", () => {
      this.emit("tools-updated");
      this.emit("change");
    });

    try {
      await client.connect();
    } catch (err) {
      console.error(`[mcp] Failed to connect to server "${config.name}":`, err);
    }

    const views = this.listServers();
    return views.find((v) => v.id === id) ?? null;
  }

  public async disconnectServer(id: string): Promise<McpServerView | null> {
    const client = this.clients.get(id);
    if (client) {
      client.disconnect();
      this.clients.delete(id);
    }

    const views = this.listServers();
    return views.find((v) => v.id === id) ?? null;
  }

  public listAllTools(): McpToolView[] {
    const tools: McpToolView[] = [];
    for (const client of this.clients.values()) {
      if (client.status === "connected") {
        tools.push(...client.tools);
      }
    }
    return tools;
  }

  public async callTool(
    fullName: string,
    args: Record<string, unknown>,
  ): Promise<ToolResult> {
    for (const client of this.clients.values()) {
      if (client.status !== "connected") continue;
      const target = client.tools.find((t) => t.fullName === fullName || t.name === fullName);
      if (target) {
        try {
          const res = await client.callTool(target.name, args);
          const textParts = res.content
            .map((c) => (c.type === "text" ? c.text : JSON.stringify(c)))
            .filter(Boolean)
            .join("\n");

          return {
            ok: res.ok,
            summary: res.ok
              ? `MCP ${target.serverName}:${target.name} executed successfully`
              : `MCP ${target.serverName}:${target.name} reported an error`,
            data: {
              server: target.serverName,
              tool: target.name,
              content: res.content,
              text: textParts,
            },
            ...(res.ok ? {} : { error: textParts || "Tool reported failure" }),
          };
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          return {
            ok: false,
            summary: `MCP ${target.serverName}:${target.name} call failed: ${message}`,
            error: message,
          };
        }
      }
    }

    return {
      ok: false,
      summary: `MCP tool "${fullName}" not found on any active server`,
      error: `Tool not found: ${fullName}`,
    };
  }

  /**
   * Produce dynamic RegisteredTool instances for the registry.
   */
  public getRegisteredTools(): RegisteredTool[] {
    const allTools = this.listAllTools();
    return allTools.map((t) => {
      return {
        name: t.fullName,
        description: `[MCP: ${t.serverName}] ${t.description}`,
        risk: "high",
        inputSchema: z.record(z.string(), z.unknown()).or(z.object({})),
        handler: async (args: Record<string, unknown>) => {
          return this.callTool(t.fullName, args);
        },
      };
    });
  }
}

let sharedMcpManager: McpManager | null = null;

export function getMcpManager(): McpManager {
  if (!sharedMcpManager) {
    sharedMcpManager = new McpManager();
  }
  return sharedMcpManager;
}
