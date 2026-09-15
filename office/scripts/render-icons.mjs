/**
 * Renders every square brand asset from one definition.
 *
 * The mark geometry and the brand gradient live here so the favicon, the
 * in-app mark and the packaged application icon cannot drift apart. The
 * horizontal lockup (`public/logo-long.svg`) is hand-authored because it also
 * carries the wordmark letterforms; it repeats the gradient stops below and
 * has a comment saying so.
 *
 * Run: `node ./scripts/render-icons.mjs` from `office/`.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

/** The Redrob mark: two chevrons around a white counter. */
const MARK_PATH =
  "M19.4887 7.59543V3.9548L16.5942 2.90175L9.99436 0.5L7.09706 1.55446L0.5 3.9548V7.59543L2.09788 8.17686L7.09565 9.99577V6.35795L9.99295 5.30349L11.4346 4.77837L12.8762 4.25326V9.99999V15.7411L9.99295 14.6909V14.6866V14.6895L7.09565 13.635V10.0028L2.10773 11.8189L0.5 12.4046V16.0452L9.99436 19.5L19.4887 16.0452V12.4046L17.881 11.8189L12.879 9.99858L17.8908 8.17404L19.4901 7.59261L19.4887 7.59543Z";

/** Bright blue into deep navy, top-left to bottom-right. */
const GRADIENT_STOPS = [
  { offset: "0%", color: "#3E7BFF" },
  { offset: "55%", color: "#2B58F0" },
  { offset: "100%", color: "#101C63" },
];

/** The dark the wordmark and the on-dark tile are set in. */
const INK = "#000921";

/**
 * Bound to the shape rather than to the canvas. The app icon draws the mark
 * inside a scaled group, and a canvas-space gradient there spans forty times
 * the mark, so the whole shape samples one flat colour off the first stop.
 */
function gradientDef(id) {
  const stops = GRADIENT_STOPS.map(
    (stop) => `      <stop offset="${stop.offset}" stop-color="${stop.color}"/>`,
  ).join("\n");
  return `  <defs>
    <linearGradient id="${id}" x1="0" y1="0" x2="1" y2="1" gradientUnits="objectBoundingBox">
${stops}
    </linearGradient>
  </defs>`;
}

/**
 * 20x20 on a white tile. The square logo: used in the browser tab, on the boot
 * screen and as the assistant's avatar in chat.
 *
 * The tile is not decoration. The mark is a dark gradient with a white counter
 * cut out of its middle, so on a white page the counter disappears and the
 * shape reads as solid. It needs its own ground.
 */
const logoSvg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 20 20" fill="none">
${gradientDef("redrob-mark")}
  <rect width="20" height="20" rx="4" fill="#FFFFFF"/>
  <g transform="translate(10 10) scale(0.62) translate(-10 -10)">
    <path d="${MARK_PATH}" fill="url(#redrob-mark)"/>
  </g>
</svg>
`;

/** 20x20 on the brand navy, for chat avatars and dark chrome. */
const logoOnDarkSvg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 20 20" fill="none">
${gradientDef("redrob-mark-on-dark")}
  <rect width="20" height="20" rx="4" fill="${INK}"/>
  <g transform="translate(10 10) scale(0.62) translate(-10 -10)">
    <path d="${MARK_PATH}" fill="url(#redrob-mark-on-dark)"/>
  </g>
</svg>
`;

/**
 * Solid plate, hard mark, no blur. ~11% inset so the shape survives being
 * scaled down to a 16px taskbar slot.
 */
const iconSvg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024" viewBox="0 0 1024 1024" shape-rendering="geometricPrecision">
${gradientDef("redrob-icon")}
  <rect width="1024" height="1024" fill="#FFFFFF"/>
  <g transform="translate(112,112) scale(40)">
    <path d="${MARK_PATH}" fill="url(#redrob-icon)"/>
  </g>
</svg>
`;

/** Sizes Windows Explorer and the taskbar actually ask for. */
const ICO_SIZES = [16, 24, 32, 48, 64, 128, 256];

/**
 * A minimal ICO container. The format is a header plus a directory plus the
 * image blobs, and every size we ship is a PNG, so there is nothing here that
 * a bitmap encoder would do better.
 */
function buildIco(images) {
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0); // reserved
  header.writeUInt16LE(1, 2); // type: icon
  header.writeUInt16LE(images.length, 4);

  const directory = Buffer.alloc(16 * images.length);
  let offset = header.length + directory.length;
  images.forEach((image, index) => {
    const entry = index * 16;
    // 256 is stored as 0: the field is one byte and 256 does not fit.
    directory.writeUInt8(image.size >= 256 ? 0 : image.size, entry);
    directory.writeUInt8(image.size >= 256 ? 0 : image.size, entry + 1);
    directory.writeUInt8(0, entry + 2); // palette
    directory.writeUInt8(0, entry + 3); // reserved
    directory.writeUInt16LE(1, entry + 4); // colour planes
    directory.writeUInt16LE(32, entry + 6); // bits per pixel
    directory.writeUInt32LE(image.data.length, entry + 8);
    directory.writeUInt32LE(offset, entry + 12);
    offset += image.data.length;
  });

  return Buffer.concat([header, directory, ...images.map((image) => image.data)]);
}

async function main() {
  mkdirSync(join(root, "build"), { recursive: true });
  writeFileSync(join(root, "build/icon.svg"), iconSvg);
  writeFileSync(join(root, "src/renderer/public/logo.svg"), logoSvg);
  writeFileSync(join(root, "src/renderer/public/logo-on-dark.svg"), logoOnDarkSvg);

  const master = Buffer.from(iconSvg);
  const png = await sharp(master, { density: 384 }).resize(1024, 1024).png().toBuffer();
  writeFileSync(join(root, "build/icon.png"), png);

  const images = [];
  for (const size of ICO_SIZES) {
    images.push({
      size,
      data: await sharp(master, { density: 384 }).resize(size, size).png().toBuffer(),
    });
  }
  writeFileSync(join(root, "build/icon.ico"), buildIco(images));

  console.log(`ok ${join(root, "build/icon.png")}`);
  console.log(`ok ${join(root, "build/icon.ico")}`);
}

await main();
