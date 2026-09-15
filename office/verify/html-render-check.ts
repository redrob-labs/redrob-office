/**
 * Run the rendered-page check against the two ways a written page comes out
 * blank, plus one that is fine, and report what it said about each.
 *
 * Run: node ./scripts/run-electron-ts.mjs ./verify/html-render-check.ts
 */
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { app } from "electron";
import { checkHtmlRenders } from "../src/main/docs/render/html-check.js";

const GRADIENT_ON_EMPTY_BODY = `<!doctype html><html><head><style>
body { margin: 0; overflow: hidden; background: linear-gradient(to right, #6a11cb, #2575fc); color: white; }
.slide { width: 100vw; height: 100vh; position: absolute; top: 0; left: 0;
  display: flex; align-items: center; justify-content: center; }
</style></head><body>
<div class="slide"><h1>Welcome to the launch</h1></div>
<div class="slide" style="transform: translateX(100vw)"><h1>Second slide</h1></div>
</body></html>`;

const BROKEN_GRADIENT_SYNTAX = `<!doctype html><html><head><style>
html, body { height: 100%; margin: 0; color: white; }
.slide { height: 100%; display: flex; align-items: center; justify-content: center;
  background: linear-gradient to right, #6a11cb, #2575fc); }
</style></head><body>
<div class="slide"><h1>Welcome to the launch</h1></div>
</body></html>`;

const GOOD_DECK = `<!doctype html><html><head><style>
html, body { height: 100%; margin: 0; }
.slide { height: 100%; display: flex; align-items: center; justify-content: center;
  background: linear-gradient(135deg, #6a11cb, #2575fc); color: #fff;
  font: 600 3rem/1.2 system-ui, sans-serif; }
</style></head><body>
<div class="slide"><h1>Welcome to the launch</h1></div>
</body></html>`;

async function main(): Promise<void> {
  await app.whenReady();
  // Each check opens and closes its own window; without this the first close
  // looks like the app being finished with and ends the run.
  app.on("window-all-closed", () => undefined);
  const dir = await mkdtemp(join(tmpdir(), "html-check-"));
  const cases: Array<[string, string, boolean]> = [
    ["gradient on a body with no height", GRADIENT_ON_EMPTY_BODY, false],
    ["missing bracket in linear-gradient", BROKEN_GRADIENT_SYNTAX, false],
    ["a deck that renders", GOOD_DECK, true],
  ];

  let failures = 0;
  for (const [label, source, expectOk] of cases) {
    const path = join(dir, `${label.replace(/\W+/g, "-")}.html`);
    await writeFile(path, source, "utf8");
    const result = await checkHtmlRenders(path);
    const verdict = result.ok === expectOk ? "PASS" : "FAIL";
    if (result.ok !== expectOk) failures += 1;
    console.log(
      `${verdict}  ${label}\n      ok=${result.ok} (expected ${expectOk})` +
        (result.problems.length > 0
          ? `\n      ${result.problems.slice(0, 2).join("\n      ")}`
          : ""),
    );
  }
  // Any extra paths on the command line are reported without a verdict, for
  // looking at a page the agent actually wrote.
  for (const extra of process.argv.slice(2).filter((a) => a.endsWith(".html"))) {
    const result = await checkHtmlRenders(extra);
    console.log(
      `\n${extra}\n      ok=${result.ok}` +
        (result.problems.length > 0 ? `\n      ${result.problems[0]}` : ""),
    );
  }

  console.log(failures === 0 ? "\nALL PASS" : `\n${failures} FAILED`);
  app.exit(failures === 0 ? 0 : 1);
}

void main();
