import { existsSync } from "node:fs";
import { copyFile, mkdir, mkdtemp, readdir, rm, stat, unlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, basename, relative } from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { detectDeviceProfile } from "@redrob/kernel";
import { downloadToFile, fileSha256 } from "../downloads.js";
import { modelsDirPath } from "../setup.js";
import { resolveWhisperBinary, resolveWhisperModel } from "./whisper-cli.js";
import { clearAsrFallbackNotices, stopAsrHost } from "./asr-host.js";
import { ensureAsrReady } from "./voice.js";

const execFileAsync = promisify(execFile);

/** Pin to a known whisper.cpp release with Windows/Linux binaries. */
export const WHISPER_CPP_RELEASE = "v1.9.1";

const HF_WHISPER_REPO = "ggerganov/whisper.cpp";

/** Hugging Face LFS oid + size for models we auto-install (ggerganov/whisper.cpp). */
const ASR_MODEL_DIGESTS: Record<string, { size: number; sha256: string }> = {
  "ggml-small.bin": {
    size: 487_601_967,
    sha256: "1be3a9b2063867b937e64e2ec7483364a79917e157fa98c5d94b5c1fffea987b",
  },
  "ggml-large-v3-turbo.bin": {
    size: 1_624_555_275,
    sha256: "1fc70f774d38eb169993ac391eea357ef47c88757ef72ee5943879b7e8e2bc69",
  },
};

export type AsrInstallStep = "cli" | "model-small" | "model-turbo";

export interface AsrInstallProgressEvent {
  kind: "start" | "download" | "extract" | "ready" | "done" | "error";
  step?: AsrInstallStep;
  percent?: number;
  bytesReceived?: number;
  totalBytes?: number | null;
  detail?: string;
}

export interface AsrSetupStatus {
  modelsDir: string;
  binaryPath: string | null;
  binaryReady: boolean;
  smallModelPath: string | null;
  smallModelReady: boolean;
  turboModelPath: string | null;
  turboModelReady: boolean;
  recommendedTier: "small" | "turbo";
  ready: boolean;
  platformSupported: boolean;
  cliAssetName: string | null;
}

function probeBinary(modelsDir: string): string | null {
  try {
    return resolveWhisperBinary(modelsDir);
  } catch {
    return null;
  }
}

function probeModel(modelsDir: string, tier: "small" | "turbo"): string | null {
  try {
    return resolveWhisperModel(modelsDir, tier);
  } catch {
    return null;
  }
}

function cliAssetForPlatform(): string | null {
  const platform = process.platform;
  const arch = process.arch;
  if (platform === "win32") {
    return arch === "ia32" ? "whisper-bin-Win32.zip" : "whisper-bin-x64.zip";
  }
  if (platform === "linux") {
    return arch === "arm64"
      ? "whisper-bin-ubuntu-arm64.tar.gz"
      : "whisper-bin-ubuntu-x64.tar.gz";
  }
  // No official macOS CLI zip in current releases.
  return null;
}

async function verifyModelFile(path: string, fileName: string): Promise<boolean> {
  const digest = ASR_MODEL_DIGESTS[fileName];
  if (!digest) return existsSync(path);
  try {
    const info = await stat(path);
    if (info.size !== digest.size) return false;
    const actual = await fileSha256(path);
    return actual.toLowerCase() === digest.sha256.toLowerCase();
  } catch {
    return false;
  }
}

async function walkFiles(root: string): Promise<string[]> {
  const out: string[] = [];
  const entries = await readdir(root, { withFileTypes: true });
  for (const entry of entries) {
    const full = join(root, entry.name);
    if (entry.isDirectory()) {
      out.push(...(await walkFiles(full)));
    } else {
      out.push(full);
    }
  }
  return out;
}

async function extractArchive(archivePath: string, destDir: string): Promise<void> {
  await mkdir(destDir, { recursive: true });
  // Windows zip: Expand-Archive handles drive-letter paths correctly.
  // GNU tar (often first on PATH via Git) treats `C:\...` as a remote host.
  if (process.platform === "win32" && archivePath.toLowerCase().endsWith(".zip")) {
    await execFileAsync(
      "powershell.exe",
      [
        "-NoProfile",
        "-NonInteractive",
        "-Command",
        `Expand-Archive -LiteralPath ${JSON.stringify(archivePath)} -DestinationPath ${JSON.stringify(destDir)} -Force`,
      ],
      { windowsHide: true, maxBuffer: 16 * 1024 * 1024 },
    );
    return;
  }
  // Prefer relative paths so drive letters never reach tar's host:path parser.
  const archiveDir = dirname(archivePath);
  const archiveName = basename(archivePath);
  const relDest = relative(archiveDir, destDir);
  const destArg = !relDest || relDest.includes(":") ? destDir : relDest;
  await execFileAsync("tar", ["-xf", archiveName, "-C", destArg], {
    cwd: archiveDir,
    windowsHide: true,
  });
}

