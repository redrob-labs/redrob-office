import { readdirSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * The sidebar wears one corner and one button size.
 *
 * It had drifted to three radii (8, 10 and 12px) and four button sizes, which
 * read as sloppiness rather than hierarchy: the Redrob DM's 16px mark with an
 * 8px corner was a circle sitting next to 24px squares. These are the rules
 * that keep it from drifting back.
 */

const rendererRoot = resolve(import.meta.dirname, "..");
const workspaceRoot = resolve(rendererRoot, "../../..");
const sidebarFiles = ["src/ChatSessionsPanel.tsx", "src/ShortcutsMap.tsx"];

function read(relative: string): string {
  return readFileSync(resolve(rendererRoot, relative), "utf8");
}

describe("sidebar shape", () => {
  it("resolves `rounded` to the 8px step of the scale", () => {
    const config = read("tailwind.config.js");
    expect(config).toContain('DEFAULT: "var(--radius-300)"');

    const tokens = read("src/styles/design-tokens-object.css");
    expect(tokens).toContain("--foundation-radius-300: 8px;");
    expect(tokens).toContain("--radius-300: var(--foundation-radius-300);");
  });

  it.each(sidebarFiles)("uses only that corner in %s", (file) => {
    const source = read(file);
    // `rounded-full` is a different intent — dots and pills, not panels.
    const others = source.match(/\brounded-(?!full\b)[a-z0-9[]+/g) ?? [];
    expect(others).toEqual([]);
  });

  it.each(sidebarFiles)("keeps icon buttons one size in %s", (file) => {
    const source = read(file);
    for (const odd of ["h-9 w-9", "h-7 w-7", "h-5 w-5"]) {
      expect(source).not.toContain(odd);
    }
  });

  /**
   * Settings drifted the other way: 12px and 16px cards with 10px buttons, so
   * the same controls looked rounder there than anywhere else. `rounded-sm` is
   * still allowed, because a 4px corner nested inside an 8px one is what keeps
   * a segmented control's halves concentric with its track.
   */
  it.each(["src/McpSettingsCard.tsx"])("wears no corner above 8px in %s", (file) => {
    const source = read(file);
    const others = source.match(/\brounded-(md|lg|xl|2xl|3xl)\b/g) ?? [];
    expect(others).toEqual([]);
  });

  /**
   * A card's four borders cost a column its first pixel, which is all it takes
   * for its header divider to miss the sidebar's by one — measured at 43.19 vs
   * 44.19 before this. Shell columns use `.pane`, which drops the top border.
   */
  it("builds shell columns as panes rather than cards", () => {
    expect(read("src/styles.css")).toMatch(/\.pane \{[^}]*border-x/);
    for (const file of ["src/SettingsPanel.tsx", "src/App.tsx"]) {
      expect(read(file), file).toMatch(/className="pane /);
    }
    // The two Settings columns are the pair the seam is judged on.
    const settings = read("src/SettingsPanel.tsx");
    expect(settings.match(/className="pane /g)).toHaveLength(2);
    expect(settings).not.toContain('className="surface ');
  });

  it("lines up every panel header divider at 48px", () => {
    const header = /flex h-12 shrink-0 items-center[^"]*border-b border-gray-200/;
    for (const file of [
      "src/ChatSessionsPanel.tsx",
      "src/ChatPanel.tsx",
      "src/ChatSidePanel.tsx",
      "src/SettingsPanel.tsx",
      "src/App.tsx",
    ]) {
      expect(read(file), file).toMatch(header);
    }
    // A two-column screen needs both, or the rail's divider sits above the
    // section's and the seam runs at two heights across one window.
    for (const file of ["src/SettingsPanel.tsx", "src/App.tsx"]) {
      expect(read(file).match(new RegExp(header, "g")), file).toHaveLength(2);
    }
  });

  /**
   * A rule inside a panel is gray-200; gray-300 is the outline around a card.
   * Mixing them put two different greys on the same seam.
   */
  it("draws every divider inside a panel in one grey", () => {
    const offenders: string[] = [];
    for (const file of readdirSync(join(rendererRoot, "src"))) {
      if (!file.endsWith(".tsx")) continue;
      if (/\bborder-(t|b) border-gray-300\b/.test(read(join("src", file)))) {
        offenders.push(file);
      }
    }
    expect(offenders).toEqual([]);
  });

  it("keeps MCP transport wording out of the interface", () => {
    const source = read("src/McpSettingsCard.tsx");
    for (const jargon of ["Stdio Local", "SSE Remote", "Stdio (", "SSE ("]) {
      expect(source).not.toContain(jargon);
    }
  });

  it("builds MCP controls from the shared shadcn layer", () => {
    const source = read("src/McpSettingsCard.tsx");
    for (const component of ["Button", "Card", "Select", "Tabs"]) {
      expect(source, component).toMatch(
        new RegExp(`\\b${component}\\b`),
      );
    }
    expect(source).not.toMatch(/<(?:button|select)\b/);

    const shadcn = readFileSync(
      resolve(workspaceRoot, "packages/ui/components.json"),
      "utf8",
    );
    expect(JSON.parse(shadcn)).toMatchObject({
      style: "new-york",
      rsc: false,
      tsx: true,
    });
    const tailwind = read("tailwind.config.js");
    expect(tailwind).toContain("relative: true");
    expect(tailwind).toContain(
      "../../../packages/ui/src/**/*.{js,ts,jsx,tsx}",
    );
  });

  /**
   * Channels and DMs scroll separately. Sharing one scroller meant ninety-odd
   * channels pushed the DM section below the panel, which is exactly the part
   * someone reaches for most.
   */
  it("scrolls channels and DMs in separate regions", () => {
    const source = read("src/ChatSessionsPanel.tsx");
    const scrollers = source.match(/overflow-y-auto/g) ?? [];
    // The collapsed rail has one of its own, plus one per conversation section.
    expect(scrollers.length).toBeGreaterThanOrEqual(3);
    // The DM strip is capped, so a long teammate list cannot reclaim the panel.
    expect(source).toMatch(/max-h-56 min-h-0 overflow-y-auto/);
    // And it never shrinks away when the channel list is long.
    expect(source).toMatch(
      /<section className="flex shrink-0 flex-col border-t/,
    );
  });

  /**
   * The channels heading carries the collapse caret, the count and the new-chat
   * button. Scrolled away, a long list has no visible way to close itself.
   */
  it("keeps the channels heading pinned while its rows scroll", () => {
    const source = read("src/ChatSessionsPanel.tsx");
    expect(source).toMatch(/sticky top-0 z-10 flex items-center justify-between/);
    // An opaque background, or rows read through the heading as they pass. `--card` is a solid
    // colour in both themes, which is the property that matters here; it used to be the two hexes
    // written out, which is how the dark half got left behind when the ramp moved to the brand's.
    expect(source).toMatch(/sticky top-0 z-10[^"]*\bbg-card\b/);
  });

  it("gives every conversation row the same 24px leading slot", () => {
    const source = read("src/ChatSessionsPanel.tsx");
    expect(source).toContain(
      '<span className="flex h-6 w-6 shrink-0 items-center justify-center">',
    );
    // Redrob's mark is the one that used to be half the size of a teammate's.
    expect(source).toContain(
      'className="h-6 w-6 rounded ring-1 ring-gray-900/5 dark:ring-white/10"',
    );
  });
});
