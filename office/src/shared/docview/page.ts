/**
 * A document body wrapped in a whole page, sized for paper. The preview shows
 * this in a frame and Electron prints the very same thing to PDF, so the export
 * is the view on a page.
 */
export const BASE_PAGE_STYLE = `
* { box-sizing: border-box; }
body { margin: 0; padding: 32px; background: #fff; }
@page { margin: 16mm; }
`;

export function wrapPage(style: string, body: string): string {
  return `<!doctype html><html><head><meta charset="utf-8"><style>${BASE_PAGE_STYLE}${style}</style></head><body>${body}</body></html>`;
}
