import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

/**
 * Catches asset paths that only break once the app is packaged.
 *
 * In development the renderer is served over http from a root URL, so
 * `/logo.svg` resolves. In a build the window is loaded with `loadFile`, the
 * document is a `file://` URL, and the same leading slash points at the root
 * of the disk — every logo in the app disappears, and nothing in dev ever
 * shows it. A test is the only place this gets noticed before someone opens
 * a build.
 *
 * Files under `public/` are the ones that matter: Vite copies them verbatim
 * and never rewrites what refers to them. Anything imported as a module is
 * rewritten by the bundler and is fine either way.
 */

const RENDERER = fileURLToPath(new URL("../", import.meta.url));

/** `src="/thing.svg"` and `url(/thing.png)`, but not `//host` or `/*`. */
const ABSOLUTE_ASSET = /(?:src|href)="\/(?!\/)[^"]*\.(?:svg|png|jpg|jpeg|gif|webp|ico)"|url\(\/(?!\/)[^)]*\.(?:svg|png|jpg|jpeg|gif|webp|ico)\)/;

function sourceFiles(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    if (entry === "node_modules" || entry === "public") continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) sourceFiles(full, out);
    else if (/\.(tsx?|css)$/.test(entry)) out.push(full);
  }
  return out;
}

describe("renderer assets", () => {
  it("are referenced relatively, so they survive being packaged", () => {
    const offenders: string[] = [];
    for (const file of sourceFiles(RENDERER)) {
      if (/\.test\.tsx?$/.test(file)) continue;
      readFileSync(file, "utf8")
        .split("\n")
        .forEach((line, index) => {
          if (ABSOLUTE_ASSET.test(line)) {
            offenders.push(`${relative(RENDERER, file).split(sep).join("/")}:${index + 1}`);
          }
        });
    }
    expect(offenders).toEqual([]);
  });
});
