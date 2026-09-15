import { memo, useMemo } from "react";
import DOMPurify from "dompurify";
import { marked } from "marked";

// Raw HTML passes through by default, which is what lets the glued-emphasis
// repair below emit <strong>. DOMPurify still strips scripts before render.
marked.setOptions({
  gfm: true,
  breaks: true,
});

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/**
 * Models often emit broken `**` spans (open on one line, close many lines later).
 * CommonMark also refuses closers like `)**한글`. Repair before marked:
 * - multiline `**…**` → drop the markers (keep body)
 * - same-line `**…**` glued to a following letter → `<strong>`
 * - same-line otherwise → leave for marked
 * - orphan opener → drop `**`
 */
function repairEmphasis(source: string, delim: "**" | "__"): string {
  const out: string[] = [];
  let i = 0;
  const mark = delim;
  const len = mark.length;
  while (i < source.length) {
    // Jump to the next marker instead of walking a character at a time. This
    // runs on every keystroke of a streamed answer, and one array slot per
    // character made a long reply cost more to draw than to generate.
    const open = source.indexOf(mark, i);
    if (open < 0) {
      out.push(source.slice(i));
      break;
    }
    if (open > i) out.push(source.slice(i, open));
    const close = source.indexOf(mark, open + len);
    if (close < 0) {
      out.push(source.slice(open + len));
      break;
    }
    const inner = source.slice(open + len, close);
    const after = source.slice(close + len, close + len + 1);
    if (/[\n\r]/.test(inner)) {
      // Cross-line emphasis is almost always a model mistake — plain text.
      out.push(inner);
    } else if (after && /[\p{L}\p{N}]/u.test(after)) {
      // CommonMark won't close when followed by a letter (한국어 조사 등).
      out.push(`<strong>${escapeHtml(inner)}</strong>`);
    } else {
      out.push(`${mark}${inner}${mark}`);
    }
    i = close + len;
  }
  return out.join("");
}

function preprocessMarkdown(source: string): string {
  return repairEmphasis(repairEmphasis(source, "**"), "__");
}

/**
 * Marked emits real <ul>/<ol>/<table>, but Tailwind preflight sets
 * `list-style: none` and strips table borders. Tag lists/tables with
 * md-* classes and restore styles in CSS (!important where needed).
 */
marked.use({
  renderer: {
    list(token) {
      const body = token.items.map((item) => this.listitem(item)).join("");
      if (token.ordered) {
        const start =
          typeof token.start === "number" && token.start !== 1
            ? ` start="${token.start}"`
            : "";
        return `<ol class="md-ol"${start}>\n${body}</ol>\n`;
      }
      return `<ul class="md-ul">\n${body}</ul>\n`;
    },
    listitem(item) {
      // GFM task checkboxes are already in item.tokens — don't double-render.
      return `<li class="md-li">${this.parser.parse(item.tokens)}</li>\n`;
    },
    table(token) {
      let header = "";
      for (const cell of token.header) {
        header += this.tablecell(cell);
      }
      let body = "";
      for (const row of token.rows) {
        let cells = "";
        for (const cell of row) {
          cells += this.tablecell(cell);
        }
        body += `<tr>\n${cells}</tr>\n`;
      }
      return (
        `<div class="md-table-wrap"><table class="md-table">\n` +
        `<thead>\n<tr>\n${header}</tr>\n</thead>\n` +
        `<tbody>\n${body}</tbody>\n` +
        `</table></div>\n`
      );
    },
  },
});

function sanitizeHtml(html: string): string {
  return DOMPurify.sanitize(html, {
    USE_PROFILES: { html: true },
    FORBID_TAGS: ["style", "iframe", "form", "object", "embed", "link", "meta"],
    FORBID_ATTR: ["style"],
    ALLOWED_URI_REGEXP: /^(?:(?:https?|mailto):|[^a-z]|[a-z+.-]+(?:[^a-z+.\-:]|$))/i,
  });
}

/**
 * Lightweight markdown → HTML for result panes.
 *
 * Memoised on the text, and the component itself is memoised on its props. Both
 * matter for the same reason: a streamed answer renders once per arriving chunk
 * and the office redraws its whole channel every second, so parsing and
 * sanitising unchanged text was most of what the app was doing while a model
 * was still writing.
 */
const MarkdownBodyView = ({
  source,
  className,
}: {
  source: string;
  className?: string;
}): JSX.Element => {
  const html = useMemo(
    () =>
      sanitizeHtml(
        marked.parse(preprocessMarkdown(source), { async: false }) as string,
      ),
    [source],
  );

  return (
    <div
      className={
        className ??
        "markdown-body rounded bg-gray-50 p-4 text-sm leading-relaxed text-gray-800 ring-1 ring-inset ring-gray-300"
      }
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
};

export const MarkdownBody = memo(MarkdownBodyView);
