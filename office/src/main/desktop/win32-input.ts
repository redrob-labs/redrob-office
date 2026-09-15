/**
 * The bytes Win32's `SendInput` expects.
 *
 * `INPUT` is a tagged union with alignment padding, and getting a field one
 * byte out does not fail loudly — it moves the wrong pointer or presses the
 * wrong key. Since this app is developed and tested on machines that cannot
 * run it, the layout is built here as plain buffers so it can be checked
 * against the documented offsets without Windows, leaving the backend with
 * nothing to get wrong but the call itself.
 *
 * x64 layout, which is the only architecture the app ships:
 *
 *   INPUT        type u32 @0, 4 bytes padding, union @8            size 40
 *   KEYBDINPUT   wVk u16 @8, wScan u16 @10, dwFlags u32 @12,
 *                time u32 @16, dwExtraInfo u64 @24
 *   MOUSEINPUT   dx i32 @8, dy i32 @12, mouseData u32 @16,
 *                dwFlags u32 @20, time u32 @24, dwExtraInfo u64 @32
 */

export const INPUT_SIZE = 40;

const INPUT_MOUSE = 0;
const INPUT_KEYBOARD = 1;

export const KEYEVENTF_KEYUP = 0x0002;
export const KEYEVENTF_UNICODE = 0x0004;

export const MOUSEEVENTF_LEFTDOWN = 0x0002;
export const MOUSEEVENTF_LEFTUP = 0x0004;
export const MOUSEEVENTF_RIGHTDOWN = 0x0008;
export const MOUSEEVENTF_RIGHTUP = 0x0010;
export const MOUSEEVENTF_MIDDLEDOWN = 0x0020;
export const MOUSEEVENTF_MIDDLEUP = 0x0040;
export const MOUSEEVENTF_WHEEL = 0x0800;

/** One wheel notch, as Windows counts them. */
export const WHEEL_DELTA = 120;

/** One key press or release. */
export function encodeKeyInput(virtualKey: number, flags: number): Buffer {
  const input = Buffer.alloc(INPUT_SIZE);
  input.writeUInt32LE(INPUT_KEYBOARD, 0);
  input.writeUInt16LE(virtualKey, 8);
  input.writeUInt16LE(0, 10);
  input.writeUInt32LE(flags, 12);
  return input;
}

/**
 * One character, as a unicode scan code rather than a key.
 *
 * Pressing keys to produce text assumes the layout in front of the person, so
 * the same code would type something else on a keyboard that is not US
 * English. `KEYEVENTF_UNICODE` says the character outright.
 */
export function encodeUnicodeInput(codeUnit: number, keyUp: boolean): Buffer {
  const input = Buffer.alloc(INPUT_SIZE);
  input.writeUInt32LE(INPUT_KEYBOARD, 0);
  input.writeUInt16LE(0, 8);
  input.writeUInt16LE(codeUnit, 10);
  input.writeUInt32LE(KEYEVENTF_UNICODE | (keyUp ? KEYEVENTF_KEYUP : 0), 12);
  return input;
}

/** One mouse button transition or wheel notch, at wherever the cursor is. */
export function encodeMouseInput(flags: number, mouseData = 0): Buffer {
  const input = Buffer.alloc(INPUT_SIZE);
  input.writeUInt32LE(INPUT_MOUSE, 0);
  input.writeInt32LE(0, 8);
  input.writeInt32LE(0, 12);
  input.writeUInt32LE(mouseData >>> 0, 16);
  input.writeUInt32LE(flags, 20);
  return input;
}

/**
 * Text as the events that type it. Every code unit is sent, so characters
 * outside the basic plane go through as their two surrogates, which is what
 * Windows expects.
 */
export function encodeText(text: string): Buffer {
  const inputs: Buffer[] = [];
  for (let i = 0; i < text.length; i += 1) {
    const codeUnit = text.charCodeAt(i);
    inputs.push(encodeUnicodeInput(codeUnit, false));
    inputs.push(encodeUnicodeInput(codeUnit, true));
  }
  return Buffer.concat(inputs);
}

/**
 * A chord as press-all then release-all in reverse, so the modifiers are still
 * held when the key goes down and are let go in the order a person would.
 */
export function encodeChord(virtualKeys: readonly number[]): Buffer {
  const down = virtualKeys.map((key) => encodeKeyInput(key, 0));
  const up = [...virtualKeys]
    .reverse()
    .map((key) => encodeKeyInput(key, KEYEVENTF_KEYUP));
  return Buffer.concat([...down, ...up]);
}

const BUTTON_FLAGS = {
  left: [MOUSEEVENTF_LEFTDOWN, MOUSEEVENTF_LEFTUP],
  right: [MOUSEEVENTF_RIGHTDOWN, MOUSEEVENTF_RIGHTUP],
  middle: [MOUSEEVENTF_MIDDLEDOWN, MOUSEEVENTF_MIDDLEUP],
} as const;

export function encodeClick(
  button: keyof typeof BUTTON_FLAGS,
  count: number,
): Buffer {
  const [downFlag, upFlag] = BUTTON_FLAGS[button];
  const inputs: Buffer[] = [];
  for (let i = 0; i < count; i += 1) {
    inputs.push(encodeMouseInput(downFlag));
    inputs.push(encodeMouseInput(upFlag));
  }
  return Buffer.concat(inputs);
}

/** Positive ticks scroll away from the reader, which is what Windows calls up. */
export function encodeScroll(ticks: number): Buffer {
  return encodeMouseInput(MOUSEEVENTF_WHEEL, ticks * WHEEL_DELTA);
}

/** How many `INPUT` records a buffer holds, which is what `SendInput` is told. */
export function inputCount(buffer: Buffer): number {
  return buffer.length / INPUT_SIZE;
}
