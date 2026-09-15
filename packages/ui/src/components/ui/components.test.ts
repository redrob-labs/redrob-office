import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { cn } from "../../lib/cn.js";
import { buttonVariants } from "./button.js";

const componentDir = new URL(".", import.meta.url).pathname;

function componentSources(): Array<[string, string]> {
  return readdirSync(componentDir)
    .filter((name) => name.endsWith(".tsx"))
    .map((name) => [name, readFileSync(join(componentDir, name), "utf8")]);
}

describe("shared UI primitives", () => {
  it("gives every button size and variant one central contract", () => {
    expect(buttonVariants({ size: "xs" })).toContain("h-7");
    expect(buttonVariants({ size: "sm" })).toContain("h-8");
    expect(buttonVariants({ size: "default" })).toContain("h-9");
    expect(buttonVariants({ variant: "default" })).toContain("bg-primary");
    expect(buttonVariants({ variant: "outline" })).toContain("border-input");
    expect(buttonVariants()).toContain("rounded");
  });

  /**
   * These are the controls both Redrob products render, so they name roles and not steps of a ramp.
   * A step is a decision this file is not allowed to make: it has to be written twice, once for each
   * theme, and the second copy is the one that goes stale.
   */
  it("names semantic roles rather than palette steps", () => {
    const palette =
      /\b(?:bg|text|border|ring|placeholder|fill|stroke|from|to|via|divide)-(?:gray|brand|red|blue|slate|zinc|emerald|amber|indigo|sky|violet|rose|white|black)(?:-\d+)?(?:\/\d+)?\b/g;
    for (const [name, source] of componentSources()) {
      expect(source.match(palette), `${name} names a palette step`).toBeNull();
    }
  });

  /**
   * A `dark:` variant on a colour means the same decision was made twice. The roles carry the theme,
   * so a control that still writes one is a control whose two halves can disagree.
   */
  it("leaves the theme to the token layer", () => {
    for (const [name, source] of componentSources()) {
      expect(source.match(/\bdark:/g), `${name} repaints itself for dark`).toBeNull();
    }
  });

  it("resolves conflicting utility classes at the component boundary", () => {
    expect(cn("h-8 px-3", "h-9")).toBe("px-3 h-9");
    expect(cn("rounded-md", false && "rounded-lg", "rounded")).toBe("rounded");
  });

  it("opens Select content at the trigger width", () => {
    const source = readFileSync(new URL("./select.tsx", import.meta.url), "utf8");
    expect(source.match(/var\(--radix-select-trigger-width\)/g)).toHaveLength(2);
    expect(source).toContain("SelectPrimitive.ItemIndicator");
    expect(source).toContain("✓");
  });
});
