/**
 * Minimal Model Context Protocol (MCP) JSON-RPC client over Stdio and SSE/HTTP.
 *
 * Implements MCP 2024-11-05 spec:
 * - initialize handshake
 * - tools/list
 * - tools/call
 *
 * Designed with no heavy external dependencies; handles child process lifecycle,
 * JSON-RPC framing (Content-Length header or newline-delimited JSON for stdio),
 * SSE message streams, and error boundaries.
 */

import { spawn, type ChildProcess } from "node:child_process";
import { EventEmitter } from "node:events";
import {
  mcpToolSlug,
  type McpServerConfig,
  type McpServerStatus,
  type McpToolView,
} from "../../../shared/mcp.js";

export interface JsonRpcRequest {
  jsonrpc: "2.0";
  id: string | number;
  method: string;
  params?: Record<string, unknown>;
}

export interface JsonRpcResponse {
  jsonrpc: "2.0";
  id: string | number;
  result?: unknown;
  error?: {
    code: number;
    message: string;
    data?: unknown;
  };
}

export interface McpRawTool {
  name: string;
  description?: string;
  inputSchema?: Record<string, unknown>;
}

export interface McpToolCallResult {
  ok: boolean;
  content: Array<{ type: string; text?: string; data?: string; mimeType?: string }>;
  isError?: boolean;
}

export class McpClient extends EventEmitter {
  public status: McpServerStatus = "disconnected";
  public error?: string | undefined;
  public tools: McpToolView[] = [];

  /**
   * What this server's tools are grouped under, as in the `Chrome_DevTools` of
   * `mcp__Chrome_DevTools__new_page`. The manager overrides it, since only the
   * manager can see whether another server would claim the same prefix.
   */
  public toolPrefix: string;

  private childProcess: ChildProcess | null = null;
  private nextRequestId = 1;
  private pendingRequests = new Map<
    string | number,
    {
      resolve: (value: unknown) => void;
      reject: (err: Error) => void;
      timer: NodeJS.Timeout;
    }
  >();
  private stdoutBuffer = "";
  private sseAbortController: AbortController | null = null;
  private sseEndpoint: string | null = null;

  constructor(public readonly config: McpServerConfig) {
    super();
    this.toolPrefix = mcpToolSlug(config.name) || mcpToolSlug(config.id);
  }

  public async connect(): Promise<void> {
    if (this.status === "connecting" || this.status === "connected") return;

    this.status = "connecting";
    this.error = undefined;
    this.emit("status", this.status);

    try {
      if (this.config.transport === "stdio") {
        await this.connectStdio();
      } else if (this.config.transport === "sse") {
        await this.connectSse();
      } else {
        throw new Error(`Unsupported transport: ${String(this.config.transport)}`);
      }

      await this.initializeHandshake();
      await this.refreshTools();

      this.status = "connected";
      this.error = undefined;
      this.emit("status", this.status);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.status = "error";
      this.error = message;
      this.emit("status", this.status, message);
      this.disconnect();
      throw err;
    }
  }

  public disconnect(): void {
    for (const [id, req] of this.pendingRequests.entries()) {
      clearTimeout(req.timer);
      req.reject(new Error("MCP Client disconnected"));
      this.pendingRequests.delete(id);
    }

    if (this.childProcess) {
      try {
        this.childProcess.kill("SIGTERM");
      } catch {
        /* ignore */
      }
      this.childProcess = null;
    }

    if (this.sseAbortController) {
      this.sseAbortController.abort();
      this.sseAbortController = null;
    }

    this.status = "disconnected";
    this.tools = [];
    this.emit("status", this.status);
  }

  public async callTool(
    toolName: string,
    args: Record<string, unknown>,
    timeoutMs = 60_000,
  ): Promise<McpToolCallResult> {
    if (this.status !== "connected") {
      throw new Error(`MCP server "${this.config.name}" is not connected (${this.status})`);
    }

    const res = (await this.sendRequest(
      "tools/call",
      {
        name: toolName,
        arguments: args,
      },
      timeoutMs,
    )) as {
      content?: Array<{ type: string; text?: string; data?: string; mimeType?: string }>;
      isError?: boolean;
    };

    const content = Array.isArray(res?.content) ? res.content : [{ type: "text", text: JSON.stringify(res) }];
    const isError = Boolean(res?.isError);

    return {
      ok: !isError,
      content,
      isError,
    };
  }

