import { trimImageWhitespace } from "./trim-whitespace.js";

/**
 * Last stop before an image buffer enters a model / VLM path.
 * PDF page renders and user uploads must both go through here.
 * Currently: whitespace trim only (no resize / colorspace / format change).
 */
export async function prepareImageForModel(imageBytes: Buffer): Promise<Buffer> {
  const result = await trimImageWhitespace(imageBytes);
  return result.buffer;
}
