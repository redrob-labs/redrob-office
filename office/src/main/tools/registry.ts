import { z } from "zod";
import type { CloudToolDefinition } from "@redrob/kernel";
import { evaluateToolPolicy } from "../security/index.js";
import type { SecurityPolicyBundle } from "../security/types.js";
import { appFocusTool, appLaunchTool } from "./app-tools.js";
import { applyPatchTool, patchUndoTool } from "./apply-patch.js";
import { fsListTool, fsReadTool, fsWriteTool } from "./fs-tools.js";
import { netHttpPostTool } from "./net-tools.js";
import { webFetchTool, webSearchTool } from "./web-tools.js";
import { DESKTOP_TOOLS } from "./desktop-tools.js";
import { shellExecTool } from "./shell-tools.js";
import { OFFICE_TOOLS } from "./office-tools.js";
import { BRAIN_TOOLS } from "./brain-tools.js";
import { AGENT_TOOLS } from "./agent-tools.js";
import { WORKFLOW_TOOLS } from "./workflow-tools.js";
import { BROWSER_TOOLS } from "./browser-tools.js";
import { DOC_TOOLS } from "./docs/index.js";
import { getMcpManager } from "../services/mcp/manager.js";
import type { RegisteredTool, ToolContext, ToolResult, ToolRisk } from "./types.js";

const TOOLS: RegisteredTool[] = [
  fsReadTool,
  fsWriteTool,
  fsListTool,
  applyPatchTool,
  patchUndoTool,
  shellExecTool,
  appLaunchTool,
  appFocusTool,
  netHttpPostTool,
  webSearchTool,
  webFetchTool,
  ...OFFICE_TOOLS,
  ...BRAIN_TOOLS,
  ...AGENT_TOOLS,
  ...WORKFLOW_TOOLS,
  ...BROWSER_TOOLS,
  ...DOC_TOOLS,
  ...DESKTOP_TOOLS,
];

const byName = new Map(TOOLS.map((t) => [t.name, t]));

export function listComputerTools(): RegisteredTool[] {
  const mcpTools = getMcpManager().getRegisteredTools();
  return [...TOOLS, ...mcpTools];
}

export function getComputerTool(name: string): RegisteredTool | undefined {
  const staticTool = byName.get(name);
  if (staticTool) return staticTool;
  if (name.startsWith("mcp__")) {
    const mcpTools = getMcpManager().getRegisteredTools();
    return mcpTools.find((t) => t.name === name);
  }
  return undefined;
}

/**
 * One registered tool as a provider tool definition.
 *
 * The single place a tool's schema becomes a cloud definition, so callers that
 * only want a subset (e.g. general chat exposing `memory.manage`) never
 * hand-copy the parameters and drift from the Zod source of truth.
 */
export function registryToolCloudDefinition(
  name: string,
): CloudToolDefinition | undefined {
  const tool = getComputerTool(name);
  if (!tool) return undefined;
  // If tool is an MCP tool, its schema is already dynamic or we build it
  if (name.startsWith("mcp__")) {
    const mcpTool = getMcpManager().listAllTools().find((t) => t.fullName === name);
    if (mcpTool) {
      const params = (mcpTool.inputSchema && typeof mcpTool.inputSchema === "object"
        ? mcpTool.inputSchema
        : { type: "object", properties: {} }) as Record<string, unknown>;
      const { $schema: _s, ...cleanParams } = params;
      return {
        name: mcpTool.fullName,
        description: `[MCP: ${mcpTool.serverName}] ${mcpTool.description} [risk=${tool.risk}]`,
        parameters: {
          type: "object",
          ...(cleanParams as object),
        } as CloudToolDefinition["parameters"],
      };
    }
  }
  // Anthropic validates against JSON Schema draft 2020-12 and rejects the
  // whole tool list if one schema is off. The OpenAPI 3.0 target writes
  // z.positive() as draft-4's `exclusiveMinimum: true`, where 2020-12 wants
  // the number itself.
  //
  // `io: "input"` matters for any strict schema validator downstream: Zod's output schema
  // puts `.default()` fields in `required`, so a call like
  // `app.launch({ target: "mousepad" })` is rejected for missing `args` even
  // though the handler defaults it. The input schema keeps defaults optional.
  const json = z.toJSONSchema(tool.inputSchema, {
    target: "draft-2020-12",
    io: "input",
  }) as Record<string, unknown>;
  const { $schema: _s, ...parameters } = json;
  return {
    name: tool.name,
    description: `${tool.description} [risk=${tool.risk}]`,
    parameters: parameters as CloudToolDefinition["parameters"],
  };
}

/**
 * "Inside an allowed folder" is not an address.
 *
 * A path tool is unusable by a model that was never told which paths exist: asked
 * to write a file, it picks somewhere plausible, the sandbox refuses it, and it
 * reports back that it cannot write files at all. The folder list lives in the
 * policy, so it is added to the schema the model reads rather than to a system
 * prompt — that way every loop driving this registry gets it, including ones that
 * bring a system prompt of their own.
 *
 * Which tools need it is read off the schema: taking a `path` is what makes a
 * tool care where the sandbox is.
 */
function withWorkspaceRoots(
  definition: CloudToolDefinition,
  policy: SecurityPolicyBundle,
): CloudToolDefinition {
  const roots = policy.sandbox.workspaceRoots;
  if (roots.length === 0) return definition;
  const properties = (definition.parameters as { properties?: Record<string, unknown> })
    .properties;
  if (!properties || !("path" in properties)) return definition;
  return {
    ...definition,
    description:
      `${definition.description} Allowed folder${roots.length === 1 ? "" : "s"}: ` +
      `${roots.join(", ")}. Pass an absolute path inside one of them; anywhere else is refused.`,
  };
}

export function computerToolsAsCloudDefinitions(
  policy?: SecurityPolicyBundle,
): CloudToolDefinition[] {
  return listComputerTools()
    .filter((tool) => {
      if (!policy) return true;
      return evaluateToolPolicy(tool.name, policy).allowed;
    })
    .map((tool) => registryToolCloudDefinition(tool.name))
    .filter((def): def is CloudToolDefinition => Boolean(def))
    .map((def) => (policy ? withWorkspaceRoots(def, policy) : def));
}

export async function executeComputerTool(
  name: string,
  rawArgs: Record<string, unknown>,
  ctx: ToolContext,
): Promise<{ risk: ToolRisk; result: ToolResult }> {
  const tool = getComputerTool(name);
  if (!tool) {
    return {
      risk: "high",
      result: { ok: false, summary: `Unknown tool: ${name}`, error: "Unknown tool" },
    };
  }
  if (ctx.policy) {
    const decision = evaluateToolPolicy(name, ctx.policy, rawArgs);
    if (!decision.allowed) {
      return {
        risk: tool.risk,
        result: {
          ok: false,
          summary: decision.reason || "Denied by policy",
          error: decision.reason || "Denied by policy",
        },
      };
    }
  }
  const parsed = tool.inputSchema.safeParse(rawArgs);
  if (!parsed.success) {
    return {
      risk: tool.risk,
      result: {
        ok: false,
        summary: "Invalid arguments",
        error: parsed.error.message,
      },
    };
  }
  if (ctx.signal?.aborted) {
    return {
      risk: tool.risk,
      result: { ok: false, summary: "Aborted", error: "Aborted" },
    };
  }
  try {
    const result = await tool.handler(parsed.data, ctx);
    return { risk: tool.risk, result };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return {
      risk: tool.risk,
      result: { ok: false, summary: message, error: message },
    };
  }
}
