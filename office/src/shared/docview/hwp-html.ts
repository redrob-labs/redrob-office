/**
 * A Hangul (HWP/HWPX) document, drawn from the SVG pages the parser produced.
 * Each page already carries its own width and height, so the app just lays the
 * pages out one under another the way a reader would scroll them. The very same
 * markup feeds the preview and the PDF export.
 */
import { escapeHtml } from "./escape.js";

// The parser tags every glyph "sans-serif"; a CSS rule outranks that SVG
// presentation attribute, so pointing the text at the bundled Korean face is
// all it takes to draw Hangul. Latin falls through to Nanum's own Latin and
// then the platform default.
export const HWP_STYLE = `
.doc-hwp { display: flex; flex-direction: column; align-items: center; gap: 16px; }
.doc-hwp .page { background: #fff; box-shadow: 0 1px 4px rgba(0,0,0,0.15); }
.doc-hwp .page > svg { display: block; }
.doc-hwp svg text { font-family: 'Nanum Gothic', 'Malgun Gothic', 'Apple SD Gothic Neo', 'Noto Sans KR', sans-serif; }
.doc-hwp .empty { color: #6b7280; font: 13px/1.5 -apple-system, Segoe UI, Roboto, sans-serif; }
@media print { .doc-hwp { gap: 0; } .doc-hwp .page { box-shadow: none; } }
`;

export function hwpHtmlBody(pages: string[]): string {
  if (!pages.length) {
    return `<div class="doc-hwp"><p class="empty">${escapeHtml(
      "This document has no pages to show.",
    )}</p></div>`;
  }
  // The SVG strings come straight from the parser, not from user text, so they
  // are drawn as-is.
  const body = pages.map((svg) => `<div class="page">${svg}</div>`).join("");
  return `<div class="doc-hwp">${body}</div>`;
}
