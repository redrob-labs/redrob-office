import { extname } from "node:path";
import { readFile } from "node:fs/promises";

const TEXT_EXTENSIONS = new Set([".txt", ".md", ".json"]);
const PDF_EXTENSIONS = new Set([".pdf"]);
const DOCX_EXTENSIONS = new Set([".docx"]);

export const INTAKE_EXTENSIONS = new Set([
  ...TEXT_EXTENSIONS,
  ...PDF_EXTENSIONS,
  ...DOCX_EXTENSIONS,
]);

export function isIntakeExtension(extension: string): boolean {
  return INTAKE_EXTENSIONS.has(extension.toLowerCase());
}

async function decodePdf(buffer: Buffer): Promise<string> {
  const { PDFParse } = await import("pdf-parse");
  const parser = new PDFParse({ data: buffer });
  try {
    const parsed = await parser.getText();
    const text = parsed.text?.replace(/\u0000/g, "").trim() ?? "";
    if (!text) {
      throw new Error("PDF contained no extractable text");
    }
    return text;
  } finally {
    await parser.destroy().catch(() => undefined);
  }
}

async function decodeDocx(buffer: Buffer): Promise<string> {
  const mammoth = await import("mammoth");
  const result = await mammoth.extractRawText({ buffer });
  const text = result.value?.replace(/\u0000/g, "").trim() ?? "";
  if (!text) {
    throw new Error("DOCX contained no extractable text");
  }
  return text;
}

export async function decodeSourceFile(path: string): Promise<string> {
  const extension = extname(path).toLowerCase();
  if (TEXT_EXTENSIONS.has(extension)) {
    return readFile(path, "utf8");
  }
  const buffer = await readFile(path);
  if (PDF_EXTENSIONS.has(extension)) {
    return decodePdf(buffer);
  }
  if (DOCX_EXTENSIONS.has(extension)) {
    return decodeDocx(buffer);
  }
  throw new Error(
    `binary decode not yet implemented for ${extension || "this file type"}: ${path}`,
  );
}
