import { describe, expect, it } from "vitest";
import type { WorkflowDefinition } from "@redrob/registry";
import { FLOW_PROMPT_LIMIT, formatFlowsBlock } from "./workflow-prompt.js";

function flow(index: number, overrides: Partial<WorkflowDefinition> = {}): WorkflowDefinition {
  return {
    id: `recruiting/flow-${index}`,
    version: 1,
    title: `Flow ${index}`,
    workspaceId: "recruiting",
    steps: [
      { id: "step-1", engine: "process", action: "jd", title: "Draft the job post" },
      { id: "step-2", engine: "lookup", action: "intake", title: "Bring in resumes" },
      { id: "step-3", engine: "review", action: "verify", title: "Check credentials" },
    ],
    updatedAt: "2026-08-16T00:00:00.000Z",
    ...overrides,
  };
}

describe("formatFlowsBlock", () => {
  it("says nothing when the person has no flows", () => {
    expect(formatFlowsBlock([])).toBeUndefined();
  });

  it("names each flow with id and description only — body stays behind execute", () => {
    const block = formatFlowsBlock([
      flow(1, {
        title: "Backend hiring",
        description: "Hire a backend engineer",
        instructions: "Long body that must not land in the prompt",
      }),
    ])!;

    expect(block).toContain("Backend hiring (id: recruiting/flow-1)");
    expect(block).toContain("Hire a backend engineer");
    expect(block).toContain("auto: jd→intake");
    expect(block).toContain("workflow.execute");
    expect(block).toContain("workflow.search");
    expect(block).not.toContain("Long body");
    expect(block).not.toContain("Draft the job post →");
  });

  it("stops naming flows once the list would start costing more than it is read", () => {
    const many = Array.from({ length: FLOW_PROMPT_LIMIT + 3 }, (_, index) =>
      flow(index + 1),
    );

    const block = formatFlowsBlock(many)!;

    expect(block).toContain(`Flow ${FLOW_PROMPT_LIMIT}`);
    expect(block).not.toContain(`Flow ${FLOW_PROMPT_LIMIT + 1}`);
  });
});
