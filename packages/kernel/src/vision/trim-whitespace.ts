import sharp from "sharp";

const TRIM_THRESHOLD = 16;
/** Minimum short-side length after trim; expand crop toward this before falling back. */
const MIN_SHORT_SIDE = 224;

export type TrimWhitespaceResult = {
  buffer: Buffer;
  trimmed: boolean;
  expanded: boolean;
  fallback: boolean;
  originalWidth: number;
  originalHeight: number;
  resultWidth: number;
  resultHeight: number;
  /** 0 = unchanged area, 1 = fully emptied (not expected). */
  reductionRatio: number;
};

function area(width: number, height: number): number {
  return Math.max(0, width) * Math.max(0, height);
}

type CropBox = {
  left: number;
  top: number;
  width: number;
  height: number;
};

/**
 * Grow a crop box around its center until both sides are ≥ minShort (or hit
 * the original canvas). Returns whether any expansion happened.
 */
export function expandCropToMinShortSide(
  crop: CropBox,
  originalWidth: number,
  originalHeight: number,
  minShort: number = MIN_SHORT_SIDE,
): CropBox & { expanded: boolean; meetsMin: boolean } {
  const cx = crop.left + crop.width / 2;
  const cy = crop.top + crop.height / 2;

  let width = crop.width;
  let height = crop.height;
  let expanded = false;

  if (width < minShort) {
    width = Math.min(minShort, originalWidth);
    expanded = true;
  }
  if (height < minShort) {
    height = Math.min(minShort, originalHeight);
    expanded = true;
  }

  let left = Math.round(cx - width / 2);
  let top = Math.round(cy - height / 2);
  left = Math.max(0, Math.min(left, originalWidth - width));
  top = Math.max(0, Math.min(top, originalHeight - height));

  return {
    left,
    top,
    width,
    height,
    expanded,
    meetsMin: Math.min(width, height) >= minShort,
  };
}

/**
 * Trim uniform (near-)border whitespace. Failures and undersized crops that
 * cannot reach 224px on the short side return the original buffer — never throws.
 */
export async function trimImageWhitespace(input: Buffer): Promise<TrimWhitespaceResult> {
  const fail = (
    reason: string,
    dims: { width: number; height: number } = { width: 0, height: 0 },
  ): TrimWhitespaceResult => {
    console.info(
      `[vision.trim] pass-through original (${reason}) ` +
        `${dims.width}x${dims.height} reduction=0.0% expanded=false`,
    );
    return {
      buffer: input,
      trimmed: false,
      expanded: false,
      fallback: true,
      originalWidth: dims.width,
      originalHeight: dims.height,
      resultWidth: dims.width,
      resultHeight: dims.height,
      reductionRatio: 0,
    };
  };

  try {
    const meta = await sharp(input, { failOn: "none" }).metadata();
    const originalWidth = meta.width ?? 0;
    const originalHeight = meta.height ?? 0;
    const originalArea = area(originalWidth, originalHeight);
    if (originalArea <= 0) {
      return fail("missing dimensions");
    }

    const trimmed = await sharp(input, { failOn: "none" })
      .trim({ threshold: TRIM_THRESHOLD })
      .toBuffer({ resolveWithObject: true });

    const trimLeft = trimmed.info.trimOffsetLeft ?? 0;
    const trimTop = trimmed.info.trimOffsetTop ?? 0;
    const crop = expandCropToMinShortSide(
      {
        left: trimLeft,
        top: trimTop,
        width: trimmed.info.width,
        height: trimmed.info.height,
      },
      originalWidth,
      originalHeight,
      MIN_SHORT_SIDE,
    );

    if (!crop.meetsMin) {
      console.info(
        `[vision.trim] ${originalWidth}x${originalHeight} → trim ${trimmed.info.width}x${trimmed.info.height} ` +
          `expanded=${crop.expanded} → ${crop.width}x${crop.height} ` +
          `fallback (short side < ${MIN_SHORT_SIDE}px within original bounds)`,
      );
      return {
        buffer: input,
        trimmed: false,
        expanded: crop.expanded,
        fallback: true,
        originalWidth,
        originalHeight,
        resultWidth: originalWidth,
        resultHeight: originalHeight,
        reductionRatio: 0,
      };
    }

    const buffer = crop.expanded
      ? await sharp(input, { failOn: "none" })
          .extract({
            left: crop.left,
            top: crop.top,
            width: crop.width,
            height: crop.height,
          })
          .toBuffer()
      : trimmed.data;

    const resultWidth = crop.width;
    const resultHeight = crop.height;
    const reductionRatio = 1 - area(resultWidth, resultHeight) / originalArea;
    const reductionPct = (reductionRatio * 100).toFixed(1);

    console.info(
      `[vision.trim] ${originalWidth}x${originalHeight} → ${resultWidth}x${resultHeight} ` +
        `reduction=${reductionPct}% expanded=${crop.expanded}`,
    );

    return {
      buffer,
      trimmed: reductionRatio > 0.001 || crop.expanded,
      expanded: crop.expanded,
      fallback: false,
      originalWidth,
      originalHeight,
      resultWidth,
      resultHeight,
      reductionRatio,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return fail(`error: ${message}`);
  }
}
