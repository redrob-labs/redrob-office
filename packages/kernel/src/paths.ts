import { homedir } from "node:os";
import { join } from "node:path";

/**
 * Brand-level on-disk root for Redrob weights.
 * Paths use `redrob` (not the desk app id) so fine-tuned / rebranded
 * tier models can be shared across Office and future CLIs.
 */
export const REDROB_BRAND = "redrob";

export function redrobDataDir(): string {
  if (process.platform === "win32") {
    const base =
      process.env.LOCALAPPDATA ?? join(homedir(), "AppData", "Local");
    return join(base, REDROB_BRAND);
  }
  if (process.platform === "darwin") {
    return join(homedir(), "Library", "Application Support", REDROB_BRAND);
  }
  return join(homedir(), ".local", "share", REDROB_BRAND);
}

export function defaultModelsDir(): string {
  if (process.env.REDROB_MODELS_DIR) {
    return process.env.REDROB_MODELS_DIR;
  }
  return join(redrobDataDir(), "models");
}

/**
 * Where the documents the app produces are kept.
 *
 * Beside the models rather than under the app's own settings folder: what a
 * person made is theirs, it outlives any one version of the app, and on Linux
 * the settings folder is `~/.config`, which the file tools refuse to touch —
 * so anything written there was unreachable by the tools that made it.
 */
export function defaultArtifactsDir(): string {
  if (process.env.REDROB_ARTIFACTS_DIR) {
    return process.env.REDROB_ARTIFACTS_DIR;
  }
  return join(redrobDataDir(), "artifacts");
}

/**
 * Where downloaded llama.cpp backends are extracted, one directory per backend id.
 * Under the user's app data, never the install directory: the app must not need
 * write access to Program Files and a backend must survive an app update.
 */
export function runtimeDir(): string {
  if (process.env.REDROB_RUNTIME_DIR) {
    return process.env.REDROB_RUNTIME_DIR;
  }
  return join(redrobDataDir(), "runtime");
}

export function backendInstallDir(backendId: string): string {
  return join(runtimeDir(), backendId);
}
