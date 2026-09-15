/**
 * What a document looks like, reduced to something the app can draw itself.
 *
 * The office formats are laid out by a renderer, not stored as pictures, so to
 * show one without a whole office suite the app builds a small model of what is
 * on the page and draws that. A spreadsheet becomes a grid with its charts, a
 * deck becomes a run of slides, a Word file travels as its own bytes because a
 * library draws it in the page. Markdown was already text.
 */

export type DocRenderModel =
  | { kind: "md"; text: string }
  // A web page as it was written. It is shown in a sandboxed frame with its
  // scripts left running, because a deck whose arrow keys do nothing is not a
  // preview of that deck.
  | { kind: "html"; html: string }
  | { kind: "docx"; base64: string }
  | { kind: "xlsx"; sheets: XlsxSheetView[] }
  | { kind: "pptx"; slides: PptxSlideView[]; widthEmu: number; heightEmu: number }
  // A Hangul (HWP/HWPX) document, already laid out into one SVG per page by the
  // parser. Each string is a self-sizing <svg>, so the app just draws it. The
  // @font-face for the bundled Korean font rides along so a machine with none
  // installed still draws the text.
  | { kind: "hwp"; pages: string[]; fontCss?: string }
  | { kind: "unsupported"; reason: string };

export interface XlsxCellView {
  text: string;
  bold?: boolean;
  italic?: boolean;
  align?: "left" | "center" | "right";
  /** Background fill as #rrggbb, when the cell has one. */
  fill?: string;
  /** Font colour as #rrggbb, when set. */
  color?: string;
  /** A number, so it lines up on the right and never wraps. */
  numeric?: boolean;
  /** How many columns/rows this cell spans, when it heads a merged block. */
  colSpan?: number;
  rowSpan?: number;
  /** Covered by the merge to its upper-left; drawn as nothing. */
  covered?: boolean;
}

export interface XlsxRowView {
  cells: XlsxCellView[];
  /** Row height in points, when it is not the default. */
  heightPt?: number;
}

export interface XlsxChartView {
  title: string;
  type: "bar" | "column" | "line" | "pie";
  categories: string[];
  series: XlsxSeriesView[];
}

export interface XlsxSeriesView {
  name: string;
  values: number[];
}

export interface XlsxSheetView {
  name: string;
  /** Column widths in character units, one per column in the grid. */
  columnWidths: number[];
  rows: XlsxRowView[];
  charts: XlsxChartView[];
}

export interface PptxTextRun {
  text: string;
  bold?: boolean;
  italic?: boolean;
}

export interface PptxParagraphView {
  runs: PptxTextRun[];
  /** Indentation level for a bulleted line; 0 is the outermost. */
  level: number;
  bullet: boolean;
}

export interface PptxSlideView {
  title: string;
  body: PptxParagraphView[];
}
