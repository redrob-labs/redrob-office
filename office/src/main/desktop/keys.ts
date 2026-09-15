/**
 * Key names, as a person writes them, turned into what a platform wants.
 *
 * A model asks for "ctrl+shift+t" because that is what the shortcut is called
 * everywhere it is documented. Every backend spells that differently, so the
 * parsing happens once, here, where it can be read and tested without a
 * desktop attached.
 */

export type Modifier = "ctrl" | "alt" | "shift" | "meta";

export interface Chord {
  modifiers: Modifier[];
  /** The one non-modifier key, already normalised. */
  key: string;
}

const MODIFIER_ALIASES: Record<string, Modifier> = {
  ctrl: "ctrl",
  control: "ctrl",
  alt: "alt",
  option: "alt",
  opt: "alt",
  shift: "shift",
  meta: "meta",
  cmd: "meta",
  command: "meta",
  super: "meta",
  win: "meta",
};

/** Spelt out because a chord cannot carry a literal "+" or a space otherwise. */
const KEY_ALIASES: Record<string, string> = {
  esc: "escape",
  enter: "return",
  ret: "return",
  del: "delete",
  ins: "insert",
  pgup: "pageup",
  pgdn: "pagedown",
  " ": "space",
  plus: "plus",
};

/** Modifiers in a fixed order, so the same chord always reads the same way. */
const MODIFIER_ORDER: Modifier[] = ["ctrl", "alt", "shift", "meta"];

export class KeyParseError extends Error {}

/**
 * Splits on "+" but not on a trailing "+" meant as the key itself, so both
 * "ctrl+plus" and "ctrl++" survive.
 */
function parts(chord: string): string[] {
  const trimmed = chord.trim();
  if (!trimmed) throw new KeyParseError("A key chord cannot be empty");
  if (trimmed.endsWith("++")) return [...parts(trimmed.slice(0, -2)), "plus"];
  return trimmed.split("+").map((part) => part.trim().toLowerCase());
}

export function parseChord(chord: string): Chord {
  const pieces = parts(chord).filter((piece) => piece.length > 0);
  if (pieces.length === 0)
    throw new KeyParseError("A key chord cannot be empty");

  const modifiers: Modifier[] = [];
  let key: string | null = null;
  for (const piece of pieces) {
    const modifier = MODIFIER_ALIASES[piece];
    if (modifier) {
      if (!modifiers.includes(modifier)) modifiers.push(modifier);
      continue;
    }
    if (key !== null) {
      throw new KeyParseError(`"${chord}" names two keys; a chord takes one`);
    }
    key = KEY_ALIASES[piece] ?? piece;
  }
  if (key === null) throw new KeyParseError(`"${chord}" is only modifiers`);
  return {
    modifiers: MODIFIER_ORDER.filter((m) => modifiers.includes(m)),
    key,
  };
}

/** X11 keysyms, which is what `xdotool key` speaks. */
const X11_KEYS: Record<string, string> = {
  ctrl: "ctrl",
  alt: "alt",
  shift: "shift",
  meta: "super",
  escape: "Escape",
  return: "Return",
  tab: "Tab",
  space: "space",
  backspace: "BackSpace",
  delete: "Delete",
  insert: "Insert",
  home: "Home",
  end: "End",
  pageup: "Page_Up",
  pagedown: "Page_Down",
  up: "Up",
  down: "Down",
  left: "Left",
  right: "Right",
  plus: "plus",
  minus: "minus",
};

export function chordToX11(chord: Chord): string {
  const key =
    X11_KEYS[chord.key] ??
    (/^f([1-9]|1[0-9]|2[0-4])$/.test(chord.key)
      ? chord.key.toUpperCase()
      : chord.key);
  return [...chord.modifiers.map((m) => X11_KEYS[m] ?? m), key].join("+");
}

/**
 * Win32 virtual-key codes. Only the keys a chord can name: ordinary characters
 * are typed as text rather than pressed, which is what keeps this list short.
 */
const VK: Record<string, number> = {
  ctrl: 0x11,
  alt: 0x12,
  shift: 0x10,
  meta: 0x5b,
  escape: 0x1b,
  return: 0x0d,
  tab: 0x09,
  space: 0x20,
  backspace: 0x08,
  delete: 0x2e,
  insert: 0x2d,
  home: 0x24,
  end: 0x23,
  pageup: 0x21,
  pagedown: 0x22,
  up: 0x26,
  down: 0x28,
  left: 0x25,
  right: 0x27,
  plus: 0xbb,
  minus: 0xbd,
};

/** The virtual-key code for one key name, or null when there is no such key. */
export function virtualKey(name: string): number | null {
  const known = VK[name];
  if (known !== undefined) return known;
  const fn = /^f([1-9]|1[0-9]|2[0-4])$/.exec(name);
  if (fn) return 0x6f + Number(fn[1]);
  if (/^[a-z]$/.test(name)) return name.toUpperCase().charCodeAt(0);
  if (/^[0-9]$/.test(name)) return name.charCodeAt(0);
  return null;
}

/** The whole chord as virtual-key codes, modifiers first, or null if unmappable. */
export function chordToVirtualKeys(chord: Chord): number[] | null {
  const codes: number[] = [];
  for (const modifier of chord.modifiers) {
    const code = VK[modifier];
    if (code === undefined) return null;
    codes.push(code);
  }
  const key = virtualKey(chord.key);
  if (key === null) return null;
  codes.push(key);
  return codes;
}
