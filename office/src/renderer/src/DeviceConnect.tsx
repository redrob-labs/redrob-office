import { useCallback, useEffect, useRef, useState } from "react";
import { useI18n } from "@redrob/ui";
import type { SetupSnapshot } from "../../shared/office-api";
import { ExternalLinkIcon } from "./icons";
import { Spinner } from "./Spinner";

/**
 * Connecting Office to a console workspace without anyone handling a key.
 *
 * The console issues an ordinary workspace API key through RFC 8628's device
 * grant: Office asks for a code, the person approves that code in their browser,
 * and the main process collects the key and stores it where a pasted one goes.
 * This is the renderer's half, so it holds no credential at all: the device code
 * that could be exchanged for a key never leaves the main process, and the key
 * itself is stored before the renderer is told the wait is over.
 *
 * Paste is not removed anywhere this appears. It is the fallback for a machine
 * that cannot open a browser, or a person who was handed a key by a colleague.
 */

/** Where a wait stands, in the renderer's own words. */
export type DeviceConnectPhase =
  | "idle"
  | "starting"
  | "waiting"
  | "connected"
  | "denied"
  | "expired"
  | "unreachable"
  | "failed";

export interface DeviceConnectState {
  phase: DeviceConnectPhase;
  userCode: string | null;
  /** Set on `failed`, so the copy can name what the console said. */
  failureCode: string | null;
  /** True while a code is live, which is when stopping is worth offering. */
  waiting: boolean;
  start: () => void;
  cancel: () => void;
  /** Opens the approval page again, for a browser that was closed too early. */
  reopen: () => void;
}

/** A poll that says nothing is decided yet, so the loop keeps its place. */
const KEEP_WAITING = new Set(["pending", "slowDown", "unreachable"]);

/**
 * `slow_down` from the console is an instruction, not a hint, so the interval
 * widens by this much each time rather than being ignored.
 */
const SLOW_DOWN_STEP_MS = 2_000;
const MAX_INTERVAL_MS = 30_000;

export function useDeviceConnect(
  onConnected: (setup: SetupSnapshot) => void,
): DeviceConnectState {
  const [phase, setPhase] = useState<DeviceConnectPhase>("idle");
  const [userCode, setUserCode] = useState<string | null>(null);
  const [failureCode, setFailureCode] = useState<string | null>(null);
  const connection = useRef<{ id: string; url: string } | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const live = useRef(true);

  const clearTimer = useCallback(() => {
    if (timer.current !== null) {
      clearTimeout(timer.current);
      timer.current = null;
    }
  }, []);

  // A pending code left behind on the console is a code someone else could be
  // shown, so leaving this screen cancels it rather than letting it age out.
  useEffect(() => {
    live.current = true;
    return () => {
      live.current = false;
      clearTimer();
      const open = connection.current;
      connection.current = null;
      if (open) void window.office.cancelDeviceConnect(open.id);
    };
  }, [clearTimer]);

  const poll = useCallback(
    async (id: string, intervalMs: number): Promise<void> => {
      let result: Awaited<ReturnType<typeof window.office.pollDeviceConnect>>;
      try {
        result = await window.office.pollDeviceConnect(id);
      } catch {
        // An IPC failure is not the console's answer, so it is not final either.
        result = { status: "unreachable" };
      }
      if (!live.current || connection.current?.id !== id) return;

      if (result.status === "connected") {
        connection.current = null;
        setPhase("connected");
        onConnected(result.setup);
        return;
      }

      if (KEEP_WAITING.has(result.status)) {
        const next =
          result.status === "slowDown"
            ? Math.min(intervalMs + SLOW_DOWN_STEP_MS, MAX_INTERVAL_MS)
            : intervalMs;
        setPhase(result.status === "unreachable" ? "unreachable" : "waiting");
        timer.current = setTimeout(() => {
          void poll(id, next);
        }, next);
        return;
      }

      connection.current = null;
      setUserCode(null);
      if (result.status === "failed") setFailureCode(result.code);
      setPhase(
        result.status === "denied"
          ? "denied"
          : result.status === "expired"
            ? "expired"
            : "failed",
      );
    },
    [onConnected],
  );

  const start = useCallback(() => {
    if (phase === "starting" || phase === "waiting" || phase === "unreachable") {
      return;
    }
    clearTimer();
    setFailureCode(null);
    setUserCode(null);
    setPhase("starting");
    void (async () => {
      try {
        const started = await window.office.startDeviceConnect();
        if (!live.current) {
          await window.office.cancelDeviceConnect(started.id);
          return;
        }
        connection.current = {
          id: started.id,
          url: started.verificationUriComplete || started.verificationUri,
        };
        setUserCode(started.userCode);
        setPhase("waiting");
        void window.office.openExternal(connection.current.url);
        timer.current = setTimeout(() => {
          void poll(started.id, started.intervalMs);
        }, started.intervalMs);
      } catch (error) {
        if (!live.current) return;
        setFailureCode(error instanceof Error ? error.message : String(error));
        setPhase("failed");
      }
    })();
  }, [clearTimer, phase, poll]);

  const cancel = useCallback(() => {
    clearTimer();
    const open = connection.current;
    connection.current = null;
    setUserCode(null);
    setPhase("idle");
    if (open) void window.office.cancelDeviceConnect(open.id);
  }, [clearTimer]);

  const reopen = useCallback(() => {
    const open = connection.current;
    if (open) void window.office.openExternal(open.url);
  }, []);

  return {
    phase,
    userCode,
    failureCode,
    waiting: phase === "starting" || phase === "waiting" || phase === "unreachable",
    start,
    cancel,
    reopen,
  };
}