function isCliName(name: string): boolean {
  const lower = name.toLowerCase();
  return (
    lower === "whisper-cli.exe" ||
    lower === "whisper-cli" ||
    lower === "main.exe" ||
    lower === "main"
  );
}

async function installCliFromArchive(
  archivePath: string,
  modelsDir: string,
  onProgress?: (event: AsrInstallProgressEvent) => void,
): Promise<string> {
  const extractRoot = await mkdtemp(join(tmpdir(), "redrob-whisper-cli-"));
  try {
    onProgress?.({ kind: "extract", step: "cli", detail: "extracting whisper.cpp CLI" });
    await extractArchive(archivePath, extractRoot);
    const files = await walkFiles(extractRoot);
    const cli = files.find((path) => isCliName(path.split(/[/\\]/).pop() ?? ""));
    if (!cli) {
      throw new Error("whisper-cli not found inside the downloaded archive");
    }
    const cliDir = dirname(cli);
    const binDir = join(modelsDir, "bin");
    await mkdir(binDir, { recursive: true });

    const siblingFiles = await readdir(cliDir);
    for (const name of siblingFiles) {
      const lower = name.toLowerCase();
      if (
        !isCliName(name) &&
        !lower.endsWith(".dll") &&
        !lower.endsWith(".so") &&
        !lower.endsWith(".dylib")
      ) {
        continue;
      }
      await copyFile(join(cliDir, name), join(binDir, name));
    }

    const installed = probeBinary(modelsDir);
    if (!installed) {
      throw new Error(`CLI copied but not resolvable under ${binDir}`);
    }
    return installed;
  } finally {
    await rm(extractRoot, { recursive: true, force: true }).catch(() => undefined);
  }
}

async function downloadModelFile(
  fileName: string,
  destPath: string,
  step: AsrInstallStep,
  onProgress?: (event: AsrInstallProgressEvent) => void,
): Promise<void> {
  const digest = ASR_MODEL_DIGESTS[fileName];
  if (existsSync(destPath) && (await verifyModelFile(destPath, fileName))) {
    onProgress?.({
      kind: "ready",
      step,
      percent: 100,
      detail: destPath,
    });
    return;
  }
  if (existsSync(destPath)) {
    await unlink(destPath).catch(() => undefined);
  }
  await unlink(`${destPath}.partial`).catch(() => undefined);

  const url = new URL(
    `https://huggingface.co/${HF_WHISPER_REPO}/resolve/main/${fileName}?download=true`,
  );
  let lastPct = -1;
  const reportProgress = ({
    bytesReceived,
    totalBytes,
  }: {
    bytesReceived: number;
    totalBytes: number | null;
  }) => {
    if (!totalBytes || totalBytes <= 0) {
      onProgress?.({
        kind: "download",
        step,
        bytesReceived,
        totalBytes,
      });
      return;
    }
    const pct = Math.min(100, Math.floor((bytesReceived / totalBytes) * 100));
    if (pct === lastPct || (pct < 100 && pct - lastPct < 2 && pct % 5 !== 0)) return;
    lastPct = pct;
    onProgress?.({
      kind: "download",
      step,
      percent: pct,
      bytesReceived,
      totalBytes,
    });
  };

  let attempt = 0;
  for (;;) {
    attempt += 1;
    await downloadToFile(url, destPath, reportProgress, digest?.size);
    if (!digest || (await verifyModelFile(destPath, fileName))) {
      onProgress?.({ kind: "ready", step, percent: 100, detail: destPath });
      return;
    }
    await unlink(destPath).catch(() => undefined);
    await unlink(`${destPath}.partial`).catch(() => undefined);
    if (attempt >= 2) {
      throw new Error(
        `SHA-256 mismatch downloading ${fileName} (expected ${digest.sha256})`,
      );
    }
  }
}

