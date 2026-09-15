import { describe, expect, it } from "vitest";
import type { SaveWorkflowRequest, WorkflowView } from "../../shared/office-api";
import {
  collectFlowRefs,
  flowsForTemplate,
  handStepIndexes,
  isAutomatedStep,
  nextHandStepIndex,
  stepTemplate,
  toggleStepDone,
} from "./flow-task-link";

const preset: SaveWorkflowRequest = {
  workspaceId: "recruiting",
  title: "Hiring basics",
  slug: "hiring-basics",
  steps: [
    { engine: "process", action: "jd", title: "Write a job post" },
    { engine: "review", action: "verify", title: "Check credentials" },
    { engine: "process", action: "publish", title: "Result report" },
  ],
};

const saved: WorkflowView = {
  id: "recruiting/hiring-basics",
  version: 1,
  workspaceId: "recruiting",
  title: "Hiring basics (mine)",
  updatedAt: "2026-08-15T00:00:00.000Z",
  steps: [
    { id: "step-1", engine: "process", action: "jd", title: "Write a job post" },
    {
      id: "step-2",
      engine: "review",
      action: "verify",
      title: "Check credentials",
    },
  ],
};

describe("collectFlowRefs", () => {
  it("prefers the saved copy of a flow over the preset it came from", () => {
    const refs = collectFlowRefs([preset], [saved]);

    expect(refs).toHaveLength(1);
    expect(refs[0]?.title).toBe("Hiring basics (mine)");
    expect(refs[0]?.source).toBe("saved");
  });

  it("keeps presets that were never saved", () => {
    const refs = collectFlowRefs([preset], []);

    expect(refs.map((ref) => ref.key)).toEqual(["recruiting/hiring-basics"]);
    expect(refs[0]?.source).toBe("preset");
  });
});

describe("flowsForTemplate", () => {
  it("finds the flows a task belongs to and where it sits", () => {
    const refs = collectFlowRefs([preset], []);

    expect(flowsForTemplate(refs, "verify")).toEqual([
      { flow: refs[0], stepIndex: 1 },
    ]);
    expect(flowsForTemplate(refs, "assess")).toEqual([]);
  });
});

describe("hand steps", () => {
  it("counts only steps a person opens, not the ones the runner drives", () => {
    expect(handStepIndexes(preset.steps)).toEqual([1, 2]);
    expect(isAutomatedStep(preset.steps[0]!)).toBe(true);
    expect(isAutomatedStep(preset.steps[1]!)).toBe(false);
  });

  it("ignores steps with no task panel to open", () => {
    expect(
      handStepIndexes([
        { engine: "process", action: "custom", title: "Something of my own" },
        { engine: "review", action: "verify", title: "Check credentials" },
      ]),
    ).toEqual([1]);
  });

  it("walks to the next unfinished hand step, then runs out", () => {
    expect(nextHandStepIndex(preset.steps, 0, [])).toBe(1);
    expect(nextHandStepIndex(preset.steps, 1, [])).toBe(2);
    expect(nextHandStepIndex(preset.steps, 0, [1])).toBe(2);
    expect(nextHandStepIndex(preset.steps, 2, [])).toBeUndefined();
  });
});

describe("stepTemplate", () => {
  it("resolves the panel a flow step opens", () => {
    expect(
      stepTemplate({ engine: "review", action: "verify", title: "Check" })
        ?.template.id,
    ).toBe("verify");
    expect(
      stepTemplate({ engine: "process", action: "custom", title: "Mine" }),
    ).toBeUndefined();
  });
});

describe("toggleStepDone", () => {
  it("adds in order and removes on a second tick", () => {
    expect(toggleStepDone([2], 1)).toEqual([1, 2]);
    expect(toggleStepDone([1, 2], 1)).toEqual([2]);
  });
});