  public async refreshTools(): Promise<McpToolView[]> {
    const res = (await this.sendRequest("tools/list", {})) as {
      tools?: McpRawTool[];
    };

    const rawTools = Array.isArray(res?.tools) ? res.tools : [];
    this.tools = rawTools.map((raw) => {
      const fullName = `mcp__${this.toolPrefix}__${mcpToolSlug(raw.name)}`;

      return {
        name: raw.name,
        fullName,
        serverId: this.config.id,
        serverName: this.config.name,
        description: raw.description ?? `MCP tool ${raw.name} from ${this.config.name}`,
        inputSchema: raw.inputSchema && typeof raw.inputSchema === "object" ? raw.inputSchema : { type: "object", properties: {} },
      };
    });

    this.emit("tools", this.tools);
    return this.tools;
  }

  private async initializeHandshake(): Promise<void> {
    const initResult = await this.sendRequest("initialize", {
      protocolVersion: "2024-11-05",
      capabilities: {
        tools: {},
      },
      clientInfo: {
        name: "redrob-office",
        version: "0.0.1",
      },
    });

    // Send initialized notification (no reply expected)
    await this.sendNotification("notifications/initialized", {});
  }

  private connectStdio(): Promise<void> {
    return new Promise((resolve, reject) => {
      if (!this.config.command) {
        return reject(new Error("Missing command for stdio MCP server"));
      }

      const args = this.config.args ?? [];
      const env = {
        ...process.env,
        ...(this.config.env ?? {}),
      };

      try {
        const child = spawn(this.config.command, args, {
          env,
          stdio: ["pipe", "pipe", "pipe"],
          shell: false,
        });

        this.childProcess = child;

        child.on("error", (err) => {
          this.emit("error", err);
          if (this.status === "connecting") {
            reject(err);
          }
        });

        child.on("exit", (code, signal) => {
          if (this.status === "connected" || this.status === "connecting") {
            this.status = "disconnected";
            this.error = `Process exited with code ${code} (${signal ?? "none"})`;
            this.emit("status", this.status, this.error);
          }
        });

        child.stdout?.on("data", (chunk: Buffer) => {
          this.handleStdoutChunk(chunk.toString("utf8"));
        });

        child.stderr?.on("data", (chunk: Buffer) => {
          // Log stderr
          const text = chunk.toString("utf8").trim();
          if (text) {
            this.emit("stderr", text);
          }
        });

        resolve();
      } catch (err) {
        reject(err);
      }
    });
  }

  private handleStdoutChunk(chunk: string): void {
    this.stdoutBuffer += chunk;

    // Check for JSON-RPC messages separated by newlines or Content-Length framing
    while (this.stdoutBuffer.length > 0) {
      // 1. Content-Length framing (LSP / MCP standard)
      if (this.stdoutBuffer.startsWith("Content-Length:")) {
        const headerEnd = this.stdoutBuffer.indexOf("\r\n\r\n");
        const altHeaderEnd = this.stdoutBuffer.indexOf("\n\n");
        const sepIndex = headerEnd !== -1 ? headerEnd : altHeaderEnd;
        const sepLen = headerEnd !== -1 ? 4 : 2;

        if (sepIndex === -1) break; // Incomplete header

        const header = this.stdoutBuffer.slice(0, sepIndex);
        const match = /Content-Length:\s*(\d+)/i.exec(header);
        if (!match) {
          // Malformed header, skip
          this.stdoutBuffer = this.stdoutBuffer.slice(sepIndex + sepLen);
          continue;
        }

        const length = parseInt(match[1]!, 10);
        const bodyStart = sepIndex + sepLen;
        if (this.stdoutBuffer.length < bodyStart + length) {
          break; // Incomplete message body
        }

        const body = this.stdoutBuffer.slice(bodyStart, bodyStart + length);
        this.stdoutBuffer = this.stdoutBuffer.slice(bodyStart + length);
        this.processIncomingMessage(body);
        continue;
      }

      // 2. Line-delimited JSON
      const newlineIndex = this.stdoutBuffer.indexOf("\n");
      if (newlineIndex === -1) {
        // Maybe buffer has a full JSON object without newline?
        const trimmed = this.stdoutBuffer.trim();
        if (trimmed.startsWith("{") && trimmed.endsWith("}")) {
          try {
            JSON.parse(trimmed);
            this.processIncomingMessage(trimmed);
            this.stdoutBuffer = "";
          } catch {
            // Incomplete
          }
        }
        break;
      }

      const line = this.stdoutBuffer.slice(0, newlineIndex).trim();
      this.stdoutBuffer = this.stdoutBuffer.slice(newlineIndex + 1);

      if (line) {
        this.processIncomingMessage(line);
      }
    }
  }