/**
 * One sentence about where the wait is, or null when there is nothing to say.
 * Kept beside the hook so every screen that connects says the same thing.
 */
export function deviceConnectNoticeKey(
  phase: DeviceConnectPhase,
): string | null {
  switch (phase) {
    case "starting":
      return "deviceConnect.starting";
    case "waiting":
      return "deviceConnect.waiting";
    case "unreachable":
      return "deviceConnect.unreachable";
    case "denied":
      return "deviceConnect.denied";
    case "expired":
      return "deviceConnect.expired";
    case "failed":
      return "deviceConnect.failed";
    case "connected":
      return "deviceConnect.connected";
    default:
      return null;
  }
}

/**
 * The connect control and whatever the wait has to say, as one block.
 *
 * `compact` drops the explanatory line for panels that already carry one.
 */
export function DeviceConnectPanel({
  state,
  compact = false,
  disabled = false,
}: {
  state: DeviceConnectState;
  compact?: boolean;
  disabled?: boolean;
}): JSX.Element {
  const { t } = useI18n();
  const noticeKey = deviceConnectNoticeKey(state.phase);
  const notice = noticeKey
    ? t(noticeKey, state.failureCode ? { code: state.failureCode } : undefined)
    : null;

  return (
    <div className="space-y-3">
      {compact ? null : (
        <p className="text-sm leading-relaxed text-gray-600">
          {t("deviceConnect.body")}
        </p>
      )}
      <button
        type="button"
        className="btn-primary inline-flex w-full items-center justify-center gap-2 py-3"
        disabled={disabled || state.waiting || state.phase === "connected"}
        onClick={state.start}
      >
        {state.waiting ? (
          <Spinner className="h-4 w-4" />
        ) : (
          <ExternalLinkIcon className="h-4 w-4" />
        )}
        {state.waiting ? t("deviceConnect.ctaWaiting") : t("deviceConnect.cta")}
      </button>

      {state.userCode ? (
        <div className="rounded-lg border border-gray-300 bg-white/80 px-3 py-2">
          <p className="text-xs font-medium uppercase tracking-wide text-gray-500">
            {t("deviceConnect.codeLabel")}
          </p>
          <p className="mt-1 font-mono text-lg tracking-[0.2em] text-gray-900">
            {state.userCode}
          </p>
        </div>
      ) : null}

      {notice ? (
        <p className="text-xs leading-relaxed text-gray-600" role="status">
          {notice}
        </p>
      ) : null}

      {state.waiting ? (
        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            className="text-xs font-medium text-brand-600 underline underline-offset-2"
            onClick={state.reopen}
          >
            {t("deviceConnect.reopen")}
          </button>
          <button
            type="button"
            className="text-xs text-gray-500 underline underline-offset-2 hover:text-gray-700"
            onClick={state.cancel}
          >
            {t("deviceConnect.stop")}
          </button>
        </div>
      ) : null}

      {compact ? null : (
        <p className="text-[11px] leading-relaxed text-gray-500">
          {t("deviceConnect.noCredit")}
        </p>
      )}
    </div>
  );
}
