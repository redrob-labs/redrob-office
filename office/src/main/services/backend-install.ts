import { execFile } from "node:child_process";
import { randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdir, readdir, rename, rm, stat } from "node:fs/promises";
import { basename, dirname, join, relative } from "node:path";
import { promisify } from "node:util";
import {
  backendDescriptor,
  backendDownloadBytes,
  backendInstallDir,
  backendsForHost,
  invalidateExecutionPlanCache,
  recommendBackendForHost,
  resolveServerBinary,
  runtimeDir,
  stopLlamaServer,
  type BackendArchive,
  type BackendDescriptor,
  type BackendId,
} from "@redrob/kernel";
import { downloadToFile, fileSha256 } from "./downloads.js";
import { resetLocalReadiness, restartInferenceHost } from "./inference-host.js";

const execFileAsync = promisify(execFile);

/**
 * Fetches the llama.cpp release that `backend-matrix.ts` pins and unpacks it
 * into the user's runtime dir.
 *
 * llama-server is never bundled: the CUDA build alone is 600MB across two
 * archives, most of which is a CUDA runtime that only NVIDIA machines need. The
 * matrix already carries exact asset names, URLs, sizes and SHA-256 digests, so
 * nothing here constructs a URL or trusts a download it has not hashed.
 *
 * Everything lands under the user profile. No admin rights, no PATH changes,
 * and uninstalling is a directory delete.
 */

export interface BackendInstallProgressEvent {
  kind: "start" | "download" | "extract" | "done" | "error";
  backendId: BackendId;
  /** Overall percent across every archive in the backend, not per archive. */
  percent?: number;
  /** Which archive is in flight, 1-based, for "2 of 2" style copy. */
  archiveIndex?: number;
  archiveCount?: number;
  bytesReceived?: number;
  totalBytes?: number | null;
  detail?: string;
}

export interface BackendOption {
  id: BackendId;
  engine: BackendDescriptor["engine"];
  installed: boolean;
  /** Bytes to fetch, or null when upstream publishes nothing for this target. */
  downloadBytes: number | null;
  requirements: string;
  /** Set when the backend exists but cannot be installed unattended. */
  unavailableReason: string | null;
  supportsVision: boolean;
}

export interface BackendStatus {
  /** True once any backend on this host has a resolvable llama-server. */
  ready: boolean;
  /** The backend the hardware wants, installed or not. */
  recommendedId: BackendId | null;
  /** How that recommendation was reached, for the Device panel. */
  detectionChain: string;
  /** Which backend is actually serving, when one is. */
  activeId: BackendId | null;
  binaryPath: string | null;
  installDir: string;
  options: BackendOption[];
  /** Set when REDROB_LLAMA_SERVER points the app at a hand-built binary. */
  overridePath: string | null;
}

function optionFor(descriptor: BackendDescriptor): BackendOption {
  return {
    id: descriptor.id,
    engine: descriptor.engine,
    installed: resolveServerBinary(descriptor.id) !== null,
    downloadBytes: backendDownloadBytes(descriptor.id),
    requirements: descriptor.requirements ?? "",
    unavailableReason: descriptor.unavailableReason ?? null,
    supportsVision: descriptor.supportsVision,
  };
}

export async function getBackendStatus(): Promise<BackendStatus> {
  const options = backendsForHost().map(optionFor);
  const override = process.env.REDROB_LLAMA_SERVER?.trim();

  let recommendedId: BackendId | null = null;
  let detectionChain = "";
  try {
    const recommendation = await recommendBackendForHost();
    recommendedId = recommendation.backendId;
    detectionChain = recommendation.reasonParts.join(" → ");
  } catch (error) {
    // No backend is published for this platform at all. The options list is
    // empty and the panel says so; there is nothing to recommend.
    detectionChain = error instanceof Error ? error.message : String(error);
  }

  const active =
    recommendedId !== null && resolveServerBinary(recommendedId) !== null
      ? recommendedId
      : (options.find((option) => option.installed)?.id ?? null);

  return {
    ready: active !== null || Boolean(override),
    recommendedId,
    detectionChain,
    activeId: active,
    binaryPath: active === null ? (override ?? null) : resolveServerBinary(active),
    installDir: runtimeDir(),
    options,
    overridePath: override ? override : null,
  };
}

/** Every file under `root`, relative to it, so a flat archive can be spotted. */
async function entryNames(root: string): Promise<string[]> {
  const entries = await readdir(root, { withFileTypes: true });
  return entries.map((entry) => entry.name);
}

/**
 * bsdtar, which ships in System32 on Windows 10 1803+ and reads zip.
 *
 * Named by absolute path on purpose. A bare `tar` picks up whatever is first on
 * PATH, which on a dev machine is usually Git's GNU tar, and that one reads
 * `C:\...` as a remote host. Returns null on older Windows so the caller can
 * fall back.
 */
function windowsBsdtar(): string | null {
  const path = join(process.env.SystemRoot ?? "C:\\Windows", "System32", "tar.exe");
  return existsSync(path) ? path : null;
}

async function extractArchive(archivePath: string, destination: string): Promise<void> {
  await mkdir(destination, { recursive: true });

  // Relative paths keep drive letters away from tar's host:path parser.
  const archiveDir = dirname(archivePath);
  const relativeDestination = relative(archiveDir, destination);
  const target =
    !relativeDestination || relativeDestination.includes(":") ? destination : relativeDestination;
  const tar = process.platform === "win32" ? windowsBsdtar() : "tar";

  if (tar) {
    await execFileAsync(tar, ["-xf", basename(archivePath), "-C", target], {
      cwd: archiveDir,
      windowsHide: true,
      timeout: 20 * 60 * 1000,
    });
    return;
  }

  // Windows without bsdtar. Expand-Archive is the only thing guaranteed to be
  // there and it is minutes slower on an archive this size, so it is the last
  // resort rather than the default.
  await execFileAsync(
    "powershell.exe",
    [
      "-NoProfile",
      "-NonInteractive",
      "-Command",
      `Expand-Archive -LiteralPath ${JSON.stringify(archivePath)} -DestinationPath ${JSON.stringify(destination)} -Force`,
    ],
    { windowsHide: true, maxBuffer: 16 * 1024 * 1024, timeout: 30 * 60 * 1000 },
  );
}

