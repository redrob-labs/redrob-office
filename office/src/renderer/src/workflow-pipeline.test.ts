import { describe, expect, it } from "vitest";
import {
  moveWorkflowStep,
  planWorkflowRun,
  withStepNotes,
  workflowTimelineStatus,
} from "./workflow-pipeline";

describe("withStepNotes", () => {
  const steps = [
    { engine: "process" as const, action: "custom", title: "Do the thing" },
    { engine: "lookup" as const, action: "research", title: "Look it up" },
  ];

  it("keeps the space at the end, so a sentence can be typed one key at a time", () => {
    let current = withStepNotes(steps, 0, "Post");
    current = withStepNotes(current, 0, "Post ");
    current = withStepNotes(current, 0, "Post one");
    current = withStepNotes(current, 0, "Post one ");
    current = withStepNotes(current, 0, "Post one line");
    expect(current[0]!.notes).toBe("Post one line");
  });

  it("leaves the other steps alone and drops the notes when the field is emptied", () => {
    const filled = withStepNotes(steps, 1, "Only the second one.");
    expect(filled[0]!.notes).toBeUndefined();
    expect(filled[1]!.notes).toBe("Only the second one.");
    expect(withStepNotes(filled, 1, "")[1]!.notes).toBeUndefined();
  });
});

describe("planWorkflowRun", () => {
  it("puts the steps the runner knows into dependency order", () => {
    const plan = planWorkflowRun([
      { engine: "process", action: "email", title: "Decision email" },
      { engine: "lookup", action: "intake", title: "Bring in resumes" },
      { engine: "process", action: "jd", title: "Write a job post" },
    ]);

    expect(plan.steps).toEqual(["jd", "intake", "email"]);
    expect(plan.manual).toEqual([]);
    expect(plan.needsJdInput).toBe(true);
    expect(plan.needsResumeInput).toBe(true);
  });

  it("reports the steps somebody still has to open by hand", () => {
    const plan = planWorkflowRun([
      { engine: "review", action: "verify", title: "Check credentials" },
      { engine: "process", action: "assess", title: "Score one candidate" },
      { engine: "process", action: "publish", title: "Result report" },
    ]);

    expect(plan.steps).toEqual(["assess"]);
    expect(plan.manual.map((step) => step.action)).toEqual([
      "verify",
      "publish",
    ]);
    expect(plan.needsJdInput).toBe(false);
  });

  it("asks for a job post once even when a flow lists it twice", () => {
    const plan = planWorkflowRun([
      { engine: "process", action: "jd", title: "Draft" },
      { engine: "process", action: "jd", title: "Redraft" },
      { engine: "process", action: "rubric", title: "Criteria" },
    ]);

    expect(plan.steps).toEqual(["jd", "rubric"]);
  });

  it("has nothing to run for a flow made only of custom steps", () => {
    const plan = planWorkflowRun([
      { engine: "process", action: "custom", title: "Something of my own" },
    ]);

    expect(plan.steps).toEqual([]);
    expect(plan.manual).toHaveLength(1);
  });
});

describe("workflow timeline", () => {
  it("moves a step to the drop target without losing siblings", () => {
    expect(moveWorkflowStep(["jd", "rubric", "intake"], 0, 2)).toEqual([
      "rubric",
      "intake",
      "jd",
    ]);
    expect(moveWorkflowStep(["jd", "rubric"], -1, 1)).toEqual([
      "jd",
      "rubric",
    ]);
  });

  it("tracks completed, running, and waiting steps from progress", () => {
    const plan = planWorkflowRun([
      { engine: "process", action: "jd", title: "Draft" },
      { engine: "process", action: "rubric", title: "Criteria" },
      { engine: "lookup", action: "intake", title: "Resumes" },
    ]);
    const status = (pipelineStep: "jd" | "rubric" | "intake") =>
      workflowTimelineStatus({
        pipelineStep,
        plan,
        busy: true,
        progressStep: "rubric",
        resultReady: false,
      });

    expect(status("jd")).toBe("done");
    expect(status("rubric")).toBe("running");
    expect(status("intake")).toBe("waiting");
  });

  it("shows a hand step as done once it is ticked off in Tasks", () => {
    const plan = planWorkflowRun([
      { engine: "review", action: "verify", title: "Check credentials" },
    ]);

    expect(
      workflowTimelineStatus({
        plan,
        busy: false,
        resultReady: false,
        handDone: true,
      }),
    ).toBe("done");
    expect(
      workflowTimelineStatus({
        plan,
        busy: false,
        resultReady: false,
        handDone: false,
      }),
    ).toBe("manual");
  });

  it("keeps manual steps distinct and marks a failed active step", () => {
    const plan = planWorkflowRun([
      { engine: "process", action: "jd", title: "Draft" },
    ]);
    expect(
      workflowTimelineStatus({
        plan,
        busy: false,
        resultReady: false,
      }),
    ).toBe("manual");
    expect(
      workflowTimelineStatus({
        pipelineStep: "jd",
        plan,
        busy: false,
        resultReady: false,
        failedStep: "jd",
      }),
    ).toBe("error");
  });
});
