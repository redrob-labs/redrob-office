import { describe, expect, it } from "vitest";
import sharp from "sharp";
import { expandCropToMinShortSide, trimImageWhitespace } from "./trim-whitespace.js";
import { prepareImageForModel } from "./prepare-image.js";

async function paddedContentPng(): Promise<Buffer> {
  // 400x300 white canvas, dark content block inset → large borders.
  const content = await sharp({
    create: {
      width: 200,
      height: 150,
      channels: 3,
      background: { r: 32, g: 32, b: 32 },
    },
  })
    .png()
    .toBuffer();
  return sharp({
    create: {
      width: 400,
      height: 300,
      channels: 3,
      background: { r: 255, g: 255, b: 255 },
    },
  })
    .composite([{ input: content, left: 100, top: 75 }])
    .png()
    .toBuffer();
}

async function fullBleedPhotoPng(): Promise<Buffer> {
  // Varied pixels edge-to-edge — no uniform border to trim.
  const width = 320;
  const height = 240;
  const raw = Buffer.alloc(width * height * 3);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const i = (y * width + x) * 3;
      raw[i] = (x * 3 + y * 5) % 256;
      raw[i + 1] = (x * 7 + y * 2) % 256;
      raw[i + 2] = (x * 11 + y * 13) % 256;
    }
  }
  return sharp(raw, { raw: { width, height, channels: 3 } })
    .png()
    .toBuffer();
}

async function tinyLogoOnWhitePng(): Promise<Buffer> {
  // 500x500 white with a 40x40 logo — trim then expand to 224.
  const logo = await sharp({
    create: {
      width: 40,
      height: 40,
      channels: 3,
      background: { r: 0, g: 0, b: 0 },
    },
  })
    .png()
    .toBuffer();
  return sharp({
    create: {
      width: 500,
      height: 500,
      channels: 3,
      background: { r: 255, g: 255, b: 255 },
    },
  })
    .composite([{ input: logo, left: 230, top: 230 }])
    .png()
    .toBuffer();
}

async function tinyOnSmallCanvasPng(): Promise<Buffer> {
  // Original short side 100 < 224 → expand cannot reach min → fallback.
  const logo = await sharp({
    create: {
      width: 20,
      height: 20,
      channels: 3,
      background: { r: 0, g: 0, b: 0 },
    },
  })
    .png()
    .toBuffer();
  return sharp({
    create: {
      width: 100,
      height: 100,
      channels: 3,
      background: { r: 255, g: 255, b: 255 },
    },
  })
    .composite([{ input: logo, left: 40, top: 40 }])
    .png()
    .toBuffer();
}

describe("expandCropToMinShortSide", () => {
  it("expands around center and clamps to original", () => {
    const out = expandCropToMinShortSide(
      { left: 230, top: 230, width: 40, height: 40 },
      500,
      500,
      224,
    );
    expect(out.expanded).toBe(true);
    expect(out.meetsMin).toBe(true);
    expect(out.width).toBe(224);
    expect(out.height).toBe(224);
    expect(out.left).toBe(138);
    expect(out.top).toBe(138);
  });

  it("reports unmet min when original is too small", () => {
    const out = expandCropToMinShortSide(
      { left: 40, top: 40, width: 20, height: 20 },
      100,
      100,
      224,
    );
    expect(out.meetsMin).toBe(false);
    expect(out.width).toBe(100);
    expect(out.height).toBe(100);
  });
});

describe("trimImageWhitespace", () => {
  it("trims, expands small content, falls back only when 224 is impossible", async () => {
    const padded = await paddedContentPng();
    const photo = await fullBleedPhotoPng();
    const logo = await tinyLogoOnWhitePng();
    const small = await tinyOnSmallCanvasPng();

    console.info("--- case 1: padded content (expect expand) ---");
    const r1 = await trimImageWhitespace(padded);
    expect(r1.fallback).toBe(false);
    expect(r1.expanded).toBe(true);
    expect(Math.min(r1.resultWidth, r1.resultHeight)).toBeGreaterThanOrEqual(224);

    console.info("--- case 2: full-bleed photo ---");
    const r2 = await trimImageWhitespace(photo);
    expect(r2.fallback).toBe(false);
    expect(r2.expanded).toBe(false);
    expect(r2.reductionRatio).toBeLessThan(0.05);

    console.info("--- case 3: tiny logo on large white (expect expand to 224) ---");
    const r3 = await trimImageWhitespace(logo);
    expect(r3.fallback).toBe(false);
    expect(r3.expanded).toBe(true);
    expect(r3.resultWidth).toBe(224);
    expect(r3.resultHeight).toBe(224);

    console.info("--- case 4: tiny on 100px canvas (expect original fallback) ---");
    const r4 = await trimImageWhitespace(small);
    expect(r4.fallback).toBe(true);
    expect(r4.buffer.equals(small)).toBe(true);

    const prepared = await prepareImageForModel(small);
    expect(prepared.equals(small)).toBe(true);

    console.info("--- summary ---");
    console.info(
      `padded: ${r1.resultWidth}x${r1.resultHeight} reduction=${(r1.reductionRatio * 100).toFixed(1)}% expanded=${r1.expanded}`,
    );
    console.info(
      `photo: ${r2.resultWidth}x${r2.resultHeight} reduction=${(r2.reductionRatio * 100).toFixed(1)}% expanded=${r2.expanded}`,
    );
    console.info(
      `logo: ${r3.resultWidth}x${r3.resultHeight} reduction=${(r3.reductionRatio * 100).toFixed(1)}% expanded=${r3.expanded}`,
    );
    console.info(`small: fallback expanded=${r4.expanded}`);
  });
});
