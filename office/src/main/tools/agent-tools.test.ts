import { describe, expect, it } from "vitest";
import {
  agentsDelegateTool,
  delegateToAgents,
  formatAgentResults,
} from "./agent-tools.js";
import { listComputerTools } from "./registry.js";

describe("delegateToAgents", () => {
  it("runs independent assignments concurrently and keeps access explicit", async () => {
    const releases: Array<() => void> = [];
    let started = 0;
    const running = delegateToAgents(
      [
        { task: "Read the pricing notes", permission: "read" },
        { task: "Write the comparison table", permission: "write" },
      ],
      {
        run: async (assignment) => {
          started += 1;
          await new Promise<void>((resolve) => releases.push(resolve));
          return {
            text: `${assignment.permission} result`,
            artifactIds: assignment.permission === "write" ? ["comparison.xlsx"] : [],
          };
        },
      },
    );

    // Both promises reached their wait before either was released.
    await Promise.resolve();
    await Promise.resolve();
    expect(started).toBe(2);
    for (const release of releases) release();

    await expect(running).resolves.toEqual([
      {
        id: "agent-1",
        permission: "read",
        task: "Read the pricing notes",
        text: "read result",
        ok: true,
        artifactIds: [],
      },
      {
        id: "agent-2",
        permission: "write",
        task: "Write the comparison table",
        text: "write result",
        ok: true,
        artifactIds: ["comparison.xlsx"],
      },
    ]);
  });

  it("reports one failed run without losing the other agent's result", async () => {
    const results = await delegateToAgents(
      [
        { task: "Read source one", permission: "read" },
        { task: "Read source two", permission: "read" },
      ],
      {
        run: async (_assignment, index) => {
          if (index === 0) throw new Error("source unavailable");
          return { text: "source two says 42", artifactIds: [] };
        },
      },
    );
    expect(results.map((result) => result.ok)).toEqual([false, true]);
    expect(results[0]!.text).toBe("source unavailable");
    expect(results[1]!.text).toBe("source two says 42");
  });

  it("streams generic agent ids, not org-chart roles", async () => {
    const progress: string[] = [];
    await delegateToAgents(
      [
        { task: "Inspect the first file", permission: "read" },
        { task: "Inspect the second file", permission: "read" },
      ],
      {
        run: async () => ({ text: "done", artifactIds: [] }),
        onProgress: (line) => progress.push(line),
      },
    );
    expect(progress).toContain("agent-1 finished");
    expect(progress).toContain("agent-2 finished");
    expect(progress.join(" ")).not.toMatch(
      /\b(manager|writer|reviewer|researcher|publisher|seat|floor)\b/i,
    );
  });
});

describe("formatAgentResults", () => {
  it("names access and files without assigning roles", () => {
    const text = formatAgentResults([
      {
        id: "agent-1",
        permission: "write",
        task: "Make the file",
        text: "Created it.",
        ok: true,
        artifactIds: ["brief.docx"],
      },
    ]);
    expect(text).toContain("agent-1 [write] finished");
    expect(text).toContain("Files: brief.docx");
    expect(text).not.toMatch(/\b(manager|writer|reviewer|seat|floor)\b/i);
  });
});

describe("agentsDelegateTool", () => {
  it("requires at least two explicit assignments and accepts permission tiers", () => {
    expect(
      agentsDelegateTool.inputSchema.safeParse({
        assignments: [{ task: "Only one independent task", permission: "read" }],
      }).success,
    ).toBe(false);
    expect(
      agentsDelegateTool.inputSchema.safeParse({
        assignments: [
          { task: "Read the first source", permission: "read" },
          { task: "Create a comparison document", permission: "write" },
        ],
      }).success,
    ).toBe(true);
    expect(agentsDelegateTool.name).toBe("agents.delegate");
    expect(agentsDelegateTool.risk).toBe("high");
    expect(agentsDelegateTool.description).not.toMatch(
      /\b(manager|writer|reviewer|researcher|publisher|seat|floor)\b/i,
    );
  });

  it("replaces the role-based team tool in the shared registry", () => {
    const names = listComputerTools().map((tool) => tool.name);
    expect(names).toContain("agents.delegate");
    expect(names).not.toContain("team.assign");
  });
});
