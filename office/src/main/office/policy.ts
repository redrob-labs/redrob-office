import { MINUTE, nextLocalTime } from "./time/index.js";

export interface PacePolicy {
  /** Human → StaffMember. Always zero: never fake latency on the operator. */
  humanToStaffMs: 0;
  staffToStaffMinMs: number;
  staffToStaffMaxMs: number;
  challengeMinMs: number;
  challengeMaxMs: number;
  /** Floor on how long writing anything takes, on top of the gap above. */
  composeMinMs: number;
  /** Ceiling, so a runaway output cannot park a seat for an hour. */
  composeMaxMs: number;
  composeMsPerChar: number;
  /** How long a colleague may work in silence before reporting progress. */
  progressQuietMs: number;
  /** How long between progress reports after the first one. */
  progressRepeatMs: number;
}

export interface OfficePolicy {
  /** Minutes east of UTC. The demo pins this so brief timing is reproducible. */
  timezoneOffsetMinutes: number;
  pace: PacePolicy;
  /** How many staff turns may run at once. */
  concurrency: number;
  /** Tokens the whole Floor may spend in one local day. */
  tokenBudget: number;
  briefHour: number;
  briefMinute: number;
}

/**
 * Hard invariants. These are constants, not policy fields, because section 2
 * requires that no setting can switch them off.
 */
export const APPROVAL_TRAY_HALT_THRESHOLD = 5;
export const MEETING_MAX_ROUNDS = 2;

/**
 * A handoff is a spawn. There is no imitation of a person typing.
 *
 * These delays used to simulate a human office: half a minute to three minutes
 * between seats, plus 45ms per character of what was written. On a measured run
 * that was 170 of 236 seconds of wall time with an empty channel - the lead
 * finished at 10:05:16 and the writer did not start until 10:08:06, while the
 * two model turns together took 66 seconds. The office was not slow, it was
 * waiting on itself.
 *
 * The `not_before` column stays, because that is what keeps the runner from
 * sleeping and lets a scheduled brief be queued ahead of its hour. Causal order
 * does not need a delay either: messages are published in the order they were
 * caused, and the queue reads them back in insertion order.
 */
export const DEFAULT_OFFICE_POLICY: OfficePolicy = {
  timezoneOffsetMinutes: 9 * 60,
  pace: {
    humanToStaffMs: 0,
    staffToStaffMinMs: 0,
    staffToStaffMaxMs: 0,
    challengeMinMs: 0,
    challengeMaxMs: 0,
    composeMinMs: 0,
    composeMaxMs: 0,
    composeMsPerChar: 0,
    // A seat says what it is starting as it starts it, so these only cover the
    // stretch where a turn is thinking and has nothing to announce yet. In a
    // chat window twelve silent seconds read as a hang, so the beat is short.
    progressQuietMs: 2 * 1000,
    progressRepeatMs: 5 * 1000,
  },
  concurrency: 3,
  tokenBudget: 400_000,
  briefHour: 8,
  briefMinute: 0,
};

export function nextBriefAt(policy: OfficePolicy, from: number): number {
  return nextLocalTime(from, policy.briefHour, policy.briefMinute, policy.timezoneOffsetMinutes);
}
