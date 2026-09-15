import type {
  RecruitingPipelineStep,
  SaveWorkflowRequest,
} from "../../shared/office-api";
import {
  planWorkflowRun as planSharedWorkflowRun,
  type WorkflowRunPlan as SharedWorkflowRunPlan,
} from "../../shared/workflow-plan";

type DraftStep = SaveWorkflowRequest["steps"][number];

export { pipelineStepForAction } from "../../shared/workflow-plan";

export type WorkflowRunPlan = SharedWorkflowRunPlan<DraftStep>;

export function planWorkflowRun(
  steps: readonly DraftStep[],
): WorkflowRunPlan {
  return planSharedWorkflowRun(steps);
}

export type WorkflowTimelineStatus =
  | "ready"
  | "waiting"
  | "running"
  | "done"
  | "manual"
  | "error";

/**
 * Put what somebody typed into one step's notes.
 *
 * Whitespace is kept as typed. The field is a controlled textarea, so trimming
 * here means the space that ends "Post " is gone before the next letter
 * arrives, and a sentence types itself into one long word. The save trims once.
 */
export function withStepNotes(
  steps: readonly DraftStep[],
  index: number,
  value: string,
): DraftStep[] {
  return steps.map((step, i) => {
    if (i !== index) return step;
    const next: DraftStep = {
      engine: step.engine,
      action: step.action,
      title: step.title,
    };
    if (step.registryId) next.registryId = step.registryId;
    if (value) next.notes = value;
    return next;
  });
}

export function moveWorkflowStep<T>(
  steps: readonly T[],
  from: number,
  to: number,
): T[] {
  if (
    from === to ||
    from < 0 ||
    to < 0 ||
    from >= steps.length ||
    to >= steps.length
  ) {
    return [...steps];
  }
  const next = [...steps];
  const [moved] = next.splice(from, 1);
  if (moved === undefined) return [...steps];
  next.splice(to, 0, moved);
  return next;
}

export function workflowTimelineStatus(input: {
  pipelineStep?: RecruitingPipelineStep;
  plan: WorkflowRunPlan;
  busy: boolean;
  progressStep?: RecruitingPipelineStep | "done";
  resultReady: boolean;
  failedStep?: RecruitingPipelineStep;
  /** The person ticked this hand step off in Tasks. */
  handDone?: boolean;
}): WorkflowTimelineStatus {
  const {
    pipelineStep,
    plan,
    busy,
    progressStep,
    resultReady,
    failedStep,
    handDone,
  } = input;
  if (!pipelineStep) return handDone ? "done" : "manual";
  if (failedStep === pipelineStep) return "error";
  if (resultReady) return "done";
  if (!busy || !progressStep) return "ready";
  if (progressStep === "done") return "done";

  const itemIndex = plan.steps.indexOf(pipelineStep);
  const activeIndex = plan.steps.indexOf(progressStep);
  if (itemIndex < activeIndex) return "done";
  if (itemIndex === activeIndex) return "running";
  return "waiting";
}