import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * One product, one palette.
 *
 * Redrob Office and Redrob Console are two front doors to the same product, and a person who learns
 * a colour in one is entitled to find it unchanged in the other. Console keeps the tokens in
 * `apps/web/src/app/globals.css`; Office keeps the same two layers in `src/styles/`, primitives in
 * `design-tokens-brand.css` and semantic roles in `design-tokens-semantic.css`.
 *
 * Two repositories cannot import from each other, so this file is the joint. Every value Console
 * declares is written out below, and each test checks Office's copy against it. If either side
 * changes a colour alone, this fails and names the token.
 *
 * What it does NOT check: that the products look alike. They do not, and should not; Office is a
 * desktop shell and Console is a web console. What it checks is that where they paint the same role
 * they reach for the same value, and that a role is decided in one place.
 */

const rendererRoot = resolve(import.meta.dirname, "..");

function read(relative: string): string {
  return readFileSync(resolve(rendererRoot, relative), "utf8");
}

/** Strip comments, so a value quoted in prose is never mistaken for a declaration. */
function stripComments(css: string): string {
  return css.replace(/\/\*[\s\S]*?\*\//g, "");
}

/** The declarations of one rule, found by its selector and read to its closing brace. */
function ruleDeclarations(css: string, selector: string): Record<string, string> {
  const source = stripComments(css);
  const opening = source.indexOf("{", source.indexOf(selector));
  expect(opening, `no rule for ${selector}`).toBeGreaterThan(-1);
  let depth = 1;
  let index = opening + 1;
  while (depth > 0) {
    if (source[index] === "{") depth += 1;
    if (source[index] === "}") depth -= 1;
    index += 1;
  }
  const body = source.slice(opening + 1, index - 1);
  const declarations: Record<string, string> = {};
  for (const match of body.matchAll(/(--[a-z0-9-]+)\s*:\s*([^;]+);/g)) {
    const [, name, value] = match;
    if (name === undefined || value === undefined) continue;
    declarations[name] = value.split(/\s+/).join(" ");
  }
  return declarations;
}

/**
 * The brand's confirmed HEX values, transcribed from Console. Theme-independent by construction:
 * Blue 6 is Blue 6 under either theme, which is why none of them is repeated in the dark block.
 */
const CONSOLE_PRIMITIVES: Record<string, string> = {
  "--rr-blue": "#2b52ff",
  "--rr-black": "#0a0b0c",
  "--rr-white": "#ffffff",
  "--rr-blue-1": "#eff4ff",
  "--rr-blue-2": "#d9e6ff",
  "--rr-blue-3": "#bad2ff",
  "--rr-blue-4": "#8aafff",
  "--rr-blue-5": "#507fff",
  "--rr-blue-6": "#2b52ff",
  "--rr-blue-7": "#1733d5",
  "--rr-blue-8": "#09209c",
  "--rr-blue-9": "#061460",
  "--rr-blue-10": "#030c34",
  "--rr-gray-1": "#f8f9fb",
  "--rr-gray-2": "#eff1f4",
  "--rr-gray-3": "#dfe2e8",
  "--rr-gray-4": "#cbcfd7",
  "--rr-gray-5": "#aab0bb",
  "--rr-gray-6": "#7c8390",
  "--rr-gray-7": "#576071",
  "--rr-gray-8": "#292e37",
  "--rr-gray-9": "#141719",
  "--rr-gradient-primary": "linear-gradient(135deg, #f8f9fb 0%, #507fff 100%)",
  "--rr-teal-1": "#dcfffe",
  "--rr-teal-2": "#b9fffd",
  "--rr-teal-3": "#6ff4f0",
  "--rr-teal-4": "#00b5c2",
  "--rr-teal-5": "#006a7a",
  "--rr-sky-1": "#e4f0ff",
  "--rr-sky-2": "#bad9ff",
  "--rr-sky-3": "#2f8dff",
  "--rr-sky-4": "#0e51b6",
  "--rr-sky-5": "#002a68",
  "--rr-violet-1": "#f2e9ff",
  "--rr-violet-2": "#d4b3ff",
  "--rr-violet-3": "#8944ff",
  "--rr-violet-4": "#4500ac",
  "--rr-violet-5": "#140042",
  "--rr-pink-1": "#ffe3fc",
  "--rr-pink-2": "#ffb2f6",
  "--rr-pink-3": "#ff39ba",
  "--rr-pink-4": "#8a0061",
  "--rr-pink-5": "#380037",
  "--rr-red-1": "#ffe8e1",
  "--rr-red-2": "#ffc2ba",
  "--rr-red-3": "#ff5452",
  "--rr-red-4": "#a31310",
  "--rr-red-5": "#560100",
  "--rr-orange-1": "#ffedda",
  "--rr-orange-2": "#ffd5ab",
  "--rr-orange-3": "#ff9c1b",
  "--rr-orange-4": "#ae5100",
  "--rr-orange-5": "#5c2d00",
  "--rr-yellow-1": "#fff7cc",
  "--rr-yellow-2": "#ffed94",
  "--rr-yellow-3": "#ffda1e",
  "--rr-yellow-4": "#d2a100",
  "--rr-yellow-5": "#734f00",
  "--rr-lime-1": "#f2ffc3",
  "--rr-lime-2": "#e5ff81",
  "--rr-lime-3": "#cffd21",
  "--rr-lime-4": "#89ad00",
  "--rr-lime-5": "#2f5f00",
  "--rr-green-1": "#d6ffe1",
  "--rr-green-2": "#a6ffbf",
  "--rr-green-3": "#29e474",
  "--rr-green-4": "#00864a",
  "--rr-green-5": "#004829",
};

/**
 * Console's semantic roles as `[light, dark]`. This is the layer product code names, and the only
 * layer it may name. Every value is a primitive or a mix of two, because a literal here would be a
 * third layer and a third place a colour could be decided.
 */
const CONSOLE_ROLES: Record<string, [string, string]> = {
  "--background": ["var(--rr-gray-1)", "var(--rr-gray-9)"],
  "--background-secondary": ["var(--rr-gray-2)", "var(--rr-black)"],
  "--card": ["var(--rr-white)", "color-mix(in srgb, var(--rr-gray-8) 45%, var(--rr-gray-9))"],
  "--card-foreground": ["var(--rr-gray-9)", "var(--rr-gray-1)"],
  "--popover": ["var(--rr-white)", "color-mix(in srgb, var(--rr-gray-8) 45%, var(--rr-gray-9))"],
  "--popover-foreground": ["var(--rr-gray-9)", "var(--rr-gray-1)"],
  "--foreground": ["var(--rr-gray-9)", "var(--rr-gray-1)"],
  "--muted-foreground": ["var(--rr-gray-7)", "var(--rr-gray-5)"],
  "--subtle-foreground": ["var(--rr-gray-6)", "var(--rr-gray-6)"],
  "--disabled-foreground": ["var(--rr-gray-5)", "var(--rr-gray-7)"],
  "--accent": ["var(--rr-gray-2)", "color-mix(in srgb, var(--rr-gray-8) 45%, var(--rr-gray-9))"],
  "--accent-foreground": ["var(--rr-gray-9)", "var(--rr-gray-1)"],
  "--accent-active": ["var(--rr-gray-3)", "var(--rr-gray-8)"],
  "--secondary": ["var(--rr-gray-2)", "var(--rr-gray-8)"],
  "--secondary-foreground": ["var(--rr-gray-9)", "var(--rr-gray-1)"],
  "--muted": ["var(--rr-gray-2)", "var(--rr-gray-8)"],
  "--primary": ["var(--rr-blue-6)", "var(--rr-blue-5)"],
  "--primary-foreground": ["var(--rr-white)", "var(--rr-black)"],
  "--primary-hover": ["var(--rr-blue-7)", "var(--rr-blue-4)"],
  "--primary-muted": ["var(--rr-blue-3)", "var(--rr-blue-9)"],
  "--primary-soft": ["var(--rr-blue-1)", "var(--rr-blue-10)"],
  "--primary-ink": ["var(--rr-blue-6)", "var(--rr-blue-4)"],
  "--border-subtle": ["var(--rr-gray-2)", "color-mix(in srgb, var(--rr-gray-8) 55%, var(--rr-gray-9))"],
  "--border": ["var(--rr-gray-3)", "var(--rr-gray-8)"],
  "--border-strong": ["var(--rr-gray-4)", "var(--rr-gray-7)"],
  "--input": ["var(--rr-gray-6)", "var(--rr-gray-6)"],
  "--ring": ["var(--rr-blue-6)", "var(--rr-blue-5)"],
  "--success": ["var(--rr-green-4)", "var(--rr-green-3)"],
  "--success-foreground": ["var(--rr-white)", "var(--rr-black)"],
  "--success-soft": ["var(--rr-green-1)", "var(--rr-green-5)"],
  "--success-ink": ["var(--rr-green-5)", "var(--rr-green-3)"],
  "--warning": ["var(--rr-orange-4)", "var(--rr-orange-3)"],
  "--warning-foreground": ["var(--rr-white)", "var(--rr-black)"],
  "--warning-soft": ["var(--rr-orange-1)", "var(--rr-orange-5)"],
  "--warning-ink": ["var(--rr-orange-4)", "var(--rr-orange-3)"],
  "--destructive": ["var(--rr-red-4)", "var(--rr-red-3)"],
  "--destructive-foreground": ["var(--rr-white)", "var(--rr-black)"],
  "--destructive-soft": ["var(--rr-red-1)", "var(--rr-red-5)"],
  "--destructive-ink": ["var(--rr-red-4)", "var(--rr-red-3)"],
  "--overlay": [
    "color-mix(in srgb, var(--rr-black) 45%, transparent)",
    "color-mix(in srgb, var(--rr-black) 65%, transparent)",
  ],
  "--tooltip": ["var(--rr-gray-9)", "var(--rr-black)"],
  "--tooltip-foreground": ["var(--rr-gray-1)", "var(--rr-gray-1)"],
  "--sidebar": ["var(--rr-white)", "var(--rr-black)"],
  "--sidebar-foreground": ["var(--rr-gray-9)", "var(--rr-gray-1)"],
  "--sidebar-primary": ["var(--rr-blue-6)", "var(--rr-blue-5)"],
  "--sidebar-primary-foreground": ["var(--rr-white)", "var(--rr-black)"],
  "--sidebar-accent": ["var(--rr-gray-2)", "var(--rr-gray-8)"],
  "--sidebar-accent-foreground": ["var(--rr-gray-9)", "var(--rr-gray-1)"],
  "--sidebar-border": ["var(--rr-gray-3)", "var(--rr-gray-8)"],
  "--sidebar-ring": ["var(--rr-blue-6)", "var(--rr-blue-5)"],
  "--spectrum-teal": ["var(--rr-teal-5)", "var(--rr-teal-3)"],
  "--spectrum-sky": ["var(--rr-sky-4)", "var(--rr-sky-3)"],
  "--spectrum-violet": ["var(--rr-violet-4)", "var(--rr-violet-3)"],
  "--spectrum-pink": ["var(--rr-pink-4)", "var(--rr-pink-3)"],
  "--spectrum-red": ["var(--rr-red-4)", "var(--rr-red-3)"],
  "--spectrum-orange": ["var(--rr-orange-4)", "var(--rr-orange-3)"],
  "--spectrum-yellow": ["var(--rr-yellow-5)", "var(--rr-yellow-3)"],
  "--spectrum-lime": ["var(--rr-lime-5)", "var(--rr-lime-3)"],
  "--spectrum-green": ["var(--rr-green-4)", "var(--rr-green-3)"],
  "--code-comment": ["var(--rr-gray-7)", "var(--rr-gray-5)"],
  "--code-string": ["var(--rr-green-5)", "var(--rr-green-3)"],
  "--code-number": ["var(--rr-orange-4)", "var(--rr-orange-3)"],
  "--code-keyword": ["var(--rr-violet-4)", "var(--rr-violet-2)"],
  "--code-literal": ["var(--rr-pink-4)", "var(--rr-pink-2)"],
  "--code-property": ["var(--rr-sky-4)", "var(--rr-sky-2)"],
  "--code-variable": ["var(--rr-teal-5)", "var(--rr-teal-3)"],
  "--code-operator": ["var(--rr-gray-7)", "var(--rr-gray-5)"],
  "--code-punctuation": ["var(--rr-gray-7)", "var(--rr-gray-5)"],
  "--shadow-soft": [
    "0 1px 2px color-mix(in srgb, var(--rr-gray-8) 5%, transparent)",
    "0 1px 2px color-mix(in srgb, var(--rr-black) 30%, transparent)",
  ],
  "--shadow-card": [
    "0 1px 2px color-mix(in srgb, var(--rr-gray-8) 5%, transparent), 0 4px 16px color-mix(in srgb, var(--rr-gray-8) 7%, transparent)",
    "0 1px 2px color-mix(in srgb, var(--rr-black) 25%, transparent), 0 4px 16px color-mix(in srgb, var(--rr-black) 35%, transparent)",
  ],
  "--shadow-elevated": [
    "0 2px 4px color-mix(in srgb, var(--rr-gray-8) 6%, transparent), 0 12px 32px color-mix(in srgb, var(--rr-gray-8) 12%, transparent)",
    "0 2px 4px color-mix(in srgb, var(--rr-black) 30%, transparent), 0 12px 32px color-mix(in srgb, var(--rr-black) 50%, transparent)",
  ],
};

/**
 * Type. Console declares these inside its Tailwind v4 `@theme inline` block; Office declares them
 * with the roles, because v3 has no such block and reads them from the config instead.
 */
const CONSOLE_TYPE: Record<string, string> = {
  "--font-sans":
    "\"Pretendard Variable\", Pretendard, -apple-system, BlinkMacSystemFont, system-ui, \"Segoe UI\", Roboto, \"Helvetica Neue\", Arial, sans-serif",
  "--font-display":
    "var(--font-sans)",
  "--font-mono":
    "\"JetBrains Mono Variable\", \"JetBrains Mono\", ui-monospace, SFMono-Regular, \"SF Mono\", Menlo, Consolas, \"Liberation Mono\", monospace",
};

/**
 * The roles Console carries that Office does not, each with the reason.
 *
 * The list is asserted whole rather than as a floor, so a role added to Console shows up here as a
 * failure and somebody decides about it, instead of quietly never arriving.
 */
const NOT_IN_OFFICE: string[] = [
  // A chart series and the band under its cursor. Office draws no chart: its numbers are rows in a
  // table and its runs are a timeline of sentences. The spectrum these are drawn from is present,
  // as `--spectrum-*`, so the day Office does draw one it starts from the same nine hues.
  "--chart-1",
  "--chart-2",
  "--chart-3",
  "--chart-4",
  "--chart-5",
  "--chart-6",
  "--chart-7",
  "--chart-8",
  "--chart-cursor",
];

/**
 * And the roles Office carries that Console does not.
 *
 * Console's own header keeps a list of the same shape, for the roles it needed that the brand proposal
 * did not name. This is that list one level down: it stays short, and a role only joins it with the
 * reason written where it is declared.
 */
const NOT_IN_CONSOLE: string[] = [
  // Console darkens a destructive fill on hover with an alpha, which Tailwind v3 cannot put on a
  // `var()`. See the note above the declaration.
  "--destructive-hover",
  // The edge of a `-soft` status strip. Every status message in Office was written as a tint, a
  // boundary one step darker, and its ink, and the four status roles named the first and the third.
  // Console's own status call sites are borderless, so it never needed the step. See the note above
  // the declarations.
  "--success-muted",
  "--warning-muted",
  "--destructive-muted",
  // The ink on a spectrum fill. Console draws the spectrum as chart series and syntax colour, where
  // nothing is written on it; Office writes initials on the teammate avatars. See the note above the
  // declaration.
  "--spectrum-foreground",
];

describe("design tokens, against Console", () => {
  it("carries every brand primitive at Console's value", () => {
    const declared = ruleDeclarations(read("src/styles/design-tokens-brand.css"), ":root");
    const primitives = Object.fromEntries(
      Object.entries(declared).filter(([name]) => name.startsWith("--rr-")),
    );
    expect(primitives).toEqual(CONSOLE_PRIMITIVES);
  });

  it("points every semantic role where Console points it, in both themes", () => {
    const semantic = read("src/styles/design-tokens-semantic.css");
    const light = ruleDeclarations(semantic, ":root {");
    const dark = ruleDeclarations(semantic, ':root[data-theme="dark"]');

    for (const [role, [expectedLight, expectedDark]] of Object.entries(CONSOLE_ROLES)) {
      expect(light[role], `${role}, light`).toBe(expectedLight);
      expect(dark[role], `${role}, dark`).toBe(expectedDark);
    }


    // Nothing extra, either, beyond the roles Office has a written reason for.
    const roles = [...Object.keys(CONSOLE_ROLES), ...NOT_IN_CONSOLE].sort();
    expect(
      Object.keys(light)
        .filter((name) => !name.startsWith("--font-"))
        .sort(),
    ).toEqual(roles);
    expect(Object.keys(dark).sort()).toEqual(roles);
  });

  it("accounts for every role Console has and Office does not", () => {
    const declared = new Set(Object.keys(CONSOLE_ROLES));
    expect(NOT_IN_OFFICE.filter((role) => declared.has(role))).toEqual([]);
    // The table above is generated from Console's file, so anything Console adds lands in one of the
    // two places: as a role Office must point, or on this list with a reason.
    expect(declared.size + NOT_IN_OFFICE.length).toBe(80);
  });

  it("decides no colour in the semantic layer", () => {
    const semantic = stripComments(read("src/styles/design-tokens-semantic.css"));
    // A HEX here would be a third layer. Roles read primitives and nothing else.
    expect(semantic.match(/#[0-9a-fA-F]{3,8}\b/g)).toBeNull();
  });

  it("names Pretendard, and the same stack Console names", () => {
    const light = ruleDeclarations(read("src/styles/design-tokens-semantic.css"), ":root {");
    for (const [token, expected] of Object.entries(CONSOLE_TYPE)) {
      expect(light[token], token).toBe(expected);
    }
    // Pretendard carries Latin and Hangul in one face, so Korean is not a fallback: it is the same
    // font, and it has to be the first thing asked for or the system face wins the race.
    expect(
      must(light, "--font-sans").startsWith('"Pretendard Variable", Pretendard,'),
    ).toBe(true);

    // And the face is actually shipped, since the renderer's CSP allows no network on first paint.
    expect(read("src/styles.css")).toContain('font-family: "Pretendard Variable"');
    expect(read("src/styles.css")).toContain("/fonts/PretendardVariable.woff2");
  });
});

/** A declaration that has to be there, so a missing token fails by name rather than as `undefined`. */
function must(declarations: Record<string, string>, name: string): string {
  const value = declarations[name];
  expect(value, `${name} is not declared`).toBeTypeOf("string");
  return value as string;
}

/** A capture group that has to be there. */
function group(match: RegExpMatchArray | null, index: number, what: string): string {
  expect(match, `no ${what}`).not.toBeNull();
  const value = (match as RegExpMatchArray)[index];
  expect(value, `no ${what}`).toBeTypeOf("string");
  return value as string;
}

/** `#rrggbb` to channels. */
function channels(hex: string): [number, number, number] {
  const value = hex.replace("#", "");
  return [
    Number.parseInt(value.slice(0, 2), 16),
    Number.parseInt(value.slice(2, 4), 16),
    Number.parseInt(value.slice(4, 6), 16),
  ];
}

/** How far apart two colours are, summed over the channels. */
function weight(hex: string): number {
  return channels(hex).reduce((total, value) => total + value, 0);
}

/** Every file under a directory, so a new panel is covered the day it is written. */
function walk(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = resolve(directory, entry.name);
    return entry.isDirectory() ? walk(path) : [path];
  });
}

describe("design tokens, inside Office", () => {
  /**
   * Tailwind v3 builds `bg-gray-800/60` by rewriting the colour value, and it cannot rewrite a
   * `var()` that resolves to a HEX string. So the two theme-independent ramps are literals in the
   * config, and this is what stops the two copies drifting apart.
   */
  it("builds its ramps from the brand primitives", () => {
    const config = read("tailwind.config.js");
    const primitives = ruleDeclarations(
      read("src/styles/design-tokens-brand.css"),
      ":root",
    );

for (let level = 1; level <= 10; level += 1) {
      const step = level === 1 ? 50 : (level - 1) * 100;
      expect(config, `brand-${step}`).toContain(`${step}: rr.blue[${level}]`);
      expect(config, `blue ${level}`).toContain(
        `${level}: "${must(primitives, `--rr-blue-${level}`)}"`,
      );
    }

    for (let level = 1; level <= 9; level += 1) {
      expect(config, `gray ${level}`).toContain(
        `${level}: "${must(primitives, `--rr-gray-${level}`)}"`,
      );
    }
    expect(config).toContain(`black: "${must(primitives, "--rr-black")}"`);
  });

  /**
   * `gray-800` is the one step of the neutral ramp the brand scale has no value for: it is the panel
   * that sits above a dark page, and there is nothing between Gray 9 and Gray 8 to be it. Console
   * mixes the two, and Office has to resolve that mix to a literal for the reason above, so this
   * checks the arithmetic rather than the string. One count of rounding is allowed per channel.
   */
  it("resolves the dark panel step to the mix Console uses", () => {
    const primitives = ruleDeclarations(
      read("src/styles/design-tokens-brand.css"),
      ":root",
    );
    const roles = ruleDeclarations(
      read("src/styles/design-tokens-semantic.css"),
      ':root[data-theme="dark"]',
    );
    const mix = must(roles, "--card");
    const parsed = mix.match(
      /color-mix\(in srgb, var\((--rr-[a-z0-9-]+)\) (\d+)%, var\((--rr-[a-z0-9-]+)\)\)/,
    );
    const what = `a two primitive mix for --card, dark, which reads ${mix}`;
    const from = channels(must(primitives, group(parsed, 1, what)));
    const share = Number(group(parsed, 2, what)) / 100;
    const to = channels(must(primitives, group(parsed, 3, what)));

    const literal = read("tailwind.config.js").match(/grayPanel: "(#[0-9a-f]{6})"/);
    const panel = group(literal, 1, "grayPanel literal in the config");
    const actual = channels(panel);
    for (const [index, value] of actual.entries()) {
      const expected = (from[index] ?? 0) * share + (to[index] ?? 0) * (1 - share);
      expect(Math.abs(value - expected), `channel ${index}`).toBeLessThanOrEqual(1);
    }

    // And it has to sit between the two steps it mixes, or the dark ramp stops being a ramp: page
    // under panel under hover is what keeps a card and its own hover state apart.
    expect(weight(panel)).toBeLessThan(weight(must(primitives, "--rr-gray-8")));
    expect(weight(panel)).toBeGreaterThan(weight(must(primitives, "--rr-gray-9")));
  });

  it("binds every semantic role to a utility", () => {
    const config = read("tailwind.config.js");
    for (const role of [...Object.keys(CONSOLE_ROLES), ...NOT_IN_CONSOLE]) {
      if (role.startsWith("--shadow-")) continue; // elevation, bound in CSS rather than as a colour
      expect(config, `${role} reaches no utility`).toContain(`var(${role})`);
    }
  });

  /**
   * `--warning-500` was an orange from the Figma foundation and `--warning` is the brand's warning
   * role, and while both existed a component could reach either by writing `bg-warning-500` or
   * `bg-warning`. Two sets of aliases for one set of values is the thing that rots, because a
   * component picks whichever it saw last and the two drift.
   */
  it("leaves one vocabulary for a status colour", () => {
    const config = read("tailwind.config.js");
    for (const dead of ["--positive-", "--negative-", "--warning-5", "--warning-7"]) {
      expect(config, `${dead} is still bound`).not.toContain(dead);
    }
  });

  /**
   * The boot splash is inline in `index.html` on purpose: the window paints before the bundle that
   * would declare a custom property has downloaded, which is the whole reason it exists. So its
   * colours are literals, and they are the only literals in the product. This is what keeps them
   * from being a fifth opinion about what the page is.
   */
  it("opens on the page colour it then renders", () => {
    const splash = read("index.html");
    const primitives = ruleDeclarations(
      read("src/styles/design-tokens-brand.css"),
      ":root",
    );
    const light = ruleDeclarations(read("src/styles/design-tokens-semantic.css"), ":root {");
    const dark = ruleDeclarations(
      read("src/styles/design-tokens-semantic.css"),
      ':root[data-theme="dark"]',
    );

    const primitiveFor = (role: string, theme: Record<string, string>): string =>
      must(
        primitives,
        group(
          must(theme, role).match(/var\((--rr-[a-z0-9-]+)\)/),
          1,
          `a plain primitive behind ${role}, which the splash has to copy`,
        ),
      );

    // The page, both themes.
    expect(splash).toContain(`background: ${primitiveFor("--background", light)};`);
    expect(splash).toContain(`background: ${primitiveFor("--background", dark)};`);
    // The ring under the mark, which is the brand accent and nothing else.
    expect(splash).toContain(`border-top-color: ${primitiveFor("--primary", light)};`);
    expect(splash).toContain(`border-top-color: ${primitiveFor("--primary", dark)};`);

    // Those four, and no fifth opinion about what the opening rectangle is.
    const literals = splash.match(/#[0-9a-fA-F]{3,8}\b/g) ?? [];
    expect([...new Set(literals)].sort()).toEqual(
      [
        primitiveFor("--background", light),
        primitiveFor("--background", dark),
        primitiveFor("--primary", light),
        primitiveFor("--primary", dark),
      ].sort(),
    );

    // The tints it draws the mark's shadow and the ring's track with are the same two primitives
    // written as channels, since `rgba()` is the only way to put an alpha on a colour in here.
    const tints = new Set(
      [...splash.matchAll(/rgba\((\d+), (\d+), (\d+), [\d.]+\)/g)].map(
        (match) => `${match[1]},${match[2]},${match[3]}`,
      ),
    );
    expect([...tints].sort()).toEqual(
      [
        channels(must(primitives, "--rr-gray-8")).join(","),
        channels(must(primitives, "--rr-white")).join(","),
      ].sort(),
    );
  });

  /**
   * The renderer stylesheet used to hold sixty-odd colours of its own, a slate palette for the chat
   * transcript and an indigo one for the composer, each with a `.dark` block restating it. They are
   * all roles now, which is why those `.dark` blocks are gone rather than rewritten.
   */
  it("keeps no colour of its own in the stylesheet", () => {
    const css = stripComments(read("src/styles.css"));
    expect(css.match(/#[0-9a-fA-F]{3,8}\b/g)).toBeNull();
    expect(css.match(/\brgba?\(/g)).toBeNull();
  });

  /**
   * And no component may name a colour either.
   *
   * A hardcoded dark panel fill was written at sixteen call sites, each a copy of what `gray-900` was
   * at the time. When the ramp moved to the brand's, sixteen panels stayed behind on the old one,
   * which is the failure mode a token layer exists to prevent: the value was in the tree twice, so
   * moving it moved one copy. A screen that needs a colour names a role, and if no role fits then the
   * palette is missing a step and that is a conversation with the brand document.
   *
   * Elevation is excluded, and `shadow-[...]` still appears at five call sites. A shadow's colour is a
   * neutral at a low alpha rather than a choice from the palette, and its geometry is the part that
   * carries meaning; re-pointing those is a change to how far a surface lifts, which wants seeing.
   */
  it("lets no component name a colour of its own", () => {
    const colourUtility =
      /\b(?:bg|text|border|ring|outline|fill|stroke|from|via|to|divide|placeholder|caret|accent|decoration)-\[[^\]]*(?:#[0-9a-fA-F]{3,8}|rgba?\(|hsla?\()[^\]]*\]/g;
    const offenders: string[] = [];
    for (const file of walk(resolve(rendererRoot, "src"))) {
      if (!file.endsWith(".tsx")) continue;
      for (const match of readFileSync(file, "utf8").matchAll(colourUtility)) {
        offenders.push(`${file.slice(rendererRoot.length + 1)}: ${match[0]}`);
      }
    }
    expect(offenders).toEqual([]);
  });

  /**
   * A hover has to be a different colour from the thing it hovers.
   *
   * The destructive button was written `hover:bg-destructive-ink`, because `-ink` was the only
   * destructive role that sounded darker. It is the same value as `--destructive` in both themes, so
   * the button had no hover at all, and it read as correct because the class existed and the token
   * existed. A pair like that cannot be caught by checking that values match Console; it has to be
   * caught by checking they differ from each other.
   */
  it("gives every hover role a value its rest state does not have", () => {
    const semantic = read("src/styles/design-tokens-semantic.css");
    const themes = {
      light: ruleDeclarations(semantic, ":root {"),
      dark: ruleDeclarations(semantic, ':root[data-theme="dark"]'),
    };
    for (const [theme, declarations] of Object.entries(themes)) {
      for (const role of Object.keys(declarations)) {
        if (!role.endsWith("-hover")) continue;
        const rest = role.slice(0, -"-hover".length);
        expect(must(declarations, role), `${role} in ${theme} does not move`).not.toBe(
          must(declarations, rest),
        );
      }
    }
  });

  /**
   * An `-ink` role is a colour to read, on the page or on its `-soft` wash. Painting a surface with
   * one is how the dead hover above happened, and it is the tell for it.
   */
  it("paints no surface with an ink role", () => {
    const roots = [resolve(rendererRoot, "src"), resolve(rendererRoot, "../../../packages/ui/src")];
    const offenders: string[] = [];
    for (const file of roots.flatMap(walk)) {
      if (!/\.tsx?$/.test(file) || file.endsWith(".test.ts")) continue;
      for (const match of readFileSync(file, "utf8").matchAll(/\bbg-[a-z-]+-ink\b/g)) {
        offenders.push(`${file.slice(rendererRoot.length + 1)}: ${match[0]}`);
      }
    }
    expect(offenders).toEqual([]);
  });

  /**
   * The hues from outside the Redrob palette, and there are none left.
   *
   * Every neutral and every blue in the renderer resolved to a brand primitive already, because
   * `gray` and `blue` are ramps this product owns and re-pointing the ramp moved all 1,633 call sites
   * at once. `red`, `amber`, `emerald`, `sky`, `rose`, `violet` and `teal` were Tailwind's own and
   * could not be moved the same way: each carries eleven steps where the brand spectrum carries five,
   * so folding one onto the other collapses pairs a screen is using to tell a border from its fill or
   * a hover from its rest. That was 355 call sites and it took a decision at each one.
   *
   * The budget is zero now and it is written as zero rather than deleted, because the number is the
   * point: a hue reappearing is a hue somebody added back, and this names which one.
   *
   * The palette in `tailwind.config.js` is the harder half of the same guarantee, checked below: the
   * config declares `colors` rather than `extend.colors`, so `bg-red-500` no longer compiles at all
   * and this test is the second line rather than the first.
   */
  it("adds no new hue from outside the palette", () => {
    const budget: Record<string, number> = {
      red: 0,
      amber: 0,
      emerald: 0,
      sky: 0,
      rose: 0,
      violet: 0,
      teal: 0,
      // The rest of Tailwind's palette, which nothing ever named here and which the config no longer
      // offers. Listed so a fresh `bg-indigo-500` fails by name rather than by a missing class.
      slate: 0,
      zinc: 0,
      neutral: 0,
      stone: 0,
      orange: 0,
      yellow: 0,
      lime: 0,
      green: 0,
      cyan: 0,
      indigo: 0,
      purple: 0,
      fuchsia: 0,
      pink: 0,
    };
    const roots = [
      resolve(rendererRoot, "src"),
      // The shared controls count too: they render inside this renderer.
      resolve(rendererRoot, "../../../packages/ui/src"),
    ];
    const sources = roots
      .flatMap(walk)
      .filter((file) => /\.tsx?$/.test(file) && !file.endsWith(".test.ts"))
      .map((file) => readFileSync(file, "utf8"))
      .join("\n");

    for (const [hue, allowed] of Object.entries(budget)) {
      const pattern = new RegExp(
        `\\b(?:bg|text|border|ring|outline|from|via|to|divide|placeholder|decoration|fill|stroke|shadow|caret|accent)-${hue}-\\d+(?:\\/\\d+)?\\b`,
        "g",
      );
      const count = (sources.match(pattern) ?? []).length;
      expect(count, `${hue} call sites`).toBeLessThanOrEqual(allowed);
    }
  });

  /**
   * And the palette cannot hand one back.
   *
   * `extend.colors` leaves Tailwind's own hues underneath whatever it adds, so for as long as the
   * ramps were an extension `bg-rose-500` compiled and looked deliberate. The config declares the
   * whole `colors` object now, which is what makes the budget above enforceable rather than a
   * convention: a hue that is not in the list produces no utility.
   */
  it("offers no hue the palette does not declare", () => {
    const config = read("tailwind.config.js");
    // An `extend.colors` would put the stock palette back under everything in one line.
    expect(/extend:\s*\{[\s\S]*?\bcolors:/.test(config), "colors is inside extend").toBe(false);
    expect(config).toContain("    colors: {");
    for (const hue of [
      "red",
      "amber",
      "emerald",
      "sky",
      "rose",
      "violet",
      "teal",
      "slate",
      "zinc",
      "orange",
      "yellow",
      "lime",
      "green",
      "cyan",
      "indigo",
      "purple",
      "fuchsia",
      "pink",
    ]) {
      expect(
        new RegExp(`^\\s{6}${hue}:`, "m").test(config),
        `${hue} is declared in the palette`,
      ).toBe(false);
    }
  });

  /** Never an em dash in this product, and a token file is no exception. */  it("writes no em dash", () => {    for (const file of [
      "src/styles.css",
      "src/styles/design-tokens.css",
      "src/styles/design-tokens-brand.css",
      "src/styles/design-tokens-semantic.css",
      "src/styles/design-tokens-alpha.css",
      "src/styles/design-tokens-object.css",
      "src/design-tokens.test.ts",
      "tailwind.config.js",
      "index.html",
    ]) {
      expect(read(file).includes("\u2014"), file).toBe(false);
    }
  });
});

/**
 * ═══════════════════════════════════════════════════════════════════════════════════════════════
 * The stylesheet Tailwind actually emits
 * ═══════════════════════════════════════════════════════════════════════════════════════════════
 *
 * Everything above reads source files. That catches a class somebody wrote and misses a colour the
 * build put there on its own: a Tailwind preflight default, a plugin's fallback, a step of a ramp
 * that no longer exists so the utility comes out empty. And nobody reviewing this on a machine
 * without a screen can see any of it.
 *
 * So this compiles `src/styles.css` through the real PostCSS pipeline with the real config and the
 * real content globs, and reads every colour out of the result. The rule is one sentence: an emitted
 * colour is a value the brand file declares, or pure black, or pure white. Pure black and pure white
 * are allowed because Tailwind's own base layer writes them and because `rgb(0 0 0 / x)` is how a
 * shadow is drawn; Redrob Black and Redrob White are in the brand file and pass on their own.
 *
 * This is the assertion that would have caught the 117 stock-hue values the renderer was shipping,
 * and it is the one that catches the next one.
 */
describe("the emitted stylesheet", () => {
  /** Compile the renderer stylesheet the way the build does. */
  async function compile(): Promise<string> {
    const postcss = (await import("postcss")).default;
    const tailwindcss = (await import("tailwindcss")).default;
    const entry = resolve(rendererRoot, "src/styles.css");
    const result = await postcss([
      tailwindcss({ config: resolve(rendererRoot, "tailwind.config.js") }),
    ]).process(readFileSync(entry, "utf8"), { from: entry });
    return result.css;
  }

  /** `#abc`, `#aabbcc` and `#aabbccdd` to `aabbcc`. */
  function sixDigits(hex: string): string {
    const value = hex.replace("#", "").toLowerCase();
    if (value.length === 3 || value.length === 4) {
      return value
        .slice(0, 3)
        .split("")
        .map((c) => c + c)
        .join("");
    }
    return value.slice(0, 6);
  }

  /** Every colour in a stylesheet, as six hex digits, hex notation and `rgb()` alike. */
  function colours(css: string): string[] {
    const found: string[] = [];
    for (const match of css.matchAll(/#[0-9a-fA-F]{3,8}\b/g)) {
      found.push(sixDigits(match[0]));
    }
    for (const match of css.matchAll(/rgba?\(\s*(\d+)[\s,]+(\d+)[\s,]+(\d+)/g)) {
      found.push(
        [match[1], match[2], match[3]]
          .map((part) => Number(part).toString(16).padStart(2, "0"))
          .join(""),
      );
    }
    return found;
  }

  /** The values a colour is allowed to be: the brand file's, plus pure black and pure white. */
  function permitted(): Set<string> {
    const brand = ruleDeclarations(read("src/styles/design-tokens-brand.css"), ":root");
    const allowed = new Set(["000000", "ffffff"]);
    for (const value of Object.values(brand)) {
      for (const match of value.matchAll(/#[0-9a-fA-F]{3,8}\b/g)) {
        allowed.add(sixDigits(match[0]));
      }
    }
    // The dark panel surface, which is the one value the config resolves rather than copies. The test
    // above checks it against the mix Console declares.
    const panel = read("tailwind.config.js").match(/grayPanel: "(#[0-9a-f]{6})"/);
    allowed.add(sixDigits(group(panel, 1, "grayPanel literal in the config")));
    return allowed;
  }

  it("paints with nothing but declared Redrob values", async () => {
    const css = await compile();
    const allowed = permitted();
    const offenders = new Map<string, number>();
    for (const colour of colours(css)) {
      if (allowed.has(colour)) continue;
      offenders.set(colour, (offenders.get(colour) ?? 0) + 1);
    }
    expect(
      [...offenders].map(([colour, count]) => `#${colour} x${count}`),
      "colours in the built stylesheet that no Redrob token declares",
    ).toEqual([]);
  });

  /**
   * And named specifically, because "not a Redrob value" is a large set and these seven are the ones
   * that were here. Level 500 of each is enough of a fingerprint: if a step of Tailwind's `red` is
   * back in the build, `bg-red-500` is what somebody typed.
   */
  it("keeps no step of a stock status hue", async () => {
    const css = await compile();
    const present = new Set(colours(css));
    const fingerprints: Record<string, string> = {
      red: "ef4444",
      amber: "f59e0b",
      emerald: "10b981",
      sky: "0ea5e9",
      rose: "f43f5e",
      violet: "8b5cf6",
      teal: "14b8a6",
      // The lighter tints these screens actually reached for, which is where the count was.
      "red 50": "fef2f2",
      "amber 50": "fffbeb",
      "emerald 50": "ecfdf5",
      "sky 50": "f0f9ff",
      "red 200": "fecaca",
      "amber 200": "fde68a",
      "red 800": "991b1b",
      "amber 800": "92400e",
    };
    for (const [hue, value] of Object.entries(fingerprints)) {
      expect(present.has(value), `Tailwind's ${hue} (#${value}) is back in the build`).toBe(false);
    }
  });

  /**
   * A `dark:` twin that reads a role is a mistake rather than a nicety: the role already carries the
   * theme, so `dark:bg-destructive-soft` beside `bg-destructive-soft` is the same declaration twice
   * and the pair drifts the day one of them is edited. This is cheap to check and it is how the 355
   * call sites collapsed to 190.
   */
  it("writes no dark twin for a role that carries its own theme", () => {
    const roots = [resolve(rendererRoot, "src"), resolve(rendererRoot, "../../../packages/ui/src")];
    const roles = ["success", "warning", "destructive", "primary", "spectrum", "card", "muted"];
    const offenders: string[] = [];
    for (const file of roots.flatMap(walk)) {
      if (!/\.tsx?$/.test(file) || file.endsWith(".test.ts")) continue;
      const source = readFileSync(file, "utf8");
      for (const role of roles) {
        const pattern = new RegExp(
          `\\bdark:(?:[a-z-]+:)*(?:bg|text|border|ring|fill|stroke|divide|outline)-${role}\\b[a-z-]*`,
          "g",
        );
        for (const match of source.matchAll(pattern)) {
          offenders.push(`${file.slice(rendererRoot.length + 1)}: ${match[0]}`);
        }
      }
    }
    expect(offenders).toEqual([]);
  });
});
