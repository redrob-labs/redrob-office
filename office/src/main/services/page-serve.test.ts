import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { servePageLocally, stopServingPages } from "./page-serve.js";

describe("servePageLocally", () => {
  let dir = "";

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "redrob-serve-"));
  });

  afterEach(async () => {
    await stopServingPages();
    rmSync(dir, { recursive: true, force: true });
  });

  it("answers with the page, and with what the page pulls in beside it", async () => {
    writeFileSync(
      join(dir, "deck.html"),
      `<!doctype html><link rel="stylesheet" href="deck.css"><h1>Slide one</h1>`,
    );
    writeFileSync(join(dir, "deck.css"), "h1 { color: rebeccapurple }");

    const url = await servePageLocally(join(dir, "deck.html"));
    // The URL is the point of the feature: it has to be one a browser accepts.
    expect(url).toMatch(/^http:\/\/127\.0\.0\.1:\d+\/[0-9a-f]{16}\/$/);

    const page = await fetch(url);
    expect(page.status).toBe(200);
    expect(page.headers.get("content-type")).toContain("text/html");
    expect(await page.text()).toContain("Slide one");

    const css = await fetch(new URL("deck.css", url));
    expect(css.status).toBe(200);
    expect(css.headers.get("content-type")).toContain("text/css");
    expect(await css.text()).toContain("rebeccapurple");
  });

  it("hands the same link back for the same page", async () => {
    writeFileSync(join(dir, "page.html"), "<p>hi</p>");
    const first = await servePageLocally(join(dir, "page.html"));
    const again = await servePageLocally(join(dir, "page.html"));
    // A link that was already pasted somewhere has to keep working.
    expect(again).toBe(first);
  });

  it("serves nothing above the page's own folder", async () => {
    const secrets = join(dir, "private.txt");
    writeFileSync(secrets, "do not serve me");
    const pageDir = join(dir, "site");
    mkdirSync(pageDir);
    writeFileSync(join(pageDir, "index.html"), "<p>site</p>");

    const url = await servePageLocally(join(pageDir, "index.html"));
    for (const attempt of ["../private.txt", "..%2fprivate.txt", "%2e%2e/private.txt"]) {
      const response = await fetch(new URL(attempt, url));
      expect(response.status, attempt).toBe(404);
    }
  });

  it("stops answering once serving is over", async () => {
    writeFileSync(join(dir, "page.html"), "<p>hi</p>");
    const url = await servePageLocally(join(dir, "page.html"));
    expect((await fetch(url)).status).toBe(200);

    await stopServingPages();
    await expect(fetch(url)).rejects.toThrow();
  });
});
