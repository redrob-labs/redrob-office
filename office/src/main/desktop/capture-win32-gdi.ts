import { createRequire } from "node:module";
import { nativeImage } from "electron";
import { UnsupportedDesktopError } from "./backend.js";

/**
 * Screen capture that does not use DXGI Desktop Duplication.
 *
 * Chromium's desktopCapturer on hybrid-GPU Windows often logs
 * "Failed to capture 1 frames within 500 milliseconds" / "Duplication failed"
 * and returns blank thumbs. GDI BitBlt from the virtual-screen DC still works
 * in those setups (same class of fallback Chromium uses when DXGI init fails).
 */

const SRCCOPY = 0x00cc_0020;
const BI_RGB = 0;
const DIB_RGB_COLORS = 0;

type GdiApi = {
  GetDC: (hwnd: null) => unknown;
  ReleaseDC: (hwnd: null, hdc: unknown) => number;
  CreateCompatibleDC: (hdc: unknown) => unknown;
  CreateCompatibleBitmap: (
    hdc: unknown,
    width: number,
    height: number,
  ) => unknown;
  SelectObject: (hdc: unknown, obj: unknown) => unknown;
  BitBlt: (
    hdcDest: unknown,
    x: number,
    y: number,
    width: number,
    height: number,
    hdcSrc: unknown,
    xSrc: number,
    ySrc: number,
    rop: number,
  ) => number;
  DeleteDC: (hdc: unknown) => number;
  DeleteObject: (obj: unknown) => number;
  GetDIBits: (
    hdc: unknown,
    hbitmap: unknown,
    start: number,
    lines: number,
    bits: Buffer,
    bmi: Buffer,
    usage: number,
  ) => number;
};

let api: GdiApi | null = null;

function load(): GdiApi {
  if (api) return api;
  if (process.platform !== "win32") {
    throw new UnsupportedDesktopError("GDI capture exists only on Windows");
  }
  let koffi: typeof import("koffi");
  try {
    const require_ = createRequire(import.meta.url);
    koffi = require_("koffi") as typeof import("koffi");
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    throw new UnsupportedDesktopError(
      `The FFI bridge could not be loaded for GDI capture: ${message}`,
    );
  }
  const user32 = koffi.load("user32.dll");
  const gdi32 = koffi.load("gdi32.dll");
  api = {
    GetDC: user32.func("__stdcall", "GetDC", "void *", ["void *"]),
    ReleaseDC: user32.func("__stdcall", "ReleaseDC", "int32", [
      "void *",
      "void *",
    ]),
    CreateCompatibleDC: gdi32.func("__stdcall", "CreateCompatibleDC", "void *", [
      "void *",
    ]),
    CreateCompatibleBitmap: gdi32.func(
      "__stdcall",
      "CreateCompatibleBitmap",
      "void *",
      ["void *", "int32", "int32"],
    ),
    SelectObject: gdi32.func("__stdcall", "SelectObject", "void *", [
      "void *",
      "void *",
    ]),
    BitBlt: gdi32.func("__stdcall", "BitBlt", "int32", [
      "void *",
      "int32",
      "int32",
      "int32",
      "int32",
      "void *",
      "int32",
      "int32",
      "uint32",
    ]),
    DeleteDC: gdi32.func("__stdcall", "DeleteDC", "int32", ["void *"]),
    DeleteObject: gdi32.func("__stdcall", "DeleteObject", "int32", ["void *"]),
    GetDIBits: gdi32.func("__stdcall", "GetDIBits", "int32", [
      "void *",
      "void *",
      "uint32",
      "uint32",
      "void *",
      "void *",
      "uint32",
    ]),
  };
  return api;
}

