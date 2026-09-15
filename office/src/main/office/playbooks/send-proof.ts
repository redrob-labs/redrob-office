/**
 * Proof that a message was sent, taken from the app rather than the model.
 *
 * Asking the model to look at its own screenshot does not work: it says
 * 전송되었습니다 either way, and a playbook line telling it not to is just
 * another sentence it can ignore. The accessibility tree already contains every
 * message in the open thread, so the runtime can look for the text itself. No
 * text in the window, no claim of success.
 */

import {
  readWindowElements,
  uiElementsAvailable,
} from "../../desktop/ui-elements-win32.js";
import { personNameVariants } from "./person-name.js";
import { parseSlackDmAsk } from "./slack-dm.js";

/** Spacing and punctuation differ between what was typed and what is rendered. */
export function normalizeForMatch(text: string): string {
  return text
    .toLowerCase()
    .replace(/[\s\u200b]+/g, "")
    .replace(/["'“”‘’`.,!?~…]/g, "");
}

/** Long enough that finding it somewhere is not a coincidence. */
const CHUNK = 12;

/** How much of a long message has to be found before it counts as found. */
const COVERAGE = 0.6;

/**
 * Is the message somewhere in this window?
 *
 * A short message ("네") would match too much, so anything under four
 * characters is not treated as provable.
 *
 * Whole-string matching was too strict in the direction that costs the most.
 * Slack breaks a long message across several elements and reflows it on the way
 * in - a link collapses to its title, an emoji becomes its name, the line
 * breaks go somewhere else - so a message that plainly arrived failed to match
 * and a person who had just watched it send was told it had not. Enough of the
 * text in the window is proof that it is there; none of it is proof that it is
 * not.
 */
export function messageVisible(
  elementNames: readonly string[],
  body: string,
): boolean {
  const needle = normalizeForMatch(body);
  if (needle.length < 4) return false;
  // Kept apart, so two neighbouring rows cannot spell out a message between
  // them that neither of them contains.
  const haystack = elementNames.map(normalizeForMatch).join("\u0000");
  if (haystack.includes(needle)) return true;
  if (needle.length < CHUNK * 3) return false;
  let found = 0;
  let total = 0;
  for (let at = 0; at + CHUNK <= needle.length; at += CHUNK) {
    total += 1;
    if (haystack.includes(needle.slice(at, at + CHUNK))) found += 1;
  }
  return total > 0 && found / total >= COVERAGE;
}

/** Rows that look like they belong to the person who was asked for. */
export function candidatesFor(
  elementNames: readonly string[],
  recipient: string,
): string[] {
  const variants = personNameVariants(recipient).map(normalizeForMatch);
  if (variants.length === 0) return [];
  const out: string[] = [];
  for (const name of elementNames) {
    const flat = normalizeForMatch(name);
    if (name.length > 60) continue;
    if (!variants.some((variant) => variant && flat.includes(variant))) continue;
    if (!out.includes(name)) out.push(name);
    if (out.length >= 6) break;
  }
  return out;
}

export type SendProof =
  | { ok: true }
  | {
      ok: false;
      /** not-visible: read the window, the message is not in it. */
      reason: "not-visible" | "unreadable" | "no-body";
      window?: string;
      candidates: string[];
      detail?: string;
    };

/**
 * What to look for in the window, most trustworthy first.
 *
 * The text that was actually typed is the only thing that has to be there. The
 * body pulled out of the instruction is a guess about what the model would
 * send, and when the ask was "요약해서 더 짧게" it is not even close - proving
 * against it failed a send that had gone through.
 */
export function proofNeedles(
  instruction: string,
  typed: readonly string[],
): string[] {
  const out: string[] = [];
  for (const text of [...typed].sort((a, b) => b.length - a.length)) {
    const trimmed = text.trim();
    if (trimmed && normalizeForMatch(trimmed).length >= 4) out.push(trimmed);
  }
  const body = parseSlackDmAsk(instruction).body?.trim();
  if (body && normalizeForMatch(body).length >= 4) out.push(body);
  return out;
}

/**
 * Look in the app the message was meant for. Anything short of finding the text
 * is a failure to prove, deliberately — a wrong "could not confirm" costs a
 * person one glance at Slack, and a wrong "sent" costs them the message.
 */
export async function proveSlackSend(
  instruction: string,
  /** Every input.type this run made, which is what really went into the box. */
  typed: readonly string[] = [],
): Promise<SendProof> {
  const parsed = parseSlackDmAsk(instruction);
  const needles = proofNeedles(instruction, typed);
  if (needles.length === 0) {
    return { ok: false, reason: "no-body", candidates: [] };
  }
  if (!uiElementsAvailable()) {
    return { ok: false, reason: "unreadable", candidates: [] };
  }
  try {
    // No budget: the default trims text rows off the end to keep a window
    // small enough for a prompt, and the message is a text row.
    const read = await readWindowElements("slack", 0, 4000);
    // Not the composer. Text still sitting in the box is the opposite of a
    // sent message, and matching it would prove the one thing it disproves.
    const names = read.elements
      .filter((element) => element.role !== "Edit")
      .map((element) => element.name);
    if (needles.some((needle) => messageVisible(names, needle))) {
      return { ok: true };
    }
    return {
      ok: false,
      reason: "not-visible",
      window: read.window.title,
      candidates: parsed.recipient
        ? candidatesFor(names, parsed.recipient)
        : [],
    };
  } catch (err) {
    return {
      ok: false,
      reason: "unreadable",
      candidates: [],
      detail: err instanceof Error ? err.message : String(err),
    };
  }
}

/** Told to the model when the runtime looked and the message was not there. */
export function sendProofNudge(
  proof: Extract<SendProof, { ok: false }>,
): string {
  return [
    "STOP. I read the Slack window myself and your message is not in it, so it was not sent.",
    proof.window ? `The open conversation is "${proof.window}".` : "",
    "Do not repeat the claim. Either open the right conversation and send it properly,",
    "or stop and tell the person you could not find the recipient.",
  ]
    .filter(Boolean)
    .join(" ");
}

/**
 * What to say when the send could not be proven — and what to ask, because
 * "I could not confirm" alone leaves the person with nothing to click.
 */
export function unprovenSendReply(
  instruction: string,
  proof: Extract<SendProof, { ok: false }>,
): { text: string; options: string[] } {
  const korean = /[가-힣]/.test(instruction);
  const parsed = parseSlackDmAsk(instruction);
  const who = parsed.recipient ?? "";

  if (proof.candidates.length > 1) {
    return {
      text: korean
        ? `슬랙에서 ${who} 님으로 보이는 사람이 여러 명이라 아무에게도 보내지 않았습니다. 누구에게 보낼까요?`
        : `Several people in Slack could be ${who}, so I sent nothing. Which one did you mean?`,
      options: proof.candidates,
    };
  }

  if (proof.candidates.length === 0 && who) {
    return {
      text: korean
        ? `슬랙에서 ${who} 님을 찾지 못했습니다. 슬랙에 표시되는 이름이나 이메일을 알려주시면 그 이름으로 다시 찾아보겠습니다.`
        : `I could not find ${who} in Slack. Tell me the name or email as it appears in Slack and I will look again.`,
      options: personNameVariants(who).slice(0, 4),
    };
  }

  if (proof.reason === "unreadable") {
    return {
      text: korean
        ? "슬랙 창을 읽지 못해서 전송 여부를 확인할 수 없습니다. 슬랙이 열려 있는지 확인해 주세요. 보냈다고 단정하지 않겠습니다."
        : "I could not read the Slack window, so I cannot confirm whether it was sent. Check that Slack is open. I will not claim it was delivered.",
      options: [],
    };
  }

  return {
    text: korean
      ? `보낸 메시지를 슬랙 창에서 확인하지 못했습니다${proof.window ? ` (열려 있는 곳: ${proof.window})` : ""}. 전송되지 않았을 가능성이 높습니다. 다시 시도할까요?`
      : `I could not find the message in the Slack window${proof.window ? ` (open: ${proof.window})` : ""}, so it most likely did not send. Should I try again?`,
    options: [],
  };
}
