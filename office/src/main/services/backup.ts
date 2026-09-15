import { createCipheriv, createDecipheriv, randomBytes, randomUUID, scryptSync } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdir, readFile, readdir, rename, rm, stat, writeFile } from "node:fs/promises";
import { dirname, join, relative, sep } from "node:path";
import { Readable, Writable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { createGunzip, createGzip } from "node:zlib";
import { nowIso, nowMs } from "../app-time.js";
import { isoAt } from "../office/time/index.js";

export const BACKUP_FORMAT_VERSION = 1;
const MAGIC = Buffer.from("RDBK");

export type BackupPayload = {
  formatVersion: number;
  createdAt: string;
  email: string;
  appVersion: string;
  files: Record<string, string>;
};

const INCLUDE_ROOT_FILES = [
  "setup.json",
  "account.json",
  "profile.json",
  "company-profile.json",
  "redrob.sqlite",
] as const;
const INCLUDE_DIRS = ["registry", "artifacts"] as const;
const SQLITE_SIDECARS = ["redrob.sqlite-wal", "redrob.sqlite-shm"] as const;

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

function deriveKey(email: string, salt: Buffer): Buffer {
  return scryptSync(`redrob-desk-backup|${normalizeEmail(email)}`, salt, 32);
}

async function listFilesRecursive(root: string, base = root): Promise<string[]> {
  if (!existsSync(root)) return [];
  const entries = await readdir(root, { withFileTypes: true });
  const out: string[] = [];
  for (const entry of entries) {
    const full = join(root, entry.name);
    if (entry.isDirectory()) {
      out.push(...(await listFilesRecursive(full, base)));
    } else if (entry.isFile()) {
      out.push(relative(base, full).split(sep).join("/"));
    }
  }
  return out;
}

async function collectBackupFiles(userData: string): Promise<Record<string, string>> {
  const files: Record<string, string> = {};

  for (const name of INCLUDE_ROOT_FILES) {
    const path = join(userData, name);
    if (!existsSync(path)) continue;
    files[name] = (await readFile(path)).toString("base64");
  }
  for (const name of SQLITE_SIDECARS) {
    const path = join(userData, name);
    if (!existsSync(path)) continue;
    files[name] = (await readFile(path)).toString("base64");
  }
  for (const dir of INCLUDE_DIRS) {
    const abs = join(userData, dir);
    const rels = await listFilesRecursive(abs);
    for (const rel of rels) {
      const key = `${dir}/${rel}`;
      files[key] = (await readFile(join(userData, dir, rel))).toString("base64");
    }
  }
  return files;
}

async function gzipBuffer(input: Buffer): Promise<Buffer> {
  const chunks: Buffer[] = [];
  const gzip = createGzip();
  await pipeline(
    Readable.from(input),
    gzip,
    new Writable({
      write(chunk, _enc, cb) {
        chunks.push(Buffer.from(chunk));
        cb();
      },
    }),
  );
  return Buffer.concat(chunks);
}

async function gunzipBuffer(input: Buffer): Promise<Buffer> {
  const chunks: Buffer[] = [];
  const gunzip = createGunzip();
  await pipeline(
    Readable.from(input),
    gunzip,
    new Writable({
      write(chunk, _enc, cb) {
        chunks.push(Buffer.from(chunk));
        cb();
      },
    }),
  );
  return Buffer.concat(chunks);
}

/** Envelope: MAGIC | version | salt(16) | iv(12) | tag(16) | ciphertext(gzip JSON) */
function encryptBlob(plain: Buffer, email: string): Buffer {
  const salt = randomBytes(16);
  const iv = randomBytes(12);
  const key = deriveKey(email, salt);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const encrypted = Buffer.concat([cipher.update(plain), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([MAGIC, Buffer.from([BACKUP_FORMAT_VERSION]), salt, iv, tag, encrypted]);
}

function decryptBlob(blob: Buffer, email: string): Buffer {
  if (blob.length < 4 + 1 + 16 + 12 + 16) {
    throw new Error("Backup file is truncated");
  }
  if (!blob.subarray(0, 4).equals(MAGIC)) {
    throw new Error("Not a Redrob Office backup file");
  }
  const version = blob[4];
  if (version !== BACKUP_FORMAT_VERSION) {
    throw new Error(`Unsupported backup version: ${version}`);
  }
  const salt = blob.subarray(5, 21);
  const iv = blob.subarray(21, 33);
  const tag = blob.subarray(33, 49);
  const encrypted = blob.subarray(49);
  const key = deriveKey(email, salt);
  const decipher = createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(encrypted), decipher.final()]);
}

export async function writeBackupFile(options: {
  userData: string;
  destPath: string;
  email: string;
  appVersion: string;
}): Promise<void> {
  const email = normalizeEmail(options.email);
  const payload: BackupPayload = {
    formatVersion: BACKUP_FORMAT_VERSION,
    createdAt: nowIso(),
    email,
    appVersion: options.appVersion,
    files: await collectBackupFiles(options.userData),
  };
  const compressed = await gzipBuffer(Buffer.from(JSON.stringify(payload), "utf8"));
  const envelope = encryptBlob(compressed, email);
  await mkdir(dirname(options.destPath), { recursive: true });
  await writeFile(options.destPath, envelope);
}

export async function readAndValidateBackup(
  backupPath: string,
  email: string,
): Promise<BackupPayload> {
  const blob = await readFile(backupPath);
  let plain: Buffer;
  try {
    plain = await gunzipBuffer(decryptBlob(blob, email));
  } catch {
    throw new Error("Could not decrypt backup — check that you are signed in with the same email");
  }
  const payload = JSON.parse(plain.toString("utf8")) as BackupPayload;
  if (normalizeEmail(payload.email) !== normalizeEmail(email)) {
    throw new Error("Backup email does not match the signed-in account");
  }
  return payload;
}

export async function restoreBackupFiles(
  userData: string,
  payload: BackupPayload,
): Promise<void> {
  const staging = join(userData, `.restore-staging-${randomUUID().slice(0, 8)}`);
  await mkdir(staging, { recursive: true });
  try {
    for (const [rel, b64] of Object.entries(payload.files)) {
      const dest = join(staging, ...rel.split("/"));
      await mkdir(dirname(dest), { recursive: true });
      await writeFile(dest, Buffer.from(b64, "base64"));
    }

    const replaceTargets = [
      ...INCLUDE_ROOT_FILES,
      ...SQLITE_SIDECARS,
      ...INCLUDE_DIRS,
    ];
    const trash = join(userData, `.restore-trash-${randomUUID().slice(0, 8)}`);
    await mkdir(trash, { recursive: true });

    for (const name of replaceTargets) {
      const current = join(userData, name);
      if (existsSync(current)) {
        await rename(current, join(trash, name));
      }
      const next = join(staging, name);
      if (existsSync(next)) {
        await rename(next, join(userData, name));
      }
    }
    await rm(trash, { recursive: true, force: true });
  } finally {
    await rm(staging, { recursive: true, force: true });
  }
}

export async function assertUserDataReadable(userData: string): Promise<void> {
  const db = join(userData, "redrob.sqlite");
  if (!existsSync(db)) return;
  await stat(db);
}

export function defaultBackupFileName(now: number = nowMs()): string {
  const stamp = isoAt(now).slice(0, 10);
  return `redrob-office-backup-${stamp}.redrobbak`;
}
