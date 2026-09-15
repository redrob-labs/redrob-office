import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { parse as parseYaml, stringify } from "yaml";

export type WorkflowEngine = "lookup" | "process" | "review";

export interface WorkflowStep {
  id: string;
  engine: WorkflowEngine;
  /** Built-in action id or custom */
  action: string;
  title: string;
  registryId?: string;
  notes?: string;
}

export interface WorkflowTrigger {
  type: "manual" | "cron" | "interval" | "event";
  /** Cron expression (e.g. "0 9 * * 1-5" for weekdays 9 AM) */
  cron?: string;
  /** Interval in minutes */
  intervalMinutes?: number;
  /** Destination channel id where results are reported (e.g. "general", "brief") */
  targetChannelId?: string;
  enabled?: boolean;
}

export interface WorkflowDefinition {
  id: string;
  version: number;
  title: string;
  /** When to use this flow, in the author's words. Read by chat to pick one. */
  description?: string;
  /**
   * How to do the work, in the author's words — the body of a Claude-style
   * skill. Chat reads this when it executes the flow as a guide rather than
   * driving the automatic steps.
   */
  instructions?: string;
  workspaceId: string;
  steps: WorkflowStep[];
  /** Optional automated background trigger (cron/interval) */
  trigger?: WorkflowTrigger;
  updatedAt: string;
}

/**
 * A validation failure with a stable machine code.
 *
 * Borrowed from OpenWork's tool-boundary policy: a caller (a chat tool, an
 * importer) can branch on the code and tell the person exactly what to fix,
 * instead of pattern-matching a prose message that is free to change.
 */
export class WorkflowValidationError extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "WorkflowValidationError";
  }
}

/** Caps that keep one saved flow from becoming an unbounded document. */
export const WORKFLOW_LIMITS = {
  title: 200,
  description: 2000,
  instructions: 20000,
  steps: 50,
  notes: 4000,
} as const;

let userWorkflowsDir: string | null = null;

export function setUserWorkflowsDir(directory: string | null): void {
  userWorkflowsDir = directory;
}

export function getUserWorkflowsDir(): string | null {
  return userWorkflowsDir;
}

function assertWorkflowId(id: string): void {
  if (!/^[a-z]+\/[a-z0-9.-]+$/.test(id)) {
    throw new WorkflowValidationError("bad_id", `invalid workflow id: ${id}`);
  }
}

function workflowPath(id: string): string {
  if (!userWorkflowsDir) throw new Error("User workflows directory is not configured.");
  assertWorkflowId(id);
  const path = join(userWorkflowsDir, `${id}.v1.yaml`);
  mkdirSync(dirname(path), { recursive: true });
  return path;
}

const TRIGGER_TYPES = new Set<WorkflowTrigger["type"]>([
  "manual",
  "cron",
  "interval",
  "event",
]);

/**
 * A schedule read off a file, with only the fields this format defines.
 *
 * Whether the schedule is one this machine can actually keep — a cron line that
 * parses, an interval in whole minutes — is decided by the app, which owns the
 * clock. What matters here is that a hand-edited file cannot put an arbitrary
 * object on a flow and have it travel as a trigger.
 */
function readTrigger(value: unknown): WorkflowTrigger | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  const raw = value as Record<string, unknown>;
  const type = String(raw.type ?? "") as WorkflowTrigger["type"];
  if (!TRIGGER_TYPES.has(type)) {
    throw new WorkflowValidationError(
      "bad_trigger_type",
      `workflow trigger type must be one of: ${[...TRIGGER_TYPES].join(", ")}`,
    );
  }
  const intervalMinutes =
    raw.intervalMinutes === undefined || raw.intervalMinutes === null
      ? undefined
      : Number(raw.intervalMinutes);
  if (intervalMinutes !== undefined && !Number.isFinite(intervalMinutes)) {
    throw new WorkflowValidationError(
      "bad_trigger_interval",
      "workflow trigger intervalMinutes must be a number",
    );
  }
  return {
    type,
    ...(typeof raw.cron === "string" && raw.cron.trim() ? { cron: raw.cron.trim() } : {}),
    ...(intervalMinutes !== undefined ? { intervalMinutes } : {}),
    ...(typeof raw.targetChannelId === "string" && raw.targetChannelId.trim()
      ? { targetChannelId: raw.targetChannelId.trim() }
      : {}),
    ...(raw.enabled !== undefined ? { enabled: Boolean(raw.enabled) } : {}),
  };
}

