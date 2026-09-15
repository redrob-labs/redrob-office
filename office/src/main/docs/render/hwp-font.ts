/**
 * The @font-face that makes Hangul render everywhere. The parser draws each
 * glyph into a fixed box, so the font only decides the glyph's shape, never its
 * place — swapping in a bundled Korean face is safe. Nanum Gothic travels inside
 * the app as base64 so a machine with no Korean font installed still draws the
 * text, not tofu.
 */
import { NANUM_GOTHIC_KR_WOFF2_BASE64 } from "./fonts/nanum-gothic-korean.woff2.js";

export const HWP_FONT_FACE_CSS = `@font-face{font-family:'Nanum Gothic';font-style:normal;font-weight:400;src:url(data:font/woff2;base64,${NANUM_GOTHIC_KR_WOFF2_BASE64}) format('woff2');}`;