export async function getAsrSetupStatus(userData: string): Promise<AsrSetupStatus> {
  const modelsDir = modelsDirPath(userData);
  await mkdir(modelsDir, { recursive: true });
  const binaryPath = probeBinary(modelsDir);
  const smallModelPath = probeModel(modelsDir, "small");
  const turboModelPath = probeModel(modelsDir, "turbo");
  // Keep this path cheap — do not await the inference host (that made mic start feel laggy).
  let recommendedTier: "small" | "turbo" = "small";
  try {
    const profile = await detectDeviceProfile();
    if ((profile.totalRamMb ?? 0) >= 15 * 1024) recommendedTier = "turbo";
  } catch {
    // keep small
  }
  const cliAssetName = cliAssetForPlatform();
  const binaryReady = Boolean(binaryPath);
  const smallModelReady = Boolean(smallModelPath);
  const turboModelReady = Boolean(turboModelPath);
  const modelReady = smallModelReady || turboModelReady;
  return {
    modelsDir,
    binaryPath,
    binaryReady,
    smallModelPath,
    smallModelReady,
    turboModelPath,
    turboModelReady,
    recommendedTier,
    ready: binaryReady && modelReady,
    platformSupported: Boolean(cliAssetName) || binaryReady,
    cliAssetName,
  };
}

export async function installAsrPack(
  userData: string,
  options: { includeTurbo?: boolean } = {},
  onProgress?: (event: AsrInstallProgressEvent) => void,
): Promise<AsrSetupStatus> {
  const modelsDir = modelsDirPath(userData);
  await mkdir(modelsDir, { recursive: true });
  const asrDir = join(modelsDir, "asr");
  await mkdir(asrDir, { recursive: true });

  const statusBefore = await getAsrSetupStatus(userData);
  onProgress?.({ kind: "start", detail: "asr_install_start", percent: 0 });

  const asset = cliAssetForPlatform();
  if (!statusBefore.binaryReady) {
    if (!asset) {
      throw new Error(
        "ERR_ASR_BINARY: Auto-install of whisper.cpp CLI is not available on this OS. Set REDROB_WHISPER_CLI to a local whisper-cli path.",
      );
    }
    const zipUrl = new URL(
      `https://github.com/ggml-org/whisper.cpp/releases/download/${WHISPER_CPP_RELEASE}/${asset}`,
    );
    const archivePath = join(tmpdir(), `redrob-${asset}`);
    let lastPct = -1;
    onProgress?.({ kind: "download", step: "cli", percent: 0, detail: asset });
    await downloadToFile(zipUrl, archivePath, ({ bytesReceived, totalBytes }) => {
      if (!totalBytes || totalBytes <= 0) {
        onProgress?.({
          kind: "download",
          step: "cli",
          bytesReceived,
          totalBytes,
          detail: asset,
        });
        return;
      }
      const pct = Math.min(100, Math.floor((bytesReceived / totalBytes) * 100));
      if (pct === lastPct || (pct < 100 && pct - lastPct < 2 && pct % 5 !== 0)) return;
      lastPct = pct;
      onProgress?.({
        kind: "download",
        step: "cli",
        percent: pct,
        bytesReceived,
        totalBytes,
        detail: asset,
      });
    });
    const installed = await installCliFromArchive(archivePath, modelsDir, onProgress);
    onProgress?.({ kind: "ready", step: "cli", percent: 100, detail: installed });
    await rm(archivePath, { force: true }).catch(() => undefined);
  } else {
    onProgress?.({
      kind: "ready",
      step: "cli",
      percent: 100,
      ...(statusBefore.binaryPath ? { detail: statusBefore.binaryPath } : {}),
    });
  }

  await downloadModelFile(
    "ggml-small.bin",
    join(asrDir, "ggml-small.bin"),
    "model-small",
    onProgress,
  );

  const installTurbo =
    options.includeTurbo ?? statusBefore.recommendedTier === "turbo";

  if (installTurbo) {
    await downloadModelFile(
      "ggml-large-v3-turbo.bin",
      join(asrDir, "ggml-large-v3-turbo.bin"),
      "model-turbo",
      onProgress,
    );
  }

  clearAsrFallbackNotices(["ERR_ASR_BINARY", "ERR_ASR_SIDECAR", "ERR_ASR_ISOLATION"]);
  stopAsrHost();
  try {
    await ensureAsrReady();
  } catch {
    // Status still reports files on disk; host may warm on first use.
  }

  const status = await getAsrSetupStatus(userData);
  onProgress?.({
    kind: "done",
    percent: 100,
    detail: status.ready ? "asr_ready" : "asr_partial",
  });
  return status;
}