async function fetchArchive(
  archive: BackendArchive,
  cacheDir: string,
  onBytes: (received: number, total: number | null) => void,
): Promise<string> {
  const path = join(cacheDir, archive.fileName);
  const cached = await stat(path).catch(() => null);
  if (cached?.size === archive.sizeBytes) {
    const digest = await fileSha256(path);
    if (digest.toLowerCase() === archive.sha256.toLowerCase()) {
      onBytes(archive.sizeBytes, archive.sizeBytes);
      return path;
    }
  }

  await downloadToFile(new URL(archive.url), path, (progress) => {
    onBytes(progress.bytesReceived, progress.totalBytes);
  }, archive.sizeBytes);

  const digest = await fileSha256(path);
  if (digest.toLowerCase() !== archive.sha256.toLowerCase()) {
    await rm(path, { force: true });
    throw new Error(
      `${archive.fileName} failed verification: expected ${archive.sha256}, got ${digest}`,
    );
  }
  return path;
}

/**
 * Download, verify and unpack a backend, then swap it into place.
 *
 * The swap is a directory rename after every archive has been extracted, so an
 * interrupted install leaves the previous backend intact rather than a half
 * unpacked one that `resolveServerBinary` would happily find.
 */
export async function installBackend(
  backendId: BackendId,
  onProgress?: (event: BackendInstallProgressEvent) => void,
): Promise<BackendStatus> {
  const descriptor = backendDescriptor(backendId);
  const emit = (event: Omit<BackendInstallProgressEvent, "backendId">): void => {
    onProgress?.({ backendId, ...event });
  };

  if (!descriptor.archives) {
    const detail =
      descriptor.unavailableReason ?? `No prebuilt archive is published for ${backendId}.`;
    emit({ kind: "error", detail });
    throw new Error(detail);
  }
  if (descriptor.platform !== process.platform) {
    const detail = `${backendId} is for ${descriptor.platform}, not ${process.platform}`;
    emit({ kind: "error", detail });
    throw new Error(detail);
  }

  const archives = descriptor.archives;
  const totalBytes = archives.reduce((sum, archive) => sum + archive.sizeBytes, 0);
  emit({ kind: "start", percent: 0, archiveCount: archives.length, totalBytes });

  const cacheDir = join(runtimeDir(), "downloads");
  await mkdir(cacheDir, { recursive: true });
  // Staged inside the runtime dir, not the temp dir: the final step is a rename
  // and a rename across volumes fails, which is exactly what a temp dir on a
  // different drive would give us.
  const staging = join(runtimeDir(), `.staging-${randomUUID().slice(0, 8)}`);
  await mkdir(staging, { recursive: true });

  try {
    const paths: string[] = [];
    let completedBytes = 0;
    for (const [index, archive] of archives.entries()) {
      const path = await fetchArchive(archive, cacheDir, (received, archiveTotal) => {
        const seen = completedBytes + received;
        emit({
          kind: "download",
          percent: Math.round((seen / totalBytes) * 100),
          archiveIndex: index + 1,
          archiveCount: archives.length,
          bytesReceived: seen,
          totalBytes: archiveTotal === null ? null : totalBytes,
        });
      });
      completedBytes += archive.sizeBytes;
      paths.push(path);
    }

    // Both CUDA archives unpack into one directory: the binaries need the CUDA
    // runtime DLLs beside them or llama-server dies on load.
    emit({ kind: "extract", percent: 100, archiveCount: archives.length });
    const unpacked = join(staging, "payload");
    for (const path of paths) {
      await extractArchive(path, unpacked);
    }
    if ((await entryNames(unpacked)).length === 0) {
      throw new Error(`${backendId} archives extracted to nothing`);
    }

    // The running server holds its own binary open on Windows, so the old
    // directory cannot be replaced until it lets go.
    stopLlamaServer();

    const target = backendInstallDir(backendId);
    await mkdir(dirname(target), { recursive: true });
    await rm(target, { recursive: true, force: true });
    await rename(unpacked, target);

    if (resolveServerBinary(backendId) === null) {
      throw new Error(
        `${backendId} unpacked but ${descriptor.serverBinary} was not where it was expected`,
      );
    }

    // Both processes concluded there was nothing to run on, and both remember
    // it: the main process caches the plan, and the sidecar gave up at boot and
    // left the app running in-process. Clearing one without the other means the
    // install appears to succeed and the next call still fails.
    invalidateExecutionPlanCache();
    resetLocalReadiness();
    await restartInferenceHost().catch(() => undefined);

    emit({ kind: "done", percent: 100 });
    return await getBackendStatus();
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    emit({ kind: "error", detail });
    throw error instanceof Error ? error : new Error(detail);
  } finally {
    await rm(staging, { recursive: true, force: true }).catch(() => undefined);
  }
}

/** Delete an installed backend. Uninstalling is just removing the directory. */
export async function removeBackend(backendId: BackendId): Promise<BackendStatus> {
  stopLlamaServer();
  await rm(backendInstallDir(backendId), { recursive: true, force: true });
  invalidateExecutionPlanCache();
  resetLocalReadiness();
  return getBackendStatus();
}
