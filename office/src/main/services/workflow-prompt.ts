import type { WorkflowDefinition } from "@redrob/registry";
import { planWorkflowRun } from "../../shared/workflow-plan.js";

/** Flows named in the prompt. Past this the list stops being read and starts costing. */
export const FLOW_PROMPT_LIMIT = 12;

/**
 * The person's own flows, named the way memories are — short on purpose.
 *
 * Progressive disclosure: the prompt only carries title + when-to-use. The body
 * and the step list live behind workflow.search / workflow.execute, the same
 * way a Claude skill keeps SKILL.md off the context until it is invoked.
 */
export function formatFlowsBlock(
  workflows: readonly WorkflowDefinition[],
): string | undefined {
  if (workflows.length === 0) return undefined;
  const lines = workflows.slice(0, FLOW_PROMPT_LIMIT).map((flow) => {
    const plan = planWorkflowRun(flow.steps);
    const auto =
      plan.steps.length > 0 ? `; auto: ${plan.steps.join("→")}` : "";
    return `- ${flow.title} (id: ${flow.id})${
      flow.description ? ` — ${flow.description}` : ""
    }${auto}`;
  });
  return [
    "Flows this person saved (skills they wrote; call by name from chat):",
    ...lines,
    "When they ask for one of these by name, or for the outcome one of them produces, call " +
      "workflow.execute with that id. Use workflow.search when the name is fuzzy. " +
      "mode=guide returns the skill body for you to follow; mode=run drives the automatic " +
      "steps (ask for any inputs it needs first). workflow.save stores a new flow when they " +
      "ask you to make one.",
  ].join("\n");
}
