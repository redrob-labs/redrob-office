import { app, BrowserWindow } from "electron";
import updater from "electron-updater";
import type { Logger } from "pino";
import type { UpdateStatusEvent } from "../shared/office-api.js";
import {
  checkedUpdateStatus,
  updateDownloadPercent,
} from "./update-policy.js";

const { autoUpdater } = updater;

let lastStatus: UpdateStatusEvent | null = null;
let configured = false;
let updateLogger: Logger | null = null;
let activeCheck: Promise<UpdateStatusEvent> | null = null;

const CHECK_INTERVAL_MS = 4 * 60 * 60 * 1_000;

function currentVersion(): string {
  return app.getVersion();
}

function broadcast(status: UpdateStatusEvent): void {
  lastStatus = status;
  for (const window of BrowserWindow.getAllWindows()) {
    window.webContents.send("office:updateStatus", status);
  }
}

/** Latest status so a window opened after the event still shows the banner. */
export function getUpdateStatus(): UpdateStatusEvent | null {
  return lastStatus;
}

/** Quits and installs the downloaded update. No-op when nothing is staged. */
export function installDownloadedUpdate(): boolean {
  if (lastStatus?.kind !== "downloaded") return false;
  setImmediate(() => {
    autoUpdater.quitAndInstall();
  });
  return true;
}

function configureAutoUpdater(logger: Logger): void {
  updateLogger = logger;
  if (configured) return;
  configured = true;

  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;
  autoUpdater.allowPrerelease = false;
  autoUpdater.allowDowngrade = false;

  autoUpdater.on("checking-for-update", () => {
    logger.info("Checking for updates");
    broadcast({ kind: "checking", version: currentVersion() });
  });
  autoUpdater.on("update-available", (info) => {
    logger.info({ version: info.version }, "Update available");
    broadcast({ kind: "available", version: info.version });
  });
  autoUpdater.on("update-not-available", () => {
    logger.info("No update available");
    broadcast({ kind: "current", version: currentVersion() });
  });
  autoUpdater.on("download-progress", (progress) => {
    broadcast({
      kind: "downloading",
      version:
        lastStatus?.kind === "available" ||
        lastStatus?.kind === "downloading"
          ? lastStatus.version
          : currentVersion(),
      percent: updateDownloadPercent(progress.percent),
    });
  });
  autoUpdater.on("error", (error) => {
    logger.warn({ err: error }, "Auto-update error");
    broadcast({
      kind: "error",
      version: currentVersion(),
      message: error.message,
    });
  });
  autoUpdater.on("update-downloaded", (info) => {
    logger.info(
      { version: info.version },
      "Update downloaded; will install on quit",
    );
    broadcast({ kind: "downloaded", version: info.version });
  });
}

/** Check GitHub Releases now. Reuses an in-flight check instead of racing it. */
export function checkForUpdates(): Promise<UpdateStatusEvent> {
  if (!app.isPackaged) {
    const status: UpdateStatusEvent = {
      kind: "current",
      version: currentVersion(),
    };
    broadcast(status);
    return Promise.resolve(status);
  }
  if (activeCheck) return activeCheck;

  const logger = updateLogger;
  broadcast({ kind: "checking", version: currentVersion() });
  const check: Promise<UpdateStatusEvent> = autoUpdater
    .checkForUpdates()
    .then((result): UpdateStatusEvent => {
      if (
        lastStatus?.kind === "checking" ||
        lastStatus === null
      ) {
        broadcast(
          checkedUpdateStatus(
            currentVersion(),
            result?.updateInfo.version,
          ),
        );
      }
      return lastStatus ?? checkedUpdateStatus(
        currentVersion(),
        result?.updateInfo.version,
      );
    })
    .catch((error: unknown) => {
      const message = error instanceof Error ? error.message : String(error);
      logger?.warn({ err: error }, "Update check failed");
      const status: UpdateStatusEvent = {
        kind: "error",
        version: currentVersion(),
        message,
      };
      broadcast(status);
      return status;
    })
    .finally(() => {
      activeCheck = null;
    });
  activeCheck = check;
  return check;
}

/**
 * Stable signed updates via GitHub Releases.
 * Only runs in packaged builds; development reports the current version.
 */
export function startAutoUpdates(logger: Logger): void {
  configureAutoUpdater(logger);
  if (!app.isPackaged) {
    return;
  }

  void checkForUpdates();
  const timer = setInterval(() => {
    void checkForUpdates();
  }, CHECK_INTERVAL_MS);
  timer.unref();
}
