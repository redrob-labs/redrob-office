export type TaskState =
  | "queued"
  | "running"
  | "waiting-approval"
  | "blocked"
  | "checkpointed"
  | "done"
  | "failed"
  | "aborted";

export interface TaskCheckpoint {
  /** Domain time the checkpoint was written. */
  at: number;
  /** Iterations already completed, so a resumed run does not redo them. */
  iterations: number;
  /** Partial output kept when the task was interrupted. */
  partialText: string;
  reason:
    | "suspend"
    | "shutdown"
    | "approval"
    | "escalate"
    | "budget"
    | "abort";
  /** STEER text folded in at the last checkpoint. */
  steer?: string;
}

/** What a Task is allowed to spend. Enforced per Trace, not per Task. */
export interface TaskBudget {
  tokens: number;
  costMicros: number;
}

/**
 * What the runtime needs to do the work. Kept separate from the persisted
 * bookkeeping so `OfficeRuntime` can be handed a Task without also being handed
 * the store that produced it.
 */
export interface TaskSpec {
  templateId: string;
  title: string;
  instruction: string;
}

/**
 * One unit of execution.
 *
 * This is the whole input to `OfficeRuntime`: it carries its own identity,
 * lineage, owner, work, allowance and earliest start. Nothing about it assumes
 * a single ambient session, so N of them can be in flight at once.
 */
export interface Task {
  taskId: string;
  traceId: string;
  staffMemberId: string;
  spec: TaskSpec;
  budget: TaskBudget;
  /** Earliest domain time this may start. Delay is data, never a sleep. */
  notBefore: number;
}

export type TraceStatus = "open" | "escalated" | "closed" | "killed";

/** The causal grouping a Task belongs to. Owns the budget the Task draws on. */
export interface Trace {
  traceId: string;
  rootTaskId: string | null;
  budget: TaskBudget & { depth: number };
  spent: TaskBudget & { depth: number };
  status: TraceStatus;
}

export interface TaskRecord {
  id: string;
  traceId: string;
  staffId: string;
  templateId: string;
  title: string;
  instruction: string;
  state: TaskState;
  createdAt: number;
  /** Earliest domain time this may start. */
  notBefore: number;
  startedAt: number | null;
  finishedAt: number | null;
  checkpoint: TaskCheckpoint | null;
  result: string | null;
  tokens: number;
  seat: number | null;
  /** Opaque per-template payload carried with the row. */
  payload: Record<string, unknown> | null;
}

/** The runtime's view of a persisted row. */
export function taskFromRecord(record: TaskRecord, budget: TaskBudget): Task {
  return {
    taskId: record.id,
    traceId: record.traceId,
    staffMemberId: record.staffId,
    spec: {
      templateId: record.templateId,
      title: record.title,
      instruction: record.instruction,
    },
    budget,
    notBefore: record.notBefore,
  };
}

export interface TaskRunOutcome {
  taskId: string;
  state: TaskState;
  text: string;
  iterations: number;
  tokens: number;
}
