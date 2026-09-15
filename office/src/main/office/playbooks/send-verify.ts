/**
 * Stop the model from claiming a desktop send succeeded without proof.
 *
 * Two gates, weakest last. When the message text is known the app's own window
 * is read and the text has to be in it; when it is not, all that is left is the
 * order of tool calls (type/key → later screen.capture), which a determined
 * model can satisfy while still making the result up.
 */

import {
  proveSlackSend,
  sendProofNudge,
  unprovenSendReply,
  type SendProof,
} from "./send-proof.js";
import { isSlackDmAsk } from "./slack-dm.js";

/**
 * Saying it is done.
 *
 * Posting to a channel has its own vocabulary - 올렸습니다, 게시했습니다,
 * 공유드렸습니다 - and none of it was here, so a post that never happened was
 * announced and believed. Every way of saying the work is finished belongs in
 * one place.
 */
const SUCCESS_CLAIM =
  /(?:성공(?:적)?(?:으로)?\s*(?:전송|보냈|보내|올렸|게시|공유)|(?:전송|발송|게시|공유|전달|작성)\s*(?:했|됐|되었|드렸|완료)|보냈(?:어|습니다|어요|음)|보내(?:드렸|졌)|올렸(?:습니다|어요|음)|올려\s*드렸|공유\s*드렸|남겼(?:습니다|어요))|(?:successfully\s+(?:sent|posted|shared)|has\s+been\s+(?:sent|posted|shared)|message\s+(?:was\s+)?(?:sent|posted)|i\s+(?:have\s+)?(?:sent|posted|shared)|sent\s+the\s+message|posted\s+(?:it|this|the))/i;

/**
 * Saying it is not done.
 *
 * The claim list can never be complete - there is always another way to write
 * "올려뒀어요" - so a send ask that typed something and then reported anything
 * other than a failure is treated as a claim and has to be proven. This is the
 * list that lets an honest answer through untouched.
 */
