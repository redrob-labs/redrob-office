import type { WorkflowDefinition } from "@redrob/registry";
import {
  MANAGER_ID,
  PUBLISHER_ID,
  RESEARCHER_ID,
  REVIEWER_ID,
  WRITER_ID,
} from "../staff/roster.js";

export interface TaskTemplate {
  id: string;
  title: string;
  /** Default StaffMember. A Task may still be routed elsewhere by a REQUEST. */
  staffId: string;
  instruction: string;
  /** Deterministic gates that must pass before the output may be delivered. */
  gates: Array<"hash" | "schema" | "grep" | "test">;
  source: "builtin" | "workflow";
}

/** Engine → StaffMember. Existing workflow steps land on the right seat. */
function staffForStep(engine: string, action: string): string {
  if (engine === "review" || action.includes("verify") || action.includes("conform")) {
    return REVIEWER_ID;
  }
  if (engine === "lookup" || action.includes("intake") || action.includes("watch")) {
    return RESEARCHER_ID;
  }
  if (isPublishingStep(action)) return PUBLISHER_ID;
  return WRITER_ID;
}

/** Steps whose action pushes work off this machine. */
function isPublishingStep(action: string): boolean {
  return /publish|send|deploy|post/i.test(action);
}

/**
 * Existing workflow definitions become Task templates rather than a parallel
 * authoring surface: one step, one Task.
 */
export function templatesFromWorkflow(workflow: WorkflowDefinition): TaskTemplate[] {
  return workflow.steps.map((step) => ({
    id: `${workflow.id}#${step.id}`,
    title: step.title,
    staffId: staffForStep(step.engine, step.action),
    instruction: [
      `Workflow "${workflow.title}" step "${step.title}" (${step.engine}/${step.action}).`,
      step.notes ?? "",
      step.registryId ? `Registry: ${step.registryId}.` : "",
    ]
      .filter(Boolean)
      .join(" "),
    gates: step.engine === "review" ? ["schema", "grep"] : ["schema"],
    source: "workflow" as const,
  }));
}

/** The template a free-text goal from a person is filed under. */
export const INTAKE_TEMPLATE_ID = "office/intake";

/**
 * Where a hello is filed. Never reaches a model: the scheduler answers it from
 * the catalog, so the reply is in the reader's language and costs no tokens.
 * It exists as a template only so social lines still get a trace like any other
 * thing a person said, rather than vanishing from the record.
 */
export const SMALLTALK_TEMPLATE_ID = "office/smalltalk";

/**
 * Where a goal aimed at one named seat is filed.
 *
 * Naming a seat is a person deciding the assignment themselves, so there is
 * nothing for the lead to break up and this skips it. The seat is still the one
 * it always was - same scope, same tools - so it has to be free to hand the work
 * on rather than fail when it is asked for something outside its lane.
 */
export const ASK_TEMPLATE_ID = "office/ask";

export const BUILTIN_TASK_TEMPLATES: TaskTemplate[] = [
  {
    id: INTAKE_TEMPLATE_ID,
    title: "Take what a person said and deal with it",
    staffId: MANAGER_ID,
    instruction: [
      "A person said something to the office. Decide first whether it is work or a question.",
      // Assigning was the only exit here, so a question had to be forced into
      // the shape of a project, and a manager that could see it was not one had
      // nothing to answer with but a refusal.
      "If you can settle it yourself, including by using your tools to look something up, ANSWER it and stop.",
      "If something has to be produced, checked or sent, break it into steps and send one REQUEST per step to the seat that owns it.",
      // The assignee gets the channel brief. One short sentence is enough.
      "Each REQUEST is one short sentence: who, what deliverable, any named path. Never paste the content of the deliverable.",
    ].join(" "),
    // Nothing is produced here, so there is nothing deterministic to check.
    gates: [],
    source: "builtin",
  },
  {
    id: ASK_TEMPLATE_ID,
    title: "Deal with what you were asked directly",
    // Overridden by the seat the person named; this is only the fallback.
    staffId: MANAGER_ID,
    instruction: [
      "A person asked you directly, by name.",
      "Do it if it is yours to do. ANSWER if you can settle it yourself.",
      // Otherwise the answer was a Windows path, the person asked to see the
      // thing instead, and the whole file came back typed out as a chat message.
      "If you made or changed a file, say in one sentence what it is. The file is shown beside your answer, so do not paste its path or its contents.",
      "If it needs a seat you are not, send one REQUEST to that seat and say so.",
    ].join(" "),
    gates: [],
    source: "builtin",
  },
  {
    id: SMALLTALK_TEMPLATE_ID,
    title: "Say hello back",
    staffId: MANAGER_ID,
    instruction: "Answered from the message catalog. This is never sent to a model.",
    gates: [],
    source: "builtin",
  },
  {
    id: "office/research",
    title: "Gather the facts",
    staffId: RESEARCHER_ID,
    instruction: [
      "Collect what the draft will stand on and write it to a notes file.",
      "Every fact needs the path and line it came from. Leave unknowns marked unknown.",
    ].join(" "),
    gates: ["schema"],
    source: "builtin",
  },
  {
    id: "office/draft",
    title: "Write the document",
    staffId: WRITER_ID,
    instruction: [
      "Write the document that was asked for.",
      "Use research notes when they were handed to you; otherwise gather what you need with your tools.",
      "Write it in the format the ask implies, not markdown by default.",
      // The card beside the answer is the output. Pasting the sheet into chat is
      // how the same rows got paid for three times.
      "When the person asked for the file itself, ANSWER in one sentence once it exists. Do not paste its path or its contents.",
      "When a lead asked for a review, DELIVER to the reviewer with an artifactRef.",
    ].join(" "),
    gates: ["schema"],
    source: "builtin",
  },
  {
    id: "office/verify",
    title: "Check the draft against its sources",
    staffId: REVIEWER_ID,
    instruction: [
      "Verify every claim in the delivered draft against the notes it cites.",
      "Run the deterministic checks first and quote the exact line you compared.",
      "If anything disagrees, challenge it with that locator.",
    ].join(" "),
    gates: ["schema", "grep"],
    source: "builtin",
  },
  {
    id: "office/daily-brief",
    title: "Assemble the DailyBrief",
    staffId: WRITER_ID,
    instruction: [
      "Assemble the morning one-pager from the Floor audit log.",
      "Shipped, approvals, blocks, spend, anomalies and the handoff.",
    ].join(" "),
    gates: ["schema"],
    source: "builtin",
  },
  {
    id: "office/publish",
    title: "Send the cleared work out",
    staffId: PUBLISHER_ID,
    instruction: [
      "Send the reviewed deliverable to its external destination.",
      "This leaves the machine, so it must go through approval.",
    ].join(" "),
    gates: ["hash"],
    source: "builtin",
  },
];

export function findTemplate(
  templates: readonly TaskTemplate[],
  id: string,
): TaskTemplate | undefined {
  return templates.find((template) => template.id === id);
}
