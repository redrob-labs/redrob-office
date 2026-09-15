import { describe, expect, it } from "vitest";
import {
  encodeChord,
  encodeClick,
  encodeKeyInput,
  encodeMouseInput,
  encodeScroll,
  encodeText,
  encodeUnicodeInput,
  inputCount,
  INPUT_SIZE,
  KEYEVENTF_KEYUP,
  KEYEVENTF_UNICODE,
  MOUSEEVENTF_LEFTDOWN,
  MOUSEEVENTF_LEFTUP,
  MOUSEEVENTF_WHEEL,
  WHEEL_DELTA,
} from "./win32-input";

/*
 * These assert the documented x64 layout of INPUT, KEYBDINPUT and MOUSEINPUT
 * field by field. A field one byte out does not fail loudly on Windows — it
 * presses a different key or moves the wrong pointer — and this app is written
 * on machines that cannot run the call at all, so the offsets are checked here.
 */

describe("INPUT layout", () => {
  it("is 40 bytes, the size Windows is told to expect", () => {
    expect(INPUT_SIZE).toBe(40);
    expect(encodeKeyInput(0x41, 0)).toHaveLength(40);
    expect(encodeMouseInput(0)).toHaveLength(40);
  });

  it("counts records the way SendInput counts them", () => {
    expect(inputCount(encodeChord([0x11, 0x41]))).toBe(4);
    expect(inputCount(encodeClick("left", 2))).toBe(4);
  });
});

describe("encodeKeyInput", () => {
  it("writes a keyboard record with the key at the documented offset", () => {
    const input = encodeKeyInput(0x41, 0);
    expect(input.readUInt32LE(0)).toBe(1); // INPUT_KEYBOARD
    expect(input.readUInt16LE(8)).toBe(0x41); // wVk
    expect(input.readUInt32LE(12)).toBe(0); // dwFlags
  });

  it("marks a release with KEYEVENTF_KEYUP", () => {
    expect(encodeKeyInput(0x41, KEYEVENTF_KEYUP).readUInt32LE(12)).toBe(
      KEYEVENTF_KEYUP,
    );
  });

  it("leaves the padding and the trailing fields zeroed", () => {
    const input = encodeKeyInput(0x41, 0);
    expect(input.readUInt32LE(4)).toBe(0); // union alignment padding
    expect(input.readUInt32LE(16)).toBe(0); // time
    expect(input.readBigUInt64LE(24)).toBe(0n); // dwExtraInfo
  });
});

describe("encodeUnicodeInput", () => {
  it("puts the character in wScan and leaves wVk empty", () => {
    const input = encodeUnicodeInput(0xac00, false);
    expect(input.readUInt16LE(8)).toBe(0); // wVk
    expect(input.readUInt16LE(10)).toBe(0xac00); // wScan
    expect(input.readUInt32LE(12)).toBe(KEYEVENTF_UNICODE);
  });
});

describe("encodeText", () => {
  it("presses and releases every character", () => {
    expect(inputCount(encodeText("hi"))).toBe(4);
  });

  it("types a character outside the basic plane as its two surrogates", () => {
    // One emoji is two UTF-16 code units, so four records rather than two.
    expect(inputCount(encodeText("😀"))).toBe(4);
  });

  it("types text that is not US English", () => {
    const input = encodeText("한");
    expect(input.readUInt16LE(10)).toBe("한".charCodeAt(0));
    expect(input.readUInt32LE(12)).toBe(KEYEVENTF_UNICODE);
  });

  it("has nothing to send for empty text", () => {
    expect(encodeText("")).toHaveLength(0);
  });
});

describe("encodeChord", () => {
  it("holds the modifier while the key goes down", () => {
    const input = encodeChord([0x11, 0x41]);
    expect(input.readUInt16LE(8)).toBe(0x11); // ctrl down
    expect(input.readUInt32LE(12)).toBe(0);
    expect(input.readUInt16LE(INPUT_SIZE + 8)).toBe(0x41); // a down
  });

  it("releases in reverse, so the modifier is let go last", () => {
    const input = encodeChord([0x11, 0x41]);
    expect(input.readUInt16LE(INPUT_SIZE * 2 + 8)).toBe(0x41);
    expect(input.readUInt32LE(INPUT_SIZE * 2 + 12)).toBe(KEYEVENTF_KEYUP);
    expect(input.readUInt16LE(INPUT_SIZE * 3 + 8)).toBe(0x11);
    expect(input.readUInt32LE(INPUT_SIZE * 3 + 12)).toBe(KEYEVENTF_KEYUP);
  });
});

describe("encodeClick", () => {
  it("writes a mouse record with down then up", () => {
    const input = encodeClick("left", 1);
    expect(input.readUInt32LE(0)).toBe(0); // INPUT_MOUSE
    expect(input.readUInt32LE(20)).toBe(MOUSEEVENTF_LEFTDOWN);
    expect(input.readUInt32LE(INPUT_SIZE + 20)).toBe(MOUSEEVENTF_LEFTUP);
  });

  it("repeats the pair for a double click", () => {
    expect(inputCount(encodeClick("left", 2))).toBe(4);
  });
});

describe("encodeScroll", () => {
  it("puts notches in mouseData, positive away from the reader", () => {
    const up = encodeScroll(2);
    expect(up.readUInt32LE(20)).toBe(MOUSEEVENTF_WHEEL);
    expect(up.readInt32LE(16)).toBe(2 * WHEEL_DELTA);
  });

  it("writes a negative notch count without wrapping into a huge number", () => {
    expect(encodeScroll(-1).readInt32LE(16)).toBe(-WHEEL_DELTA);
  });
});
