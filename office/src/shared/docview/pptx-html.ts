/**
 * A deck drawn as a run of slides, each on its own page.
 *
 * A slide is a title and the lines under it; drawn on a 16:9 card it reads as
 * the slide it is without the office suite that laid it out. A view, not the
 * editor.
 */
import type {
  PptxParagraphView,
  PptxSlideView,
  PptxTextRun,
} from "../doc-render.js";
import { escapeHtml } from "./escape.js";

function runHtml(run: PptxTextRun): string {
  // A line the deck kept as one paragraph with breaks in it still reads as the
  // separate lines it is.
  let text = escapeHtml(run.text).replace(/\n/g, "<br>");
  if (run.bold) text = `<strong>${text}</strong>`;
  if (run.italic) text = `<em>${text}</em>`;
  return text;
}

function paragraphHtml(para: PptxParagraphView): string {
  const inner = para.runs.map(runHtml).join("") || "&nbsp;";
  const indent = para.level > 0 ? ` style="margin-left:${para.level * 24}px"` : "";
  if (para.bullet) {
    return `<li${indent}>${inner}</li>`;
  }
  return `<p${indent}>${inner}</p>`;
}

function bodyHtml(body: PptxParagraphView[]): string {
  // Runs of bulleted lines share one list; plain lines stand alone.
  let out = "";
  let inList = false;
  for (const para of body) {
    if (para.bullet && !inList) {
      out += "<ul>";
      inList = true;
    } else if (!para.bullet && inList) {
      out += "</ul>";
      inList = false;
    }
    out += paragraphHtml(para);
  }
  if (inList) out += "</ul>";
  return out;
}

function slideHtml(slide: PptxSlideView, index: number): string {
  const heading = slide.title
    ? `<h2>${escapeHtml(slide.title)}</h2>`
    : "";
  return `<section class="slide"><div class="slide-inner">${heading}<div class="slide-body">${bodyHtml(slide.body)}</div></div><div class="slide-no">${index + 1}</div></section>`;
}

export const PPTX_STYLE = `
.doc-pptx { font: 15px -apple-system, Segoe UI, Roboto, sans-serif; color: #111827; }
.doc-pptx .slide { position: relative; width: 100%; max-width: 860px; margin: 0 auto 22px; aspect-ratio: 16 / 9; background: #fff; border: 1px solid #e5e7eb; border-radius: 8px; box-shadow: 0 1px 3px rgba(0,0,0,0.08); overflow: hidden; }
.doc-pptx .slide-inner { position: absolute; inset: 6% 7%; display: flex; flex-direction: column; }
.doc-pptx .slide h2 { margin: 0 0 14px; font-size: 26px; font-weight: 700; color: #111827; }
.doc-pptx .slide-body { font-size: 18px; line-height: 1.5; color: #1f2937; }
.doc-pptx .slide-body ul { margin: 0; padding-left: 22px; }
.doc-pptx .slide-body li { margin: 2px 0; }
.doc-pptx .slide-body p { margin: 4px 0; }
.doc-pptx .slide-no { position: absolute; right: 14px; bottom: 10px; font-size: 12px; color: #9ca3af; }
`;

export function pptxHtmlBody(slides: PptxSlideView[]): string {
  if (slides.length === 0) {
    return `<div class="doc-pptx"><p style="color:#6b7280">This deck has no slides.</p></div>`;
  }
  return `<div class="doc-pptx">${slides.map(slideHtml).join("")}</div>`;
}
