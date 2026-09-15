import { z } from "zod";
import type { ToolPermission } from "../office/staff/team-members.js";
import type { RegisteredTool, ToolContext, ToolResult } from "./types.js";

/**
 * Independent agent runs, without job titles or a hierarchy.
 *
 * A fixed workflow chart used to be baked into the delegation path. The only
 * difference the runtime needs is concrete reach: which tools this run may
 * call. The parent supplies separate tasks and the least permission each one
 * needs; every item below is its own model context and tool loop.
 */

export interface AgentAssignment {
  task: string;
  permission: ToolPermission;
}

export interface AgentResult {
  id: string;
  permission: ToolPermission;
  task: string;
  text: string;
  ok: boolean;
  artifactIds: string[];
}

export interface DelegateDeps {
  run: (
    assignment: AgentAssignment,
    index: number,
  ) => Promise<{ text: string; artifactIds: string[] }>;
  onProgress?: (message: string) => void;
}

export async function delegateToAgents(
  assignments: readonly AgentAssignment[],
  deps: DelegateDeps,
): Promise<AgentResult[]> {
  return Promise.all(
    assignments.map(async (assignment, index) => {
      const id = `agent-${index + 1}`;
      deps.onProgress?.(
        `${id} started with ${assignment.permission} access: ${assignment.task.slice(0, 120)}`,
      );
      try {
        const outcome = await deps.run(assignment, index);
        deps.onProgress?.(`${id} finished`);
        return {
          id,
          permission: assignment.permission,
          task: assignment.task,
          text: outcome.text.trim() || "Finished without a written report.",
          ok: true,
          artifactIds: outcome.artifactIds,
        };
      } catch (error) {
        const text = error instanceof Error ? error.message : String(error);
        deps.onProgress?.(`${id} stopped: ${text.slice(0, 160)}`);
        return {
          id,
          permission: assignment.permission,
          task: assignment.task,
          text,
          ok: false,
          artifactIds: [],
        };
      }
    }),
  );
}

export function formatAgentResults(results: readonly AgentResult[]): string {
  return results
    .map((result) => {
      const files =
        result.artifactIds.length > 0
          ? `\nFiles: ${result.artifactIds.join(", ")}`
          : "";
      return `${result.id} [${result.permission}] ${result.ok ? "finished" : "failed"}\n${result.text}${files}`;
    })
    .join("\n\n");
}

const PERMISSIONS = ["read", "write", "full"] as const;

export const agentsDelegateTool: RegisteredTool = {
  name: "agents.delegate",
  description:
    "Run two or more independent agents in parallel, with no fixed roles or hierarchy. " +
    "Give each agent one self-contained task and the least access " +
    "it needs: read can inspect files and the web, write can also create or edit documents, " +
    "and full can additionally use apps, the shell, and desktop controls. Use separate calls " +
    "for dependent stages: first run the producing agents, then delegate a check using the " +
    "actual output. Do not invent role names in the tasks or results.",
  risk: "high",
  inputSchema: z.object({
    assignments: z
      .array(
        z.object({
          task: z
            .string()
            .min(8)
            .max(2000)
            .describe("One self-contained outcome for this independent agent"),
          permission: z
            .enum(PERMISSIONS)
            .describe("Least tool access this task needs: read, write, or full"),
        }),
      )
      .min(2)
      .max(6)
      .describe("Independent tasks that can run at the same time"),
  }),
  async handler(input, ctx: ToolContext): Promise<ToolResult> {
    // Loaded here to avoid registry → agent tool → computer runtime → registry
    // initialization cycling before AGENT_TOOLS has been assigned.
    const { runComputerUseTask } = await import("../services/computer-use.js");
    const assignments = input.assignments as AgentAssignment[];
    const results = await delegateToAgents(assignments, {
      run: (assignment, index) =>
        runComputerUseTask({
          userData: ctx.userDataPath,
          text: assignment.task,
          maxIterations: 12,
          ...(ctx.signal ? { signal: ctx.signal } : {}),
          chatId: `delegated-agent-${index + 1}`,
          agent: {
            id: `agent-${index + 1}`,
            permission: assignment.permission,
            // The outer high-risk approval names every task and access level.
            // Inner tool calls may therefore proceed inside that approved plan.
            preapproved: true,
          },
        }),
      ...(ctx.onProgress ? { onProgress: ctx.onProgress } : {}),
    });
    const ok = results.every((result) => result.ok);
    return {
      ok,
      summary: formatAgentResults(results),
      data: { agents: results },
      ...(ok ? {} : { error: "One or more delegated agents could not finish." }),
    };
  },
};

export const AGENT_TOOLS: RegisteredTool[] = [agentsDelegateTool];
