import type { CloudChatMessage } from "@redrob/kernel";

/**
 * Showing the model what it just looked at.
 *
 * A tool result is text, so a screenshot could only ever be described to the
 * model — a path and a size, which is no help at all when the next thing it
 * has to do is name a point to click. The image goes into the conversation as
 * its own message instead, which is the only form these APIs accept it in.
 *
 * Only the newest one is kept. Screens are large, they are re-sent with every
 * later turn, and a screenshot from four steps ago is not evidence of anything
 * — the desktop has moved on since.
 */

/** Marks the messages this module owns, so it can find and drop its own. */
const SCREEN_TAG = "[screen]";

export function isScreenMessage(message: CloudChatMessage): boolean {
  if (message.role !== "user" || !Array.isArray(message.content)) return false;
  const first = message.content[0];
  return first?.type === "text" && first.text.startsWith(SCREEN_TAG);
}

/** One or more screenshots, as the model has to receive them. */
export function screenMessage(
  dataUrl: string | readonly string[],
  note: string,
  imageLabels?: readonly string[],
): CloudChatMessage {
  const urls = typeof dataUrl === "string" ? [dataUrl] : [...dataUrl];
  const parts: Array<
    | { type: "text"; text: string }
    | { type: "image_url"; image_url: { url: string } }
  > = [{ type: "text", text: `${SCREEN_TAG} ${note}` }];
  for (let i = 0; i < urls.length; i++) {
    const label = imageLabels?.[i]?.trim();
    parts.push({
      type: "text",
      text: label || `Image ${i + 1}`,
    });
    parts.push({
      type: "image_url",
      image_url: { url: urls[i]! },
    });
  }
  return {
    role: "user",
    content: parts,
  };
}

/**
 * The conversation with every earlier screenshot removed, ready for a new one
 * to be appended. Returns a new array; the input is left alone.
 */
export function withoutOlderScreens(
  messages: readonly CloudChatMessage[],
): CloudChatMessage[] {
  return messages.filter((message) => !isScreenMessage(message));
}

/** A PNG as the data URL these APIs take an image in. */
export function pngDataUrl(png: Buffer): string {
  return `data:image/png;base64,${png.toString("base64")}`;
}
