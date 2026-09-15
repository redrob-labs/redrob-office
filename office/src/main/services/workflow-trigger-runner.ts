/**
 * The production wiring for scheduled flows: run through chat, report in a room.
 *
 * Kept apart from the scheduling logic so that logic stays testable without an
 * Electron app, a model, or a floor. Here is the only place that knows a
 * scheduled run is the same agent a person types to.
 */
import type { WorkflowDefinition } from "@redrob/registry";
import { listWorkflows } from "./workflow.js";
import { notifyDesktop } from "./notify.js";
import {
  startWorkflowTriggers,
  stopWorkflowTriggers,
  triggerPrompt,
  type TriggerRunner,
} from "./workflow-triggers.js";

const SCHEDULED_SESSION_PREFIX = "scheduled-";

async function runFlowThroughChat(
  userData: string,
  flow: WorkflowDefinition,
): Promise<string> {
  const { runChat } = await import("./chat.js");
  const result = await runChat(userData, {
    messages: [{ role: "user", content: triggerPrompt(flow) }],
    // Its own session, so a scheduled run never lands in the middle of a
    // conversation somebody is having.
    sessionId: `${SCHEDULED_SESSION_PREFIX}${flow.id.replace(/[^a-z0-9]+/gi, "-")}`,
    resetSession: true,
  });
  return result.text.trim() || "The run finished without reporting anything.";
}

async function reportInChannel(input: {
  userData: string;
  flow: WorkflowDefinition;
  channelId: string;
  text: string;
  ok: boolean;
}): Promise<void> {
  const heading = input.ok
    ? `Scheduled run of “${input.flow.title}”`
    : `Scheduled run of “${input.flow.title}” could not finish`;
  const body = `${heading}\n\n${input.text}`;

  // The transcript is what the room reads back hours later, so it is written
  // first and is the report that survives.
  const { appendChannelReport } = await import("./channel-report.js");
  appendChannelReport({
    userData: input.userData,
    channelId: input.channelId,
    text: body,
    title: input.channelId,
  });

  // The event log is how a chat that is open right now sees it arrive without
  // being reopened. It de-duplicates against identical text, so a room somebody
  // is watching does not show the report twice.
  const { peekFloor, getFloor } = await import("./floor.js");
  const floor = peekFloor() ?? (await getFloor());
  const { appendAssistantMessage } = await import("../office/channels/routing.js");
  appendAssistantMessage(floor.channelEvents, input.channelId, "assistant", body);

  notifyDesktop({ title: heading, body: input.text.slice(0, 200) });
}

export function startScheduledWorkflows(
  userData: string,
  onLog?: (message: string) => void,
): void {
  const runner: TriggerRunner = {
    listFlows: () => listWorkflows(),
    run: (flow) => runFlowThroughChat(userData, flow),
    deliver: (delivery) => reportInChannel({ userData, ...delivery }),
    ...(onLog ? { onLog } : {}),
  };
  startWorkflowTriggers(userData, runner);
}

export { stopWorkflowTriggers };
