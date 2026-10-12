/**
 * license-excerpt.ts — the text shown on the prototype's License page.
 *
 * The real NSIS installer renders the FULL repo LICENSE (Apache 2.0) via
 * MUI_PAGE_LICENSE pointing at a packaged copy of LICENSE. For the design
 * prototype we show the opening of that same license so the page looks and
 * reads correctly; the porting step swaps this excerpt for the packaged full
 * file (see PORTING.md -> license).
 *
 * Source: repo-root LICENSE (Apache License 2.0).
 */
export const LICENSE_EXCERPT = `Apache License
Version 2.0, January 2004
http://www.apache.org/licenses/

TERMS AND CONDITIONS FOR USE, REPRODUCTION, AND DISTRIBUTION

1. Definitions.

"License" shall mean the terms and conditions for use, reproduction, and
distribution as defined by Sections 1 through 9 of this document.

"Licensor" shall mean the copyright owner or entity authorized by the
copyright owner that is granting the License.

… (the installer displays the full Apache 2.0 text from the packaged LICENSE file)`
