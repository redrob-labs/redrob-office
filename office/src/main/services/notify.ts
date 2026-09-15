import { EventEmitter } from "node:events";
import { Notification } from "electron";

/**
 * Telling someone something without interrupting them.
 *
 * Background chores (day-log captures, a sidecar dying) used to speak through
 * modal dialogs, which pull the window in front of whatever the person was
 * doing — the exact thing a background chore must never do. An OS notification
 * says the same sentence from the corner of the screen and leaves focus alone.
 */

export interface DesktopNotice {
  title: string;
  body: string;
  /** Chores stay quiet by default; only ask for a sound when it matters. */
  sound?: boolean;
}

/** Emits "notice" with the `DesktopNotice` for everything the app raises. */
export const notices = new EventEmitter();

/** True when the OS actually showed it. */
export function notifyDesktop(notice: DesktopNotice): boolean {
  notices.emit("notice", notice);
  try {
    if (!Notification.isSupported()) return false;
    // No click handler on purpose: a capture notice must not raise the window.
    new Notification({
      title: notice.title,
      body: notice.body,
      silent: notice.sound !== true,
    }).show();
    return true;
  } catch {
    return false;
  }
}
