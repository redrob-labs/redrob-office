import { createHash } from "node:crypto";
import { createReadStream, createWriteStream } from "node:fs";
import { mkdir, rename, stat, unlink } from "node:fs/promises";
import { request as httpsRequest } from "node:https";
import { request as httpRequest, type IncomingMessage } from "node:http";
import { dirname, join } from "node:path";
import { pipeline } from "node:stream/promises";
import { Transform } from "node:stream";

import type { ModelArtifact } from "../models.js";

export interface DownloadOptions {
  sha256?: string;
  onProgress?: (progress: { bytesReceived: number; totalBytes: number | null }) => void;
}

function localModelPath(artifact: ModelArtifact, modelsDir: string): string {
  return join(modelsDir, ...artifact.hfRepo.split("/"), artifact.hfFile);
}

async function sha256(path: string): Promise<string> {
  const hash = createHash("sha256");
  for await (const chunk of createReadStream(path)) {
    hash.update(chunk);
  }
  return hash.digest("hex");
}

function requestUrl(
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

async function downloadToFile(
  url: URL,
  destination: string,
  offset: number,
  onProgress?: DownloadOptions["onProgress"],
): Promise<void> {
  const headers: Record<string, string> = {};
  if (offset > 0) {
    headers.Range = `bytes=${String(offset)}-`;
  }
  const response = await requestUrl(url, headers, 0);
  if (response.statusCode !== 200 && response.statusCode !== 206) {
    response.resume();
    throw new Error(`Download failed for ${url.toString()}: HTTP ${response.statusCode ?? "unknown"}`);
  }

  const contentLengthHeader = response.headers["content-length"];
  const chunkLength =
    typeof contentLengthHeader === "string" ? Number(contentLengthHeader) : Number.NaN;
  const totalBytes = Number.isFinite(chunkLength)
    ? offset + chunkLength
    : null;
  let bytesReceived = offset;

  const counter = new Transform({
    transform(chunk, _encoding, callback) {
      bytesReceived += chunk.length;
      onProgress?.({ bytesReceived, totalBytes });
      callback(null, chunk);
    },
  });

  const append = offset > 0 && response.statusCode === 206;
  await pipeline(response, counter, createWriteStream(destination, { flags: append ? "a" : "w" }));
}

export async function downloadModel(
  artifact: ModelArtifact,
  modelsDir: string,
  options: DownloadOptions = {},
): Promise<string> {
  const destination = localModelPath(artifact, modelsDir);
  await mkdir(dirname(destination), { recursive: true });

  try {
    const existing = await stat(destination);
    if (existing.size > 0) {
      options.onProgress?.({ bytesReceived: existing.size, totalBytes: existing.size });
      return destination;
    }
  } catch {
    // missing — download below
  }

  const partial = `${destination}.partial`;
  const partialSize = await stat(partial)
    .then((file) => file.size)
    .catch(() => 0);
  const url = new URL(
    `https://huggingface.co/${artifact.hfRepo}/resolve/main/${artifact.hfFile}`,
  );
  await downloadToFile(url, partial, partialSize, options.onProgress);

  if (options.sha256 !== undefined) {
    const actual = await sha256(partial);
    if (actual.toLowerCase() !== options.sha256.toLowerCase()) {
      await unlink(partial);
      throw new Error(`SHA-256 mismatch downloading ${artifact.id}`);
    }
  }
  await rename(partial, destination);
  return destination;
}

export function modelLocalPath(artifact: ModelArtifact, modelsDir: string): string {
  return localModelPath(artifact, modelsDir);
}
