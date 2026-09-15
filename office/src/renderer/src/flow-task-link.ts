import {
  findTemplateForAction,
  type CategoryDef,
  type TemplateDef,
} from "@redrob/ui";
import type { SaveWorkflowRequest, WorkflowView } from "../../shared/office-api";
import { pipelineStepForAction } from "./workflow-pipeline";

type DraftStep = SaveWorkflowRequest["steps"][number];

/**
 * A flow the Tasks tab can talk about, whether it is saved or still a preset.
 *
 * Tasks and Flows used to be two lists that never mentioned each other: a flow
 * could open a task, and then the person was alone in a form with no idea which
 * step they were on or where to go next. Everything here exists so both sides
 * can name the same walk.
 */
export interface FlowRef {
  key: string;
  title: string;
  steps: readonly DraftStep[];
  source: "preset" | "saved";
}

/** Where the person is inside one flow, as far as the Tasks tab knows. */
export interface FlowWalk {
  flow: FlowRef;
  /** Step being worked on by hand. */
  index: number;
}

export function flowKeyFor(input: {
  workspaceId: string;
  slug?: string | undefined;
  title: string;
}): string {
  return `${input.workspaceId}/${input.slug ?? input.title}`;
}

export function presetFlowRef(draft: SaveWorkflowRequest): FlowRef {
  return {
    key: flowKeyFor(draft),
    title: draft.title,
    steps: draft.steps,
    source: "preset",
  };
}

export function savedFlowRef(workflow: WorkflowView): FlowRef {
  return {
    key: flowKeyFor({
      workspaceId: workflow.workspaceId,
      slug: workflow.id.includes("/")
        ? workflow.id.slice(workflow.id.indexOf("/") + 1)
        : workflow.id,
      title: workflow.title,
    }),
    title: workflow.title,
    steps: workflow.steps,
    source: "saved",
  };
}

/**
 * Saved flows win over presets of the same key: once a preset is saved, the
 * chips must point at the copy the person can actually edit.
 */
export function collectFlowRefs(
  presets: readonly SaveWorkflowRequest[],
  saved: readonly WorkflowView[],
): FlowRef[] {
  const refs = new Map<string, FlowRef>();
  for (const preset of presets) {
    const ref = presetFlowRef(preset);
    refs.set(ref.key, ref);
  }
  for (const workflow of saved) {
    const ref = savedFlowRef(workflow);
    refs.set(ref.key, ref);
  }
  return [...refs.values()];
}

export function stepTemplate(
  step: DraftStep,
): { category: CategoryDef; template: TemplateDef; variantId?: string } | undefined {
  return findTemplateForAction(step.action);
}

/** True when the runner can do this step, so nobody should be sent to a form for it. */
export function isAutomatedStep(step: DraftStep): boolean {
  return pipelineStepForAction(step.action) !== undefined;
}

/**
 * The steps of this flow a person has to open themselves, in flow order.
 * The runner's five are excluded even when they have a task panel.
 */
export function handStepIndexes(steps: readonly DraftStep[]): number[] {
  return steps
    .map((step, index) => ({ step, index }))
    .filter(({ step }) => !isAutomatedStep(step) && stepTemplate(step))
    .map(({ index }) => index);
}

/**
 * Next step to open by hand after `from`, skipping anything already ticked off.
 * `undefined` means the walk is over and the person belongs back in the flow.
 */
export function nextHandStepIndex(
  steps: readonly DraftStep[],
  from: number,
  done: readonly number[],
): number | undefined {
  return handStepIndexes(steps).find(
    (index) => index > from && !done.includes(index),
  );
}

/** Which flows use this task, and at which step, so Tasks can offer the walk. */
export function flowsForTemplate(
  flows: readonly FlowRef[],
  templateId: string,
): { flow: FlowRef; stepIndex: number }[] {
  const matches: { flow: FlowRef; stepIndex: number }[] = [];
  for (const flow of flows) {
    const stepIndex = flow.steps.findIndex(
      (step) => stepTemplate(step)?.template.id === templateId,
    );
    if (stepIndex >= 0) matches.push({ flow, stepIndex });
  }
  return matches;
}

export function toggleStepDone(
  done: readonly number[],
  index: number,
): number[] {
  return done.includes(index)
    ? done.filter((item) => item !== index)
    : [...done, index].sort((a, b) => a - b);
}
