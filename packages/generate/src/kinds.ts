/** Supported template `outputKind` values for `@redrob/generate`. */
export type OutputKind =
  | "markdown"
  | "docx"
  | "pptx"
  | "xlsx"
  | "json"
  | "svg"
  | "html"
  | "hwpx";

/** Classic binary `.hwp` write is not supported; Hancom opens `.hwpx` (OWPML). */
export const OUTPUT_KIND_EXT: Readonly<Record<OutputKind, string>> = {
  markdown: "md",
  docx: "docx",
  pptx: "pptx",
  xlsx: "xlsx",
  json: "json",
  svg: "svg",
  html: "html",
  hwpx: "hwpx",
};

export const OUTPUT_KIND_MIME: Readonly<Record<OutputKind, string>> = {
  markdown: "text/markdown; charset=utf-8",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  json: "application/json; charset=utf-8",
  svg: "image/svg+xml; charset=utf-8",
  html: "text/html; charset=utf-8",
  hwpx: "application/hwp+zip",
};

const BINARY_KINDS = new Set<OutputKind>(["docx", "pptx", "xlsx", "hwpx"]);

export function isBinaryOutputKind(kind: OutputKind): boolean {
  return BINARY_KINDS.has(kind);
}

export function parseOutputKind(value: string): OutputKind {
  switch (value) {
    case "markdown":
    case "docx":
    case "pptx":
    case "xlsx":
    case "json":
    case "svg":
    case "html":
    case "hwpx":
      return value;
    case "hwp":
      // Alias: writers emit HWPX (modern Hangul package), not legacy CFB `.hwp`.
      return "hwpx";
    default:
      throw new Error(`Unsupported template output kind: ${value}`);
  }
}
