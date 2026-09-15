import { createHash } from "node:crypto";
import { createReadStream, createWriteStream } from "node:fs";
import { mkdir, rename, stat, unlink } from "node:fs/promises";
import { request as httpsRequest } from "node:https";
import { request as httpRequest, type IncomingMessage } from "node:http";
import { basename, dirname } from "node:path";
import { pipeline } from "node:stream/promises";
import { Transform } from "node:stream";

/**
 * Shared resumable downloader for third-party runtimes we fetch at first use
 * (whisper.cpp, GPU backends). Nothing here is bundled in the installer.
 */

export interface DownloadProgress {
  bytesReceived: number;
  totalBytes: number | null;
}

export function requestUrl(
  url: URL,
  headers: Record<string, string>,
  redirects: number,
): Promise<IncomingMessage> {
  if (redirects > 8) {
    return Promise.reject(new Error(`Too many redirects downloading ${url.toString()}`));
  }
  const transport = url.protocol === "http:" ? httpRequest : httpsRequest;
  return new Promise((resolve, reject) => {
    const handle = transport(
      url,
      {
        headers: {
          "User-Agent": "redrob/0.0.1",
          ...headers,
        },
      },
      (response) => {
        const location = response.headers.location;
        if (
          response.statusCode !== undefined &&
          response.statusCode >= 300 &&
          response.statusCode < 400 &&
          location !== undefined
        ) {
          response.resume();
          void requestUrl(new URL(location, url), headers, redirects + 1).then(resolve, reject);
          return;
        }
        resolve(response);
      },
    );
    handle.once("error", reject);
    handle.end();
  });
}

export async function fileSha256(path: string): Promise<string> {
  const hash = createHash("sha256");
  for await (const chunk of createReadStream(path)) {
    hash.update(chunk);
  }
  return hash.digest("hex");
}

function parseContentRangeStart(header: string | string[] | undefined): number | null {
  const raw = Array.isArray(header) ? header[0] : header;
  if (!raw) return null;
  const match = /^bytes\s+(\d+)-/i.exec(raw.trim());
  if (!match?.[1]) return null;
  const start = Number(match[1]);
  return Number.isFinite(start) ? start : null;
}

export async function downloadToFile(
  url: URL,
  destination: string,
  onProgress?: (progress: DownloadProgress) => void,
  expectedSize?: number,
): Promise<void> {
  await mkdir(dirname(destination), { recursive: true });
  const partial = `${destination}.partial`;

  for (let attempt = 0; attempt < 3; attempt += 1) {
    let offset = await stat(partial)
      .then((file) => file.size)
      .catch(() => 0);
    // A full-size partial that never got renamed is almost always corrupt — restart.
    if (expectedSize !== undefined && offset >= expectedSize) {
      await unlink(partial).catch(() => undefined);
      offset = 0;
    }

    const headers: Record<string, string> = {};
    if (offset > 0) headers.Range = `bytes=${String(offset)}-`;

    const response = await requestUrl(url, headers, 0);
    if (response.statusCode !== 200 && response.statusCode !== 206) {
      response.resume();
      throw new Error(`Download failed for ${url.toString()}: HTTP ${response.statusCode ?? "?"}`);
    }

    // Broken CDNs sometimes ignore Range and still return 206 with the wrong start.
    // Appending then yields a correct-sized file with garbage mid-stream.
    let writeOffset = offset;
    let append = writeOffset > 0 && response.statusCode === 206;
    if (append) {
      const rangeStart = parseContentRangeStart(response.headers["content-range"]);
      if (rangeStart !== writeOffset) {
        response.resume();
        await unlink(partial).catch(() => undefined);
        continue;
      }
    } else if (writeOffset > 0 && response.statusCode === 200) {
      writeOffset = 0;
      append = false;
    }

    const contentLengthHeader = response.headers["content-length"];
    const chunkLength =
      typeof contentLengthHeader === "string" ? Number(contentLengthHeader) : Number.NaN;
    const totalBytes = Number.isFinite(chunkLength)
      ? writeOffset + chunkLength
      : (expectedSize ?? null);
    let bytesReceived = writeOffset;

    const counter = new Transform({
      transform(chunk, _encoding, callback) {
        bytesReceived += chunk.length;
        onProgress?.({ bytesReceived, totalBytes });
        callback(null, chunk);
      },
    });

    await pipeline(response, counter, createWriteStream(partial, { flags: append ? "a" : "w" }));
    if (expectedSize !== undefined) {
      const written = await stat(partial).then((file) => file.size);
      if (written !== expectedSize) {
        await unlink(partial).catch(() => undefined);
        throw new Error(
          `Download size mismatch for ${basename(destination)}: got ${written}, expected ${expectedSize}`,
        );
      }
    }
    await rename(partial, destination);
    return;
  }

  throw new Error(`Download failed for ${url.toString()}: could not resume cleanly`);
}
