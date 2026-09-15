import { nowIso } from "../app-time.js";

/**
 * What Office knows about the workspace's credit, which is less than it would
 * like to know.
 *
 * The console's billing endpoints are behind a console session: `GET /v1/billing`
 * wants the `jwt` scheme, and the credential Office holds is a workspace API key,
 * which is only accepted on the inference endpoints. So there is no honest way to
 * read a balance from here, and this file does not pretend there is one. What it
 * has instead is the one thing the console does tell an API key: a request
 * refused for want of credit, which arrives as HTTP 402 with OpenAI's
 * `insufficient_quota` code.
 *
 * That refusal is recorded, and it is what opens the pay sheet. Nothing here ever
 * decides that a payment succeeded: the block is cleared when the person says
 * they have paid, and the next real request is what proves it, because the
 * console is the only thing that can say so.
 */

/**
 * A refusal for want of credit, told apart from a throttle.
 *
 * They arrive looking similar, both being "the provider said no", and OpenAI's
 * own SDKs conflate them by reporting a spent balance as a rate limit. The
 * difference matters to the person: waiting fixes one, and only paying fixes the
 * other, so the copy and the sheet that follows must not be shared.
 */
const OUT_OF_CREDIT =
  /insufficient[_ ]quota|payment[_ ]required|\b402\b|out of credit|top ?up to keep/i;

export function isOutOfCredit(error: unknown): boolean {
  const text = error instanceof Error ? error.message : String(error);
  return OUT_OF_CREDIT.test(text);
}

/** What the chat says when the console refuses a turn for want of credit. */
export function outOfCreditMessage(locale: "en" | "ko" = "en"): string {
  return locale === "ko"
    ? "이 워크스페이스의 크레딧이 부족해 console.redrob.ai가 이번 요청을 처리하지 않았습니다. 변경된 것은 없습니다. 크레딧을 충전한 뒤 다시 보내 주세요."
    : "console.redrob.ai refused this request because the workspace is out of credit. Nothing was changed. Add credit and send it again.";
}

export interface CreditState {
  /** True when the console's last word was that the workspace cannot spend. */
  blocked: boolean;
  /** When that refusal arrived, so the sheet is not quoting last week. */
  refusedAt: string | null;
  /** The console's own sentence, kept verbatim rather than paraphrased. */
  detail: string | null;
}

const CLEAR: CreditState = { blocked: false, refusedAt: null, detail: null };

let state: CreditState = CLEAR;

/**
 * Record that the console refused a request for want of credit.
 *
 * The console's message is kept as it came, because it names the balance it saw,
 * and a paraphrase of a number is a number nobody can check.
 */
export function noteOutOfCredit(error: unknown): void {
  const text = error instanceof Error ? error.message : String(error);
  state = {
    blocked: true,
    refusedAt: nowIso(),
    detail: text.trim().slice(0, 400) || null,
  };
}

/** Called when a request the console billed went through. */
export function noteCreditSpent(): void {
  if (state.blocked) state = CLEAR;
}

export function creditState(): CreditState {
  return state;
}

/**
 * Forget the refusal, on the person's word that they have paid.
 *
 * This is not a claim that the payment settled. Credit arrives on the console's
 * webhook, so the app cannot see it land; clearing the block only means the next
 * request is allowed to be attempted, and if credit still has not arrived the
 * console refuses it again and the sheet comes back.
 */
export function clearCreditBlock(): CreditState {
  state = CLEAR;
  return state;
}

/** @internal for tests. */
export function __resetCreditState(): void {
  state = CLEAR;
}
