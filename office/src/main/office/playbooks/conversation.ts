/**
 * Typing a message into whatever conversation happens to be open.
 *
 * Searching for a channel and then not clicking the row leaves Slack showing
 * the conversation from before, or whichever one it highlighted. The message
 * goes there, the run reports success, and the person finds their update in a
 * channel it was never meant for - which cannot be taken back.
 *
 * So the message body is held until the open conversation is the one that was
 * asked for. Only channels are enforced: their names are exact slugs, while a
 * person's name in a window title can be romanised, ordered either way, or
 * carry a title, and blocking on a name mismatch would stop correct runs.
 */

import { parseSlackDmAsk } from "./slack-dm.js";

/** A channel name, comparable: case, #, and separators carry no meaning. */
function slug(name: string): string {
  return name
    .toLowerCase()
    .replace(/\([^)]*\)/g, "")
    .replace(/^#/, "")
    .replace(/[\s_.\-]+/g, "");
}

/**
 * The conversation a Slack title names, or null when the title does not say.
 *
 * Only titles that mark what they are showing count. "Slack" on its own, or a
 * workspace name, is an unknown rather than a mismatch.
 */
export function conversationFromTitle(title: string): string | null {
  const cleaned = title
    .replace(/^\s*\(\d+\)\s*/, "")
    .replace(/^[*•]\s*/, "")
    .trim();
  const marked =
    /^(.+?)\s*\((?:channel|dm|그룹\s*dm|group dm|채널)\)/i.exec(cleaned);
  const name = marked?.[1]?.trim();
  return name ? name : null;
}

/**
 * The conversation a composer belongs to.
 *
 * Slack labels its message box after the place it posts to - "Message
 * #redrob-labs", "redrob-labs에 메시지 보내기" - which is the one piece of
 * evidence that is already in hand when the typing is about to happen.
 */
export function conversationFromField(fieldName: string): string | null {
  const name = fieldName.trim();
  const english = /^message\s+(?:to\s+)?#?(.+?)\s*$/i.exec(name);
  if (english?.[1]) return english[1].trim();
  const korean = /^#?(.+?)(?:에|에게|한테)\s*메시지/.exec(name);
  if (korean?.[1]) return korean[1].trim();
  return null;
}

/** What the screen says is open, from the closest evidence available. */
export function conversationInView(input: {
  fieldName?: string;
  windowTitle?: string;
}): string | null {
  const field = input.fieldName ? conversationFromField(input.fieldName) : null;
  if (field) return field;
  return input.windowTitle ? conversationFromTitle(input.windowTitle) : null;
}

/**
 * A box you look things up in, not one you write a message in.
 *
 * What goes into a search box is a channel name, and a channel name is written
 * all over the window afterwards - the sidebar, the header, the title. Treating
 * it as sent text let a run that only searched pass for a run that posted.
 */
const SEARCH_FIELD = /search|검색|찾기|filter|필터|jump to|이동/i;

export function isSearchField(fieldName: string): boolean {
  const name = fieldName.trim();
  return name !== "" && SEARCH_FIELD.test(name);
}

/**
 * Whether this text is the channel being looked for rather than the message.
 *
 * The name has to be typed into the search box before the channel can open,
 * and that typing happens while the wrong conversation is still on screen.
 */
export function looksLikeSearchTerm(text: string, channel: string): boolean {
  const typed = slug(text);
  if (!typed) return true;
  if (typed.length > 80) return false;
  const target = slug(channel);
  return target.includes(typed) || typed.includes(target);
}

/**
 * Why this message must not be typed here, or null to let it through.
 *
 * Silence on anything unclear: no channel in the ask, no evidence of what is
 * open, or a search term on its way to the search box all pass.
 */
export function wrongConversationBlock(input: {
  tool: string;
  text?: string;
  fieldName?: string;
  windowTitle?: string;
  instruction: string;
}): string | null {
  if (input.tool !== "input.type") return null;
  const text = input.text?.trim();
  if (!text) return null;

  const channel = parseSlackDmAsk(input.instruction).channel;
  if (!channel) return null;
  if (looksLikeSearchTerm(text, channel)) return null;

  const open = conversationInView(input);
  if (!open) return null;
  if (slug(open) === slug(channel)) return null;

  return (
    `Blocked: "${open}" is open, and the message is for #${channel}. ` +
    `Do not type it here. Open the search (ctrl+k), type ${channel}, and click the ` +
    `row for #${channel} in the results with input.click { elementId } - pressing Enter ` +
    "takes whichever row Slack highlighted, which is how the wrong channel opens. " +
    "Then run ui.elements and check the title before typing again."
  );
}
