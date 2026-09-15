#!/usr/bin/env node
import { readFile } from "node:fs/promises";

import { extract } from "./index.js";

function argument(name: string): string | undefined {
  const index = process.argv.indexOf(name);
  return index === -1 ? undefined : process.argv[index + 1];
}

async function stdin(): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return Buffer.concat(chunks).toString("utf8");
}

export async function main(): Promise<void> {
  const schemaId = argument("--schema");
  const path = argument("--path");
  if (!schemaId) throw new Error("--schema is required");
  if (path && process.stdin.isTTY) {
    process.stdout.write(`${JSON.stringify(await extract({ source: { kind: "file", path }, schemaId }))}\n`);
    return;
  }
  if (path) {
    await readFile(path);
    process.stdout.write(`${JSON.stringify(await extract({ source: { kind: "file", path }, schemaId }))}\n`);
    return;
  }
  process.stdout.write(`${JSON.stringify(await extract({ source: { kind: "text", content: await stdin() }, schemaId }))}\n`);
}

if (import.meta.url === `file://${process.argv[1]?.replaceAll("\\", "/")}`) {
  main().catch((error: unknown) => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  });
}
