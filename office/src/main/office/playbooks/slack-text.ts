/**
 * Markdown does not survive being typed into Slack.
 *
 * A model writes `**제목**`, `- 항목`, `[labs](https://…)`, and Slack shows all
 * of it literally: asterisks, brackets and a raw URL in a wall of text. The
 * message is not wrong, it is unreadable, which for something posted to a
 * channel amounts to the same thing.
 *
 * So the markdown is rewritten into what Slack actually renders, close enough
 * to the author's intent that nothing is lost: bold stays bold, a list stays a
 * list, a link keeps its label.
 */

/** A fence keeps its contents exactly as written. */
const FENCE = /```[\s\S]*?```/g;

export function slackMessageText(text: string): string {
  const fences: string[] = [];
  const parked = text.replace(FENCE, (block) => {
    fences.push(block);
    return `\u0000${fences.length - 1}\u0000`;
  });

  const converted = parked
    // [label](url) -> <url|label>, and a bare [url](url) -> the url alone.
    .replace(/\[([^\]\n]+)\]\((https?:\/\/[^)\s]+)\)/g, (_all, label, url) => {
      const bare = String(label).replace(/^https?:\/\//, "");
      return bare === String(url).replace(/^https?:\/\//, "")
        ? String(url)
        : `<${url}|${label}>`;
    })
    .split("\n")
    .map((line) => {
      // Slack has no headings; the nearest honest thing is a bold line.
      // Marked, not written, so the italic pass below leaves it alone.
      const heading = /^\s{0,3}#{1,6}\s+(.*?)\s*#*\s*$/.exec(line);
      if (heading) return `\u0001${heading[1]}\u0001`;
      // A numbered list already reads as one; only the bullet marker needs
      // turning into something Slack does not treat as italics.
      return line.replace(/^(\s*)[-*+]\s+/, "$1• ");
    })
    .join("\n")
    // Bold before italic: ** would otherwise be read as two italics.
    .replace(/\*\*([^*\n]+)\*\*/g, "\u0001$1\u0001")
    .replace(/__([^_\n]+)__/g, "\u0001$1\u0001")
    .replace(/(^|[\s(])\*([^*\n]+)\*(?=$|[\s).,!?])/g, "$1_$2_")
    .replace(/\u0001/g, "*")
    // Slack strikethrough is one tilde.
    .replace(/~~([^~\n]+)~~/g, "~$1~")
    // A rule is three characters of noise in a chat message.
    .replace(/^\s*(?:-{3,}|\*{3,}|_{3,})\s*$/gm, "");

  return converted.replace(/\u0000(\d+)\u0000/g, (_all, index) =>
    fences[Number(index)] ?? "",
  );
}

/** Whether rewriting would change anything, so the untouched case is free. */
export function hasMarkdown(text: string): boolean {
  return /(?:\*\*|__|~~|^\s{0,3}#{1,6}\s|^\s*[-*+]\s|\[[^\]\n]+\]\(https?:)/m.test(
    text,
  );
}