export function validateWorkflow(value: unknown): WorkflowDefinition {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new WorkflowValidationError("not_object", "workflow must be an object");
  }
  const entry = value as Record<string, unknown>;
  const id = String(entry.id ?? "");
  assertWorkflowId(id);
  if (typeof entry.title !== "string" || !entry.title.trim()) {
    throw new WorkflowValidationError("missing_title", "workflow title is required");
  }
  if (entry.title.trim().length > WORKFLOW_LIMITS.title) {
    throw new WorkflowValidationError(
      "title_too_long",
      `workflow title must be ${WORKFLOW_LIMITS.title} characters or fewer`,
    );
  }
  if (typeof entry.workspaceId !== "string" || !/^[a-z]+$/.test(entry.workspaceId)) {
    throw new WorkflowValidationError(
      "bad_workspace",
      "workflow workspaceId is invalid",
    );
  }
  if (!Array.isArray(entry.steps) || entry.steps.length === 0) {
    throw new WorkflowValidationError(
      "no_steps",
      "workflow steps must be a non-empty array",
    );
  }
  if (entry.steps.length > WORKFLOW_LIMITS.steps) {
    throw new WorkflowValidationError(
      "too_many_steps",
      `workflow may have at most ${WORKFLOW_LIMITS.steps} steps`,
    );
  }
  const seenStepIds = new Set<string>();
  const steps: WorkflowStep[] = entry.steps.map((raw, index) => {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
      throw new WorkflowValidationError(
        "bad_step",
        `workflow step ${index} is invalid`,
      );
    }
    const step = raw as Record<string, unknown>;
    const engine = String(step.engine ?? "");
    if (engine !== "lookup" && engine !== "process" && engine !== "review") {
      throw new WorkflowValidationError(
        "bad_engine",
        `workflow step ${index} has invalid engine`,
      );
    }
    const title = String(step.title ?? "").trim();
    const action = String(step.action ?? "").trim();
    if (!title || !action) {
      throw new WorkflowValidationError(
        "missing_step_fields",
        `workflow step ${index} needs title and action`,
      );
    }
    const registryId =
      step.registryId === undefined || step.registryId === null
        ? undefined
        : String(step.registryId);
    let notes =
      step.notes === undefined || step.notes === null ? undefined : String(step.notes);
    if (notes && notes.length > WORKFLOW_LIMITS.notes) {
      notes = notes.slice(0, WORKFLOW_LIMITS.notes);
    }
    const stepId = String(step.id ?? `step-${index + 1}`);
    if (seenStepIds.has(stepId)) {
      throw new WorkflowValidationError(
        "dup_step_id",
        `workflow step id "${stepId}" appears more than once`,
      );
    }
    seenStepIds.add(stepId);
    return {
      id: stepId,
      engine,
      action,
      title,
      ...(registryId ? { registryId } : {}),
      ...(notes ? { notes } : {}),
    };
  });
  const description =
    typeof entry.description === "string" && entry.description.trim()
      ? entry.description.trim()
      : undefined;
  if (description && description.length > WORKFLOW_LIMITS.description) {
    throw new WorkflowValidationError(
      "description_too_long",
      `workflow description must be ${WORKFLOW_LIMITS.description} characters or fewer`,
    );
  }
  const instructions =
    typeof entry.instructions === "string" && entry.instructions.trim()
      ? entry.instructions.trim()
      : undefined;
  if (instructions && instructions.length > WORKFLOW_LIMITS.instructions) {
    throw new WorkflowValidationError(
      "instructions_too_long",
      `workflow instructions must be ${WORKFLOW_LIMITS.instructions} characters or fewer`,
    );
  }
  const trigger = readTrigger(entry.trigger);

  return {
    id,
    version: Number(entry.version ?? 1) || 1,
    title: entry.title.trim(),
    ...(description ? { description } : {}),
    ...(instructions ? { instructions } : {}),
    workspaceId: entry.workspaceId,
    steps,
    ...(trigger ? { trigger } : {}),
    updatedAt: String(entry.updatedAt ?? new Date().toISOString()),
  };
}

export function saveUserWorkflow(workflow: WorkflowDefinition): string {
  const validated = validateWorkflow(workflow);
  const path = workflowPath(validated.id);
  const document = {
    id: validated.id,
    version: validated.version,
    title: validated.title,
    ...(validated.description ? { description: validated.description } : {}),
    ...(validated.instructions ? { instructions: validated.instructions } : {}),
    ...(validated.trigger ? { trigger: validated.trigger } : {}),
    workspaceId: validated.workspaceId,
    updatedAt: validated.updatedAt,
    steps: validated.steps.map((step) => ({
      id: step.id,
      engine: step.engine,
      action: step.action,
      title: step.title,
      ...(step.registryId ? { registryId: step.registryId } : {}),
      ...(step.notes ? { notes: step.notes } : {}),
    })),
  };
  writeFileSync(path, `${stringify(document)}\n`, "utf8");
  return path;
}

export function loadUserWorkflow(id: string): WorkflowDefinition | null {
  if (!userWorkflowsDir) return null;
  assertWorkflowId(id);
  const path = join(userWorkflowsDir, `${id}.v1.yaml`);
  if (!existsSync(path)) return null;
  return validateWorkflow(parseYaml(readFileSync(path, "utf8")));
}

export function listUserWorkflowIds(): string[] {
  if (!userWorkflowsDir || !existsSync(userWorkflowsDir)) return [];
  const ids: string[] = [];

  function walk(dir: string, prefix: string): void {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(full, prefix ? `${prefix}/${entry.name}` : entry.name);
        continue;
      }
      const match = entry.name.match(/^([a-z0-9.-]+)\.v1\.yaml$/);
      if (!match || !entry.isFile()) continue;
      const suffix = match[1];
      if (!suffix) continue;
      const id = prefix ? `${prefix}/${suffix}` : suffix;
      if (/^[a-z]+\/[a-z0-9.-]+$/.test(id)) ids.push(id);
    }
  }

  walk(userWorkflowsDir, "");
  return ids.sort();
}

export function listUserWorkflows(): WorkflowDefinition[] {
  return listUserWorkflowIds()
    .map((id) => loadUserWorkflow(id))
    .filter((workflow): workflow is WorkflowDefinition => workflow !== null);
}
