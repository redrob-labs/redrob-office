/**
 * The bridge between what the composer shows and what gets sent.
 *
 * The editor is WYSIWYG — bold text is bold on screen, not `**bold**` — but
 * everything downstream of it speaks markdown: messages are stored as text and
 * rendered through `marked`. So the document is serialised on send and parsed
 * back when a draft is restored.
 *
 * Written against the small, known set of nodes and marks the composer
 * actually enables rather than against a general schema, which is what makes
 * it short enough to read and possible to test without a browser.
 */

export interface RichMark {
  type: string;
  attrs?: Record<string, unknown>;
}

export interface RichNode {
  type: string;
  text?: string;
  attrs?: Record<string, unknown>;
  marks?: RichMark[];
  content?: RichNode[];
}

/** Wrapping markers, outermost first, so nesting comes out in a stable order. */
const MARK_WRAPPERS: Record<string, string> = {
  bold: "**",
  italic: "_",
  strike: "~~",
  code: "`",
};

/** Outermost to innermost. `code` sits closest to the text; nothing nests inside it. */
const MARK_ORDER = ["link", "bold", "italic", "strike", "code"];

function escapeText(text: string): string {
  // Only the characters that would otherwise become markup by accident. Over-
  // escaping turns an innocent sentence into a thicket of backslashes.
  return text.replace(/([\\`*_~[\]])/g, "\\$1");
}

interface Run {
  text: string;
  /** Mark identities, outermost first. A link carries its href in the id. */
  marks: string[];
}

function markId(mark: RichMark): string {
  return mark.type === "link"
    ? `link:${String(mark.attrs?.["href"] ?? "")}`
    : mark.type;
}

function markType(id: string): string {
  return id.startsWith("link:") ? "link" : id;
}

/**
 * An address that is its own label needs no label.
 *
 * The editor autolinks a bare domain, and writing that back as
 * `[labs.redrob.ai](http://labs.redrob.ai)` is how a person's own sentence came
 * back to them as markup - and how the markup, not the address, was the thing
 * that went on to the model and into the message being sent.
 */
function isBareAddress(href: string, text: string): boolean {
  const bare = (value: string): string =>
    value
      .trim()
      .replace(/^mailto:/i, "")
      .replace(/^[a-z][a-z0-9+.-]*:\/\//i, "")
      .replace(/\/+$/, "")
      .toLowerCase();
  const label = bare(text);
  return label.length > 0 && label === bare(href);
}

function open(id: string): string {
  return markType(id) === "link" ? "[" : (MARK_WRAPPERS[id] ?? "");
}

function close(id: string): string {
  return markType(id) === "link"
    ? `](${id.slice("link:".length)})`
    : (MARK_WRAPPERS[id] ?? "");
}

function runsOf(nodes: RichNode[] | undefined, out: Run[] = []): Run[] {
  for (const node of nodes ?? []) {
    if (node.type === "hardBreak") {
      out.push({ text: "\n", marks: [] });
      continue;
    }
    // A mention is a chip in the editor and a plain `@id` on the way out. The id
    // and not the label, because the label is localised and the office resolves
    // a seat by id - a message tagging @조사 would otherwise reach nobody.
    if (node.type === "mention") {
      const id = String(node.attrs?.["id"] ?? "");
      if (id) out.push({ text: `@${id}`, marks: [] });
      continue;
    }
    // A `/flow` chip leaves as a plain-English run request carrying the exact
    // flow id, so the model calls workflow.execute on the right one rather than
    // guessing from a fuzzy title.
    if (node.type === "slashFlow") {
      const id = String(node.attrs?.["id"] ?? "");
      const label = String(node.attrs?.["label"] ?? "").trim();
      if (id || label) {
        const title = label || id;
        out.push({
          text: `Run my “${title}” flow${id ? ` (flow id: ${id})` : ""}.`,
          marks: [],
        });
      }
      continue;
    }
    if (node.type === "text") {
      const raw = node.text ?? "";
      const ids = (node.marks ?? [])
        .map(markId)
        .filter(
          (id) =>
            markType(id) !== "link" ||
            !isBareAddress(id.slice("link:".length), raw),
        );
      const marks = MARK_ORDER.flatMap((type) =>
        ids.filter((id) => markType(id) === type),
      );
      // Inside inline code nothing else is markup, so the text is left alone.
      out.push({ text: marks.includes("code") ? raw : escapeText(raw), marks });
      continue;
    }
    // An unexpected inline node still contributes its text rather than
    // silently dropping what the person wrote.
    runsOf(node.content, out);
  }
  return out;
}

/**
 * Emphasis is opened once and held across every run that carries it, instead of
 * being reopened per run. Writing each run separately produces markers that
 * collide where two runs meet — `**bold****bold italic**` — and markdown shows
 * the asterisks rather than the emphasis.
 *
 * Marks are also closed around a hard break, because emphasis that spans a line
 * break is treated as a mistake downstream and stripped.
 */
function inline(nodes: RichNode[] | undefined): string {
  const runs = runsOf(nodes);
  let out = "";
  let active: string[] = [];

  const closeTo = (depth: number): void => {
    for (let i = active.length - 1; i >= depth; i -= 1)
      out += close(active[i]!);
    active = active.slice(0, depth);
  };

  for (const run of runs) {
    if (!run.text) continue;
    if (run.text === "\n") {
      closeTo(0);
      out += "\n";
      continue;
    }
    let shared = 0;
    while (
      shared < active.length &&
      shared < run.marks.length &&
      active[shared] === run.marks[shared]
    ) {
      shared += 1;
    }
    closeTo(shared);
    for (const id of run.marks.slice(shared)) {
      out += open(id);
      active.push(id);
    }
    out += run.text;
  }
  closeTo(0);
  return out;
}

/**
 * A line of ordinary text can still open a block. Someone who types "- one" as
 * words means those words, but markdown reads the dash as a bullet and the
 * paragraph comes back as a list — nested inside the real one, if it was
 * already in a list item. Only the marker is escaped, and only where it would
 * be read as one: at the start of a line.
 */
function escapeBlockStart(line: string): string {
  const bullet = /^(\s*)([-+>#])(\s|$)/.exec(line);
  if (bullet) {
    return `${bullet[1]}\\${bullet[2]}${line.slice(bullet[0].length - (bullet[3]?.length ?? 0))}`;
  }
  // The digits cannot carry the escape, so it goes on the delimiter: `1\.`
  const ordered = /^(\s*)(\d+)([.)])(\s|$)/.exec(line);
  if (ordered) {
    return `${ordered[1]}${ordered[2]}\\${ordered[3]}${line.slice(ordered[0].length - (ordered[4]?.length ?? 0))}`;
  }
  return line;
}

function paragraph(nodes: RichNode[] | undefined): string {
  return inline(nodes).split("\n").map(escapeBlockStart).join("\n");
}

function prefixLines(text: string, prefix: string): string {
  return text
    .split("\n")
    .map((line) => `${prefix}${line}`)
    .join("\n");
}

function listBlock(node: RichNode, ordered: boolean): string {
  const items = node.content ?? [];
  return items
    .map((item, index) => {
      const marker = ordered ? `${index + 1}. ` : "- ";
      const body = blocks(item.content ?? []);
      const indent = " ".repeat(marker.length);
      const [first = "", ...rest] = body.split("\n");
      return [
        `${marker}${first}`,
        ...rest.map((line) => (line ? `${indent}${line}` : line)),
      ].join("\n");
    })
    .join("\n");
}

function block(node: RichNode): string {
  switch (node.type) {
    case "paragraph":
      return paragraph(node.content);
    case "heading": {
      const level = Number(node.attrs?.["level"] ?? 1);
      return `${"#".repeat(Math.min(6, Math.max(1, level)))} ${inline(node.content)}`;
    }
    case "blockquote":
      return prefixLines(blocks(node.content ?? []), "> ");
    case "codeBlock": {
      const language = String(node.attrs?.["language"] ?? "");
      // Raw: a fenced block is verbatim by definition.
      const body = (node.content ?? [])
        .map((child) => child.text ?? "")
        .join("");
      return `\`\`\`${language}\n${body}\n\`\`\``;
    }
    case "bulletList":
      return listBlock(node, false);
    case "orderedList":
      return listBlock(node, true);
    case "horizontalRule":
      return "---";
    default:
      return node.content ? blocks(node.content) : inline([node]);
  }
}

function blocks(nodes: RichNode[]): string {
  return nodes.map(block).join("\n\n");
}

/** The document as markdown, ready to send. */
export function docToMarkdown(doc: RichNode | null | undefined): string {
  if (!doc?.content) return "";
  return blocks(doc.content)
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/** True when the document holds nothing a reader would see. */
export function isDocEmpty(doc: RichNode | null | undefined): boolean {
  return docToMarkdown(doc).length === 0;
}