/** Physical virtual-desktop rect → PNG bytes (BGRA via GDI). */
export function capturePhysicalRectPng(rect: {
  x: number;
  y: number;
  width: number;
  height: number;
}): Buffer {
  const width = Math.max(1, Math.round(rect.width));
  const height = Math.max(1, Math.round(rect.height));
  const x = Math.round(rect.x);
  const y = Math.round(rect.y);
  const gdi = load();

  const hScreen = gdi.GetDC(null);
  if (!hScreen) {
    throw new UnsupportedDesktopError("GetDC(NULL) failed for screen capture");
  }
  const hDC = gdi.CreateCompatibleDC(hScreen);
  const hBitmap = gdi.CreateCompatibleBitmap(hScreen, width, height);
  if (!hDC || !hBitmap) {
    if (hBitmap) gdi.DeleteObject(hBitmap);
    if (hDC) gdi.DeleteDC(hDC);
    gdi.ReleaseDC(null, hScreen);
    throw new UnsupportedDesktopError("Could not create a GDI bitmap for capture");
  }

  const previous = gdi.SelectObject(hDC, hBitmap);
  try {
    if (!gdi.BitBlt(hDC, 0, 0, width, height, hScreen, x, y, SRCCOPY)) {
      throw new UnsupportedDesktopError(
        `BitBlt failed for ${width}x${height} at ${x},${y}`,
      );
    }

    // GetDIBits requires the bitmap not be selected into a DC.
    gdi.SelectObject(hDC, previous);

    // Bottom-up 32bpp DIB (positive height) — reliable across drivers.
    const bmi = Buffer.alloc(40);
    bmi.writeUInt32LE(40, 0);
    bmi.writeInt32LE(width, 4);
    bmi.writeInt32LE(height, 8);
    bmi.writeUInt16LE(1, 12);
    bmi.writeUInt16LE(32, 14);
    bmi.writeUInt32LE(BI_RGB, 16);

    const stride = width * 4;
    const pixels = Buffer.alloc(stride * height);
    const lines = gdi.GetDIBits(
      hScreen,
      hBitmap,
      0,
      height,
      pixels,
      bmi,
      DIB_RGB_COLORS,
    );
    if (lines === 0) {
      throw new UnsupportedDesktopError("GetDIBits returned no rows");
    }

    const topDown = toTopDownOpaqueBgra(pixels, width, height);
    if (looksBlank(topDown)) {
      throw new UnsupportedDesktopError(
        "GDI capture came back blank (a secure desktop or locked session hides the screen).",
      );
    }

    const image = nativeImage.createFromBitmap(topDown, { width, height });
    if (image.isEmpty()) {
      throw new UnsupportedDesktopError("GDI capture produced an empty image");
    }
    return image.toPNG();
  } finally {
    gdi.DeleteObject(hBitmap);
    gdi.DeleteDC(hDC);
    gdi.ReleaseDC(null, hScreen);
  }
}

/**
 * Bottom-up BGRA from GetDIBits → top-down BGRA for nativeImage.
 *
 * BitBlt leaves the alpha byte at 0, and Chromium reads this buffer as
 * premultiplied BGRA — so an un-forced alpha yields a fully transparent
 * screenshot, which a model then "reads" by inventing what it expects.
 */
export function toTopDownOpaqueBgra(
  bottomUp: Buffer,
  width: number,
  height: number,
): Buffer {
  const stride = width * 4;
  const out = Buffer.alloc(stride * height);
  for (let row = 0; row < height; row++) {
    bottomUp.copy(
      out,
      row * stride,
      (height - 1 - row) * stride,
      (height - row) * stride,
    );
  }
  for (let i = 3; i < out.length; i += 4) out[i] = 0xff;
  return out;
}

/** Every pixel the same colour: a locked session or a failed readback. */
export function looksBlank(bgra: Buffer): boolean {
  if (bgra.length < 8) return true;
  const b = bgra[0];
  const g = bgra[1];
  const r = bgra[2];
  for (let i = 4; i < bgra.length; i += 4) {
    if (bgra[i] !== b || bgra[i + 1] !== g || bgra[i + 2] !== r) return false;
  }
  return true;
}

export function win32GdiCaptureAvailable(): boolean {
  return process.platform === "win32" && process.arch === "x64";
}