const DENIES_SUCCESS =
  /(?:못\s*했|못했|하지\s*못|찾지\s*못|확인(?:하지|되지)\s*못|실패|안\s*(?:됐|되었|보냈|갔)|않았|않습니다|없었|아직|단정할\s*수\s*없)|(?:could\s*not|couldn'?t|cannot|can'?t|unable|failed|did\s+not|didn'?t|not\s+(?:sent|posted|able|confirm))/i;

/** A send-ish intent, narrow enough that "슬랙 읽어줘" is not one. */
const SEND_INTENT =
  /(?:보내|보냄|전송|발송|올려|올리|올렸|게시|공유|포스팅|전달|답장|남겨|적어|디엠|(?:해|해서)\s*(?:놔|둬|놓아)|dm\b|send|post|share|reply|submit)/i;

const SEND_TOOLS = new Set(["input.type", "input.key"]);

/**
 * An ask that ends in something being left behind in an app.
 *
 * "redrob-labs 채널에 요약해서 정리해놔" has no send word in it and was treated
 * as a question, so the answer that promised to do it later went out
 * unchecked. The -놔/-둬 ending is the ask: leave it there.
 */
const SEND_ASK =
  /(?:보내|전송|메시지|메세지|디엠|입력해|작성해|답장|올려|올리|게시|공유|포스팅|남겨|적어|(?:해|해서)\s*(?:놔|둬|놓아|두세요)|dm\b|send|message|type|reply|submit|post|share|write|put)/i;

/** Any ask that ends in a UI action whose result has to be seen to be claimed. */
export function isSendAsk(text: string): boolean {
  return SEND_ASK.test(text.replace(/\s+/g, " ").trim());
}

/**
 * The answer ends by announcing the work rather than by having done it.
 *
 * "이 내용을 바탕으로 슬랙 메시지를 작성하여 보내드리겠습니다." is a whole turn
 * spent on research and a promise, and the promise has nowhere to be kept: the
 * run is over when that sentence is written.
 */
const PROMISE =
  /(?:보내|전송|올리|게시|공유|작성|정리|전달)\s*(?:해|하여|해서)?\s*(?:드리|주)?(?:겠습니다|겠어요|겠음|ㄹ게요|을게요)|(?:이제|지금|바로)\s*\S{0,12}\s*(?:하겠습니다|드리겠습니다|할게요)|잠시만\s*(?:기다|만)|기다려\s*주(?:십시오|세요)|(?:i(?:'ll| will)\s+(?:now\s+)?(?:send|post|write|share)|let me (?:now )?(?:send|post|write|share)|going to (?:send|post|share) (?:it|this|that)|one moment|please wait)/i;

/**
 * The answer reports the step that is still outstanding.
 *
 * "redrob-labs 채널이 아니라 strategy_redrob-ai 채널이 열렸습니다. redrob-labs
 * 채널을 찾아서 열어야 합니다." is a correct observation, a correct next step,
 * and a finished turn. The model narrated its own way out of the work.
 */
const REMAINING =
  /(?:해야\s*(?:합니다|해요|한다|됩니다|할\s*것)|필요합니다|다시\s*(?:시도|해야)|열어야|찾아야|눌러야|입력해야)|(?:needs?\s+to\s+be|i\s+(?:still\s+)?need\s+to|should\s+(?:now\s+)?(?:find|open|search|try|click)|has\s+not\s+been\s+(?:sent|posted))/i;

/** A turn that stopped to ask the person something is allowed to stop. */
const ASKS = /[?？]\s*$/;

/**
 * Whether the turn ended without doing what it was asked to do.
 *
 * The proof is not in the words but in the trace: nothing was typed anywhere,
 * so whatever it said it would do or still had to do, it did not do.
 */
export function endedWithoutDoing(input: {
  instruction: string;
  text: string;
  toolTrace: readonly string[];
}): boolean {
  if (!isSendAsk(input.instruction)) return false;
  if (input.toolTrace.includes("input.type")) return false;
  const text = input.text.replace(/\s+/g, " ").trim();
  if (!text || ASKS.test(text)) return false;
  return PROMISE.test(text) || REMAINING.test(text);
}

export function doItNowNudge(): string {
  return [
    "STOP. The work is not done and the turn is over the moment you answer. Nobody is going to carry out that sentence for you.",
    "Do it now with the tools: app.focus the app, ui.elements to list what is on screen, input.type { elementId: <the search field>, text: <the name> } which empties it first and checks the result, then ui.pick { text: <the name> } to open the exact row it found.",
    "Opening the wrong conversation is not a reason to stop. Search again.",
    "Then click the composer, input.type the message, and press Enter.",
    "Only answer once the message is in the window, or once you have run out of things to try - and then say plainly that it did not go.",
  ].join(" ");
}

export function claimsSendSuccess(text: string): boolean {
  return SUCCESS_CLAIM.test(text.replace(/\s+/g, " ").trim());
}

/** An answer that owns up, or asks, is not claiming anything. */
export function deniesSendSuccess(text: string): boolean {
  const t = text.replace(/\s+/g, " ").trim();
  if (!t) return true;
  return DENIES_SUCCESS.test(t) || ASKS.test(t);
}

/**
 * An answer that has to be proven before it is shown.
 *
 * Not only the ones that say "보냈습니다". A run that was asked to send, typed
 * into the app, and then wrote a summary as though that were the same thing is
 * making the same claim without the word for it.
 */
export function claimsWork(input: {
  instruction: string;
  text: string;
  toolTrace: readonly string[];
}): boolean {
  if (!isSendAsk(input.instruction)) return false;
  if (claimsSendSuccess(input.text)) return true;
  if (!SEND_INTENT.test(input.instruction)) return false;
  if (!input.toolTrace.includes("input.type")) return false;
  return !deniesSendSuccess(input.text);
}

/** True when a send-ish tool was followed by a look at the result. */
export function hasPostSendLook(toolTrace: readonly string[]): boolean {
  let lastSend = -1;
  for (let i = 0; i < toolTrace.length; i++) {
    if (SEND_TOOLS.has(toolTrace[i]!)) lastSend = i;
  }
  if (lastSend < 0) return false;
  const after = toolTrace.slice(lastSend + 1);
  return after.includes("screen.capture") || after.includes("ui.elements");
}

export function sendVerifyNudge(): string {
  return [
    "STOP. You claimed a message was sent, but there is no screen.capture AFTER input.type / input.key.",
    "Call screen.capture now (every display if needed).",
    "Only say it was sent if that new screenshot clearly shows the message bubble in the Slack thread.",
    "If it is not visible, say you could not confirm the send and describe what you see instead.",
    "Never invent success.",
  ].join(" ");
}

/**
 * Whether a "sent it" answer may stand.
 *
 * The order of tool calls was never enough — a model that takes a screenshot
 * and then says whatever it likes passes that test. When the message text is
 * known, the window is read and the text has to be in it.
 */
export type SendGate =
  | { kind: "allow" }
  | { kind: "retry"; nudge: string }
  | { kind: "override"; text: string; options: string[] };

export async function gateSendClaim(input: {
  instruction: string;
  text: string;
  toolTrace: readonly string[];
  /** The text of every input.type this run made, in order. */
  typed?: readonly string[];
  nudgesUsed: number;
  canRetry: boolean;
  /** Injected by tests; reads the real Slack window otherwise. */
  prove?: (
    instruction: string,
    typed: readonly string[],
  ) => Promise<SendProof>;
}): Promise<SendGate> {
  // Announcing the work, or narrating what is left of it, is not doing it, and
  // the run ends on that sentence.
  if (
    endedWithoutDoing({
      instruction: input.instruction,
      text: input.text,
      toolTrace: input.toolTrace,
    })
  ) {
    if (input.canRetry && input.nudgesUsed < 2) {
      return { kind: "retry", nudge: doItNowNudge() };
    }
  }

  if (
    !claimsWork({
      instruction: input.instruction,
      text: input.text,
      toolTrace: input.toolTrace,
    })
  ) {
    return { kind: "allow" };
  }

  const prove = input.prove ?? proveSlackSend;
  const typed = input.typed ?? [];
  const proof: SendProof = isSlackDmAsk(input.instruction)
    ? await prove(input.instruction, typed)
    : { ok: false, reason: "no-body", candidates: [] };
  if (proof.ok) return { kind: "allow" };

  // Nothing quotable to look for, so fall back to the weaker ordering check.
  if (proof.reason === "no-body") {
    if (hasPostSendLook(input.toolTrace)) return { kind: "allow" };
    if (input.canRetry && input.nudgesUsed < 2) {
      return { kind: "retry", nudge: sendVerifyNudge() };
    }
    return {
      kind: "override",
      text: unverifiedSendReply(input.instruction),
      options: [],
    };
  }

  if (input.canRetry && input.nudgesUsed < 1) {
    return { kind: "retry", nudge: sendProofNudge(proof) };
  }
  const reply = unprovenSendReply(input.instruction, proof);
  return { kind: "override", text: reply.text, options: reply.options };
}

export function unverifiedSendReply(instruction: string): string {
  const korean = /[가-힣]/.test(instruction);
  if (korean) {
    return "화면에서 전송된 메시지를 확인하지 못해서, 보냈다고 단정할 수 없습니다. 슬랙에서 직접 확인해 주세요.";
  }
  return "I could not confirm the message on screen after sending, so I will not claim it was delivered. Please check Slack yourself.";
}
