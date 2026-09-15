import { describe, expect, it } from "vitest";
import {
  validateWorkflow,
  WorkflowValidationError,
  WORKFLOW_LIMITS,
} from "./user-workflows.js";

function base(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: "recruiting/backend-hiring",
    version: 1,
    title: "Backend hiring",
    workspaceId: "recruiting",
    steps: [{ engine: "process", action: "jd", title: "Draft the job post" }],
    ...overrides,
  };
}

function code(value: unknown): string | undefined {
  try {
    validateWorkflow(value);
    return undefined;
  } catch (err) {
    return err instanceof WorkflowValidationError ? err.code : "not-structured";
  }
}

describe("validateWorkflow", () => {
  it("accepts a well-formed flow and keeps its description/instructions", () => {
    const flow = validateWorkflow(
      base({ description: "When to use", instructions: "How to do it" }),
    );
    expect(flow.title).toBe("Backend hiring");
    expect(flow.description).toBe("When to use");
    expect(flow.instructions).toBe("How to do it");
    expect(flow.steps).toHaveLength(1);
  });

  it("rejects with a stable code before it ever writes", () => {
    expect(code(base({ title: "" }))).toBe("missing_title");
    expect(code(base({ id: "Bad Id" }))).toBe("bad_id");
    expect(code(base({ workspaceId: "Recruiting1" }))).toBe("bad_workspace");
    expect(code(base({ steps: [] }))).toBe("no_steps");
    expect(
      code(base({ steps: [{ engine: "nope", action: "jd", title: "x" }] })),
    ).toBe("bad_engine");
    expect(code(base({ title: "x".repeat(WORKFLOW_LIMITS.title + 1) }))).toBe(
      "title_too_long",
    );
    expect(
      code(base({ description: "x".repeat(WORKFLOW_LIMITS.description + 1) })),
    ).toBe("description_too_long");
    expect(
      code(
        base({
          steps: [
            { id: "dup", engine: "process", action: "jd", title: "a" },
            { id: "dup", engine: "process", action: "rubric", title: "b" },
          ],
        }),
      ),
    ).toBe("dup_step_id");
  });

  it("keeps a schedule, with only the fields a trigger has", () => {
    const flow = validateWorkflow(
      base({
        trigger: {
          type: "cron",
          cron: "  0 9 * * 1-5 ",
          targetChannelId: " general ",
          enabled: 1,
          // A hand-edited file may carry anything; it must not travel.
          webhookSecret: "hunter2",
        },
      }),
    );
    expect(flow.trigger).toEqual({
      type: "cron",
      cron: "0 9 * * 1-5",
      targetChannelId: "general",
      enabled: true,
    });
  });

  it("refuses a trigger it cannot describe", () => {
    expect(code(base({ trigger: { type: "webhook" } }))).toBe("bad_trigger_type");
    expect(
      code(base({ trigger: { type: "interval", intervalMinutes: "soon" } })),
    ).toBe("bad_trigger_interval");
    // Not an object at all: no schedule, rather than a broken one.
    expect(validateWorkflow(base({ trigger: "daily" })).trigger).toBeUndefined();
  });

  it("caps a step's notes rather than failing the whole save", () => {
    const flow = validateWorkflow(
      base({
        steps: [
          {
            engine: "process",
            action: "jd",
            title: "Draft",
            notes: "x".repeat(WORKFLOW_LIMITS.notes + 500),
          },
        ],
      }),
    );
    expect(flow.steps[0]!.notes!.length).toBe(WORKFLOW_LIMITS.notes);
  });
});
