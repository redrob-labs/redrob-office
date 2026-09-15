/**
 * Serve a written web page over HTTP, so a link to it actually opens it.
 *
 * A page in the documents folder can be previewed in the app, but a person who
 * has just made one wants to look at it in a browser, hand it to the tab they
 * already have open, or point a phone on the same desk at it. `file://` does
 * not survive being pasted anywhere, and a page with `fetch` or a module script
 * in it will not run from disk at all.
 *
 * What this does not do is publish. The server binds to the loopback address
 * and lives only as long as the app does; the URL works on this computer and
 * nowhere else. That is worth saying plainly, because the alternative — a
 * button that reports a hosted address that was never created — is a lie the
 * person only discovers when they send the link to somebody.
 */
import { createServer, type Server } from "node:http";
import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { randomBytes } from "node:crypto";
import { basename, dirname, extname, relative, resolve, sep } from "node:path";

/** Media types for what a page written by the agent tends to pull in. */
const CONTENT_TYPES: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".htm": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".avif": "image/avif",
  ".ico": "image/x-icon",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".ttf": "font/ttf",
  ".otf": "font/otf",
  ".mp4": "video/mp4",
  ".webm": "video/webm",
  ".txt": "text/plain; charset=utf-8",
};

interface ServedPage {
  /** Folder the page and anything beside it are read from. */
  dir: string;
  /** File the slug's root path answers with. */
  entry: string;
}

const pages = new Map<string, ServedPage>();
let server: Server | null = null;
let port = 0;

/** The file a request is asking for, or null when it is asking to escape. */
function resolveRequest(url: string): string | null {
  const path = decodeURIComponent(new URL(url, "http://127.0.0.1").pathname);
  const [, slug = "", ...rest] = path.split("/");
  const page = pages.get(slug);
  if (!page) return null;
  const wanted = rest.join("/");
  const target = resolve(page.dir, wanted === "" ? page.entry : wanted);
  // A sibling of the page is fair game; anything above its folder is not.
  const inside = relative(page.dir, target);
  if (inside.startsWith("..") || inside.startsWith(sep) || inside.includes("..")) {
    return null;
  }
  return target;
}

async function start(): Promise<void> {
  if (server) return;
  const next = createServer((request, response) => {
    void (async () => {
      const target = request.url ? resolveRequest(request.url) : null;
      if (!target) {
        response.writeHead(404, { "content-type": "text/plain" });
        response.end("Not found");
        return;
      }
      try {
        const info = await stat(target);
        if (!info.isFile()) throw new Error("not a file");
        response.writeHead(200, {
          "content-type": CONTENT_TYPES[extname(target).toLowerCase()] ?? "application/octet-stream",
          "content-length": String(info.size),
          // The page is a working copy: an edit and a reload should show the edit.
          "cache-control": "no-store",
        });
        createReadStream(target).pipe(response);
      } catch {
        response.writeHead(404, { "content-type": "text/plain" });
        response.end("Not found");
      }
    })();
  });
  await new Promise<void>((resolve_, reject) => {
    next.once("error", reject);
    next.listen(0, "127.0.0.1", () => {
      next.removeListener("error", reject);
      resolve_();
    });
  });
  const address = next.address();
  if (!address || typeof address === "string") {
    next.close();
    throw new Error("The page server did not get a port.");
  }
  // Nothing here is worth holding a socket open for, and an idle keep-alive
  // connection is the thing that makes closing the server take seconds.
  next.keepAliveTimeout = 1_000;
  server = next;
  port = address.port;
}

/**
 * Put one page on the local server and return the URL that opens it.
 *
 * Asking twice for the same page gives the same URL back, so a link already
 * pasted somewhere keeps working.
 */
export async function servePageLocally(absolutePath: string): Promise<string> {
  const target = resolve(absolutePath);
  const info = await stat(target);
  if (!info.isFile()) throw new Error("Only a file can be served.");
  await start();

  const dir = dirname(target);
  const entry = basename(target);
  for (const [slug, page] of pages) {
    if (page.dir === dir && page.entry === entry) {
      return `http://127.0.0.1:${port}/${slug}/`;
    }
  }
  const slug = randomBytes(8).toString("hex");
  pages.set(slug, { dir, entry });
  return `http://127.0.0.1:${port}/${slug}/`;
}

/** Drop every page and close the port. Used on quit and by tests. */
export async function stopServingPages(): Promise<void> {
  pages.clear();
  const open = server;
  server = null;
  port = 0;
  if (!open) return;
  open.closeAllConnections();
  await new Promise<void>((resolve_) => open.close(() => resolve_()));
}
