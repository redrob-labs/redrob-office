export type DocFormat = "xlsx" | "docx" | "pptx";

export interface DocumentOutline {
  format: DocFormat;
  path: string;
  title?: string;
  sheets?: Array<{ name: string; rows: number; cols: number }>;
  paragraphs?: number;
  slides?: Array<{ index: number; title: string }>;
}

export interface SheetCellChange {
  addr: string;
  before: string | number | boolean | null;
  after: string | number | boolean | null;
}

export interface SheetDiff {
  kind: "sheet";
  sheet: string;
  cells: SheetCellChange[];
  /** When cells.length would exceed 100, summarize ranges instead. */
  summaryRanges?: Array<{ range: string; count: number }>;
  truncated?: boolean;
}

export interface DocParagraphDiff {
  kind: "doc";
  hunks: Array<{
    index: number;
    before: string;
    after: string;
  }>;
}

export interface SlideDiff {
  kind: "slide";
  changes: Array<{
    index: number;
    action: "add" | "edit" | "reorder" | "image";
    summary: string;
  }>;
}

export type DocDiff = SheetDiff | DocParagraphDiff | SlideDiff;

export type SheetOp =
  | {
      op: "writeRange";
      sheet: string;
      start: string;
      values: Array<Array<string | number | boolean | null>>;
    }
  | {
      op: "addFormula";
      sheet: string;
      cell: string;
      formula: string;
    }
  | {
      op: "sort";
      sheet: string;
      range: string;
      column: number;
      ascending?: boolean;
    }
  | {
      op: "insertRows";
      sheet: string;
      startRow: number;
      count: number;
    }
  | {
      op: "chart";
      sheet: string;
      type: "bar" | "column";
      dataRange: string;
      title?: string;
      anchorCell?: string;
    };

export type WordOp =
  | { op: "findReplace"; find: string; replace: string; all?: boolean }
  | { op: "insertSection"; heading: string; body: string; afterIndex?: number }
  | { op: "applyStyle"; paragraphIndex: number; style: "Heading1" | "Heading2" | "Normal" }
  | {
      op: "setParagraphs";
      paragraphs: Array<{ text: string; style?: "Heading1" | "Heading2" | "Normal" }>;
    };

export type SlideOp =
  | { op: "add"; title: string; body?: string; atIndex?: number }
  | { op: "setText"; index: number; title?: string; body?: string }
  | { op: "insertImage"; index: number; imagePath: string }
  | { op: "reorder"; from: number; to: number };

export type DocOp = SheetOp | WordOp | SlideOp;

export interface ApplyResult {
  diff: DocDiff;
  opHash: string;
}

export interface DocumentAdapter {
  readonly format: DocFormat;
  readonly path: string;
  open(path: string): Promise<void>;
  outline(): Promise<DocumentOutline>;
  snapshot(destPath: string): Promise<void>;
  applyOps(ops: DocOp[]): Promise<ApplyResult>;
  /** Compute diff without mutating the live workbook (used for dryRun). */
  previewOps(ops: DocOp[]): Promise<ApplyResult>;
  save(): Promise<void>;
  close(): Promise<void>;
  readRange(args: Record<string, unknown>): Promise<unknown>;
  search(query: string): Promise<Array<{ loc: string; text: string }>>;
}