  private processIncomingMessage(raw: string): void {
    try {
      const msg = JSON.parse(raw) as JsonRpcResponse & { method?: string; params?: unknown };
      if (msg.id !== undefined && this.pendingRequests.has(msg.id)) {
        const pending = this.pendingRequests.get(msg.id)!;
        this.pendingRequests.delete(msg.id);
        clearTimeout(pending.timer);

        if (msg.error) {
          pending.reject(new Error(`MCP Error ${msg.error.code}: ${msg.error.message}`));
        } else {
          pending.resolve(msg.result);
        }
      } else if (msg.method) {
        // Notification from server
        this.emit("notification", msg.method, msg.params);
      }
    } catch {
      // Ignore unparseable frames
    }
  }

  private async connectSse(): Promise<void> {
    if (!this.config.url) {
      throw new Error("Missing URL for SSE MCP server");
    }

    const controller = new AbortController();
    this.sseAbortController = controller;

    // Connect to SSE stream endpoint
    const response = await fetch(this.config.url, {
      headers: {
        Accept: "text/event-stream",
      },
      signal: controller.signal,
    });

    if (!response.ok || !response.body) {
      throw new Error(`SSE connection failed: ${response.status} ${response.statusText}`);
    }

    // Start reading SSE stream in background
    this.startReadingSseStream(response.body, controller.signal);
  }

  private async startReadingSseStream(
    body: ReadableStream<Uint8Array>,
    signal: AbortSignal,
  ): Promise<void> {
    const reader = body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";

    try {
      while (!signal.aborted) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split(/\r?\n/);
        buffer = lines.pop() ?? "";

        let currentEvent = "";
        let currentData = "";

        for (const line of lines) {
          if (line.startsWith("event:")) {
            currentEvent = line.slice(6).trim();
          } else if (line.startsWith("data:")) {
            currentData += (currentData ? "\n" : "") + line.slice(5).trim();
          } else if (line === "") {
            // End of event block
            if (currentEvent === "endpoint" || (!currentEvent && currentData.startsWith("http"))) {
              // Endpoint to post messages to
              try {
                const endpointUrl = new URL(currentData, this.config.url).toString();
                this.sseEndpoint = endpointUrl;
              } catch {
                this.sseEndpoint = currentData;
              }
            } else if (currentEvent === "message" || currentData) {
              this.processIncomingMessage(currentData);
            }
            currentEvent = "";
            currentData = "";
          }
        }
      }
    } catch (err) {
      if (!signal.aborted) {
        this.status = "error";
        this.error = err instanceof Error ? err.message : String(err);
        this.emit("status", this.status, this.error);
      }
    }
  }

  private async sendRequest(
    method: string,
    params?: Record<string, unknown>,
    timeoutMs = 30_000,
  ): Promise<unknown> {
    const id = this.nextRequestId++;
    const request: JsonRpcRequest = {
      jsonrpc: "2.0",
      id,
      method,
      ...(params ? { params } : {}),
    };

    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pendingRequests.delete(id);
        reject(new Error(`MCP request "${method}" timed out after ${timeoutMs}ms`));
      }, timeoutMs);

      this.pendingRequests.set(id, { resolve, reject, timer });

      this.writeMessage(request).catch((err) => {
        this.pendingRequests.delete(id);
        clearTimeout(timer);
        reject(err);
      });
    });
  }

  private async sendNotification(
    method: string,
    params?: Record<string, unknown>,
  ): Promise<void> {
    const message = {
      jsonrpc: "2.0",
      method,
      ...(params ? { params } : {}),
    };
    await this.writeMessage(message);
  }

  private async writeMessage(message: unknown): Promise<void> {
    const raw = JSON.stringify(message);

    if (this.config.transport === "stdio") {
      if (!this.childProcess || !this.childProcess.stdin || !this.childProcess.stdin.writable) {
        throw new Error("Stdio process is not writable");
      }
      this.childProcess.stdin.write(`${raw}\n`);
    } else if (this.config.transport === "sse") {
      const targetUrl = this.sseEndpoint ?? this.config.url;
      if (!targetUrl) {
        throw new Error("No SSE POST endpoint available");
      }

      const res = await fetch(targetUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: raw,
      });

      if (!res.ok) {
        throw new Error(`SSE POST request failed: ${res.status} ${res.statusText}`);
      }
    }
  }
}
