/**
 * A run waiting on a person.
 *
 * A computer-use task asks before every step that touches the machine, and the
 * answer comes from a human clicking Approve in the tray — which happens in
 * another process tick, long after the tool call was made. Something has to
 * hold the run open in between.
 *
 * The Floor's own tasks do not need this: they are persisted, so approving one
 * re-queues it and the scheduler picks it up again. A chat task only exists as
 * a promise inside the call that started it, so if that promise gives up the
 * work is gone and approving achieves nothing. This is the seam that lets that
 * promise wait.
 */

export type ApprovalOutcome =
  | "approved"
  /** Yes, and stop asking for this in this conversation. */
  | "approved_always"
  | "rejected"
  | "timeout"
  | "aborted";

interface Waiter {
  settle: (outcome: ApprovalOutcome) => void;
  timer: ReturnType<typeof setTimeout>;
}

const waiting = new Map<string, Waiter>();

export interface WaitOptions {
  /**
   * How long to hold the run open. A person who has walked away should not
   * pin a task forever, and the model's own context has a life expectancy.
   */
  timeoutMs: number;
  signal?: AbortSignal;
}

/** How many runs are currently blocked on somebody. Diagnostics and tests. */
export function pendingApprovals(): number {
  return waiting.size;
}

/**
 * Waits for a decision on one approval.
 *
 * Resolves rather than throws in every case, because "nobody answered" and
 * "they said no" are both answers the caller has to turn into a tool result.
 */
export function waitForApproval(
  id: string,
  options: WaitOptions,
): Promise<ApprovalOutcome> {
  // A second wait on the same id replaces the first: the tray only shows one
  // card per call, so an older waiter for it is already unreachable.
  settleApproval(id, "aborted");

  return new Promise<ApprovalOutcome>((resolve) => {
    let done = false;
    const finish = (outcome: ApprovalOutcome): void => {
      if (done) return;
      done = true;
      waiting.delete(id);
      clearTimeout(timer);
      options.signal?.removeEventListener("abort", onAbort);
      resolve(outcome);
    };
    const onAbort = (): void => finish("aborted");
    const timer = setTimeout(
      () => finish("timeout"),
      Math.max(1, options.timeoutMs),
    );
    // A timer is not a reason to keep the process alive; the run is.
    timer.unref?.();

    if (options.signal?.aborted) {
      finish("aborted");
      return;
    }
    options.signal?.addEventListener("abort", onAbort, { once: true });
    waiting.set(id, { settle: finish, timer });
  });
}

/**
 * Hands a decision to whoever is waiting on it. Safe to call for an id nobody
 * is waiting on, which is every approval that belongs to the Floor rather than
 * to a chat run.
 */
export function settleApproval(id: string, outcome: ApprovalOutcome): boolean {
  const waiter = waiting.get(id);
  if (!waiter) return false;
  waiter.settle(outcome);
  return true;
}

/** Releases everything, for shutdown and between tests. */
export function abortAllApprovals(): void {
  for (const id of [...waiting.keys()]) settleApproval(id, "aborted");
}
