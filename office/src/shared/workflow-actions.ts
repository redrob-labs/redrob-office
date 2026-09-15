import type { WorkflowEngine } from "./office-api";

/**
 * Every step a flow can be made of: the vocabulary the editor offers and the
 * only actions the chat tool will accept when it saves a flow for someone.
 *
 * One list so a flow written in chat is the same kind of object as a flow
 * written in the editor — same action ids, same engines, same packaged
 * registry entries behind them.
 */
export const WORKFLOW_ACTIONS = [
  { action: "jd", engine: "process", registryId: "recruiting/jd" },
  { action: "rubric", engine: "process" },
  { action: "intake", engine: "lookup", registryId: "recruiting/resume" },
  {
    action: "screen",
    engine: "process",
    registryId: "recruiting/candidate-6axis",
  },
  {
    action: "assess",
    engine: "process",
    registryId: "recruiting/candidate-6axis",
  },
  {
    action: "verify",
    engine: "review",
    registryId: "recruiting/degree-certificate.in",
  },
  {
    action: "email",
    engine: "process",
    registryId: "recruiting/decision-email",
  },
  {
    action: "publish",
    engine: "process",
    registryId: "recruiting/candidate-report",
  },
  { action: "spec", engine: "process", registryId: "product/screen-spec" },
  { action: "handoff", engine: "process", registryId: "product/handoff" },
  {
    action: "conform",
    engine: "review",
    registryId: "product/prd-completeness",
  },
  { action: "capture", engine: "lookup", registryId: "finance/receipt" },
  {
    action: "classify",
    engine: "process",
    registryId: "finance/chart-of-accounts",
  },
  { action: "model", engine: "process", registryId: "finance/budget-model" },
  {
    action: "review",
    engine: "review",
    registryId: "engineering/nestjs-conventions",
  },
  { action: "triage", engine: "process", registryId: "engineering/triage-note" },
  { action: "overflow", engine: "review", registryId: "design/i18n-overflow" },
  { action: "tokens", engine: "review", registryId: "design/tokens" },
  { action: "access", engine: "review", registryId: "design/access-check" },
  { action: "diagram", engine: "process", registryId: "design/diagram" },
  { action: "svgAsset", engine: "process", registryId: "design/svg-asset" },
  { action: "memo", engine: "process", registryId: "legal/memo" },
  { action: "memoDocx", engine: "process", registryId: "legal/memo-docx" },
  { action: "memoHwpx", engine: "process", registryId: "legal/memo-hwpx" },
  { action: "documentEdit", engine: "process" },
  { action: "clause", engine: "process", registryId: "legal/clause" },
  { action: "contract", engine: "review", registryId: "legal/contract-review" },
  { action: "outreach", engine: "process", registryId: "sales/outreach" },
  { action: "discovery", engine: "process", registryId: "sales/discovery" },
  { action: "qualify", engine: "review", registryId: "sales/lead-qualify" },
  { action: "brief", engine: "process", registryId: "marketing/campaign-brief" },
  { action: "copy", engine: "process", registryId: "marketing/channel-copy" },
  { action: "deck", engine: "process", registryId: "marketing/deck-outline" },
  { action: "deckPptx", engine: "process", registryId: "marketing/deck-pptx" },
  { action: "research", engine: "lookup" },
  { action: "daylog", engine: "lookup" },
  { action: "custom", engine: "process" },
] as const satisfies readonly {
  action: string;
  engine: WorkflowEngine;
  registryId?: string;
}[];

export type WorkflowActionId = (typeof WORKFLOW_ACTIONS)[number]["action"];

export interface WorkflowActionSpec {
  action: string;
  engine: WorkflowEngine;
  registryId?: string;
}

export function workflowActionSpec(
  action: string,
): WorkflowActionSpec | undefined {
  return WORKFLOW_ACTIONS.find((spec) => spec.action === action);
}

export function workflowActionIds(): string[] {
  return WORKFLOW_ACTIONS.map((spec) => spec.action);
}
