import type { RecruitingPipelineStep } from "./office-api";

/**
 * Which flow steps the pipeline runner can carry out, shared by the panel that
 * runs a flow and the chat tool that runs one by name.
 *
 * A flow is a list a person wrote; the runner knows five of those words. The
 * rest (verify, publish, anything custom) still have to be opened by hand, so
 * they are reported back rather than dropped quietly.
 */
const ACTION_TO_STEP: Record<string, RecruitingPipelineStep> = {
  jd: "jd",
  rubric: "rubric",
  intake: "intake",
  assess: "assess",
  email: "email",
};

const RUN_ORDER: readonly RecruitingPipelineStep[] = [
  "jd",
  "rubric",
  "intake",
  "assess",
  "email",
];

/** The runner's step for a flow action, or `undefined` when it is done by hand. */
export function pipelineStepForAction(
  action: string,
): RecruitingPipelineStep | undefined {
  return ACTION_TO_STEP[action];
}

export interface WorkflowRunPlan<Step> {
  /** Pipeline steps in dependency order, deduplicated. */
  steps: RecruitingPipelineStep[];
  /** Steps the runner cannot do, in the order the flow lists them. */
  manual: Step[];
  needsJdInput: boolean;
  needsResumeInput: boolean;
}

export function planWorkflowRun<Step extends { action: string }>(
  steps: readonly Step[],
): WorkflowRunPlan<Step> {
  const matched = new Set<RecruitingPipelineStep>();
  const manual: Step[] = [];
  for (const step of steps) {
    const pipelineStep = ACTION_TO_STEP[step.action];
    if (pipelineStep) matched.add(pipelineStep);
    else manual.push(step);
  }
  return {
    steps: RUN_ORDER.filter((step) => matched.has(step)),
    manual,
    needsJdInput: matched.has("jd"),
    needsResumeInput: matched.has("intake"),
  };
}
