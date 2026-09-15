import { writeFile } from "node:fs/promises";

import { Document, Packer, Paragraph, HeadingLevel, TextRun } from "docx";
import { HWPXBuilder, write as writeHwpx } from "hwpx-js";
import pptxgenImport from "pptxgenjs";

import type { FilledSlot } from "../slots.js";
import { findSlot, splitSlideBlocks } from "../slots.js";

type PptxPresentation = {
  addSlide: () => {
    addText: (text: unknown, opts?: Record<string, unknown>) => void;
  };
  write: (opts: { outputType: "nodebuffer" }) => Promise<Buffer>;
};

const PptxGenJS = pptxgenImport as unknown as new () => PptxPresentation;

function paragraphsFromSlots(filled: FilledSlot[]): Paragraph[] {
  const nodes: Paragraph[] = [];
  for (const slot of filled) {
    nodes.push(
      new Paragraph({
        text: slot.label,
        heading: HeadingLevel.HEADING_2,
      }),
    );
    for (const line of slot.value.split(/\r?\n/)) {
      nodes.push(
        new Paragraph({
          children: [new TextRun(line.length > 0 ? line : " ")],
        }),
      );
    }
  }
  return nodes;
}

export async function renderDocx(path: string, filled: FilledSlot[]): Promise<void> {
  const title = findSlot(filled, "title") ?? findSlot(filled, "question") ?? "Document";
  const doc = new Document({
    sections: [
      {
        children: [
          new Paragraph({
            text: title,
            heading: HeadingLevel.TITLE,
          }),
          ...paragraphsFromSlots(filled.filter((slot) => slot.id !== "title")),
        ],
      },
    ],
  });
  const buffer = await Packer.toBuffer(doc);
  await writeFile(path, buffer);
}

export async function renderHwpx(path: string, filled: FilledSlot[]): Promise<void> {
  const title = findSlot(filled, "title") ?? findSlot(filled, "question") ?? "문서";
  const builder = new HWPXBuilder().addParagraph(title, { fontSize: 18, bold: true }).addEmptyParagraph();
  for (const slot of filled) {
    if (slot.id === "title") continue;
    builder.addParagraph(slot.label, { fontSize: 13, bold: true });
    for (const line of slot.value.split(/\r?\n/)) {
      builder.addParagraph(line.length > 0 ? line : " ");
    }
    builder.addEmptyParagraph();
  }
  const bytes = writeHwpx(builder.build());
  await writeFile(path, bytes);
}

export async function renderPptx(path: string, filled: FilledSlot[]): Promise<void> {
  const pres = new PptxGenJS();
  const purpose = findSlot(filled, "purpose") ?? findSlot(filled, "title") ?? "Deck";
  const audience = findSlot(filled, "audience");
  const narrative = findSlot(filled, "narrative") ?? findSlot(filled, "slides") ?? "";
  const mustInclude = findSlot(filled, "mustInclude");

  const titleSlide = pres.addSlide();
  titleSlide.addText(purpose, { x: 0.6, y: 2.1, w: 8.8, h: 1, fontSize: 32, bold: true, color: "0F172A" });
  if (audience?.trim()) {
    titleSlide.addText(audience.trim(), {
      x: 0.6,
      y: 3.2,
      w: 8.8,
      h: 0.6,
      fontSize: 16,
      color: "475569",
    });
  }

  const blocks = splitSlideBlocks(narrative);
  for (const [index, block] of blocks.entries()) {
    const slide = pres.addSlide();
    const [head, ...rest] = block.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
    slide.addText(head ?? `Slide ${index + 1}`, {
      x: 0.6,
      y: 0.5,
      w: 8.8,
      h: 0.7,
      fontSize: 24,
      bold: true,
      color: "0F172A",
    });
    if (rest.length > 0) {
      slide.addText(rest.map((line) => ({ text: line, options: { breakLine: true } })), {
        x: 0.6,
        y: 1.4,
        w: 8.8,
        h: 3.8,
        fontSize: 16,
        color: "334155",
        valign: "top",
      });
    } else if (head && block.includes("—")) {
      const [, body] = block.split(/—/, 2);
      if (body?.trim()) {
        slide.addText(body.trim(), {
          x: 0.6,
          y: 1.4,
          w: 8.8,
          h: 3.8,
          fontSize: 16,
          color: "334155",
          valign: "top",
        });
      }
    }
  }

  if (mustInclude?.trim()) {
    const slide = pres.addSlide();
    slide.addText("Must include", {
      x: 0.6,
      y: 0.5,
      w: 8.8,
      h: 0.7,
      fontSize: 24,
      bold: true,
      color: "0F172A",
    });
    slide.addText(mustInclude.trim(), {
      x: 0.6,
      y: 1.4,
      w: 8.8,
      h: 3.8,
      fontSize: 16,
      color: "334155",
      valign: "top",
    });
  }

  if (blocks.length === 0 && !mustInclude?.trim()) {
    const slide = pres.addSlide();
    slide.addText("Outline", {
      x: 0.6,
      y: 0.5,
      w: 8.8,
      h: 0.7,
      fontSize: 24,
      bold: true,
      color: "0F172A",
    });
    const body = filled
      .filter((slot) => !["purpose", "title", "audience"].includes(slot.id))
      .map((slot) => `${slot.label}\n${slot.value}`)
      .join("\n\n");
    slide.addText(body || purpose, {
      x: 0.6,
      y: 1.4,
      w: 8.8,
      h: 3.8,
      fontSize: 16,
      color: "334155",
      valign: "top",
    });
  }

  const buffer = (await pres.write({ outputType: "nodebuffer" })) as Buffer;
  await writeFile(path, buffer);
}
