import { randomUUID } from "node:crypto";

import { nowMs } from "../app-time.js";
import { REDROB_CONSOLE_API_BASE } from "../../shared/office-api.js";

/**
 * Connecting Redrob Office to a console workspace without anyone handling the key.
 *
 * The console implements RFC 8628's device authorization grant. Office asks it for a code, sends the
 * person to the console to approve that code, and polls until the console hands back a workspace API
 * key. The key then goes exactly where a pasted one goes, into the Console provider slot in
 * setup.json, so nothing downstream learns a second way to authenticate.
 *
 * Two decisions worth stating.
 *
 * The device code never leaves the main process. It is the bearer of the pending connection, so the
 * renderer is handed an opaque local id instead and never holds a value that could be collected from
 * it. Pending connections live in memory only: one that does not survive a restart is one the person
 * starts again in ten seconds, and persisting a device code would mean writing a credential to disk
 * in the one flow whose whole point is not doing that.
 *
 * Nothing here retries on its own. Every refusal from the console is returned as what it is, and a
 * caller that keeps polling past a denial gets the same answer, because the console will never turn
 * a refused code into a key.
 */

/** What this product calls itself on the console's confirm screen. */
export const REDROB_DEVICE_PRODUCT = "office";

/**
 * Ten minutes is the console's own deadline. Held here as a floor for the record's lifetime so a
 * console that stopped sending `expiresIn` cannot leave a pending connection in memory forever.
 */
const FALLBACK_TTL_MS = 10 * 60_000;
const FALLBACK_INTERVAL_MS = 5_000;
/** More than a person will ever have open at once, and a bound on a caller looping on start. */
const MAX_PENDING = 8;

export type RedrobDeviceFetch = (
  input: string,
  init?: RequestInit,
) => Promise<Response>;

/** What the renderer is told: enough to show a code and open a browser, and no device code. */
export interface RedrobDeviceConnectionStart {
  id: string;
  userCode: string;
  verificationUri: string;
  verificationUriComplete: string;
  /** Wall-clock milliseconds, so the caller can count down without trusting its own clock offset. */
  expiresAt: number;
  intervalMs: number;
}

/**
 * Every way a poll can end. `pending` and `slow_down` mean keep waiting; `unreachable` means the
 * console could not be reached and the caller may try again; everything else is final.
 */
export type RedrobDevicePollResult =
  | { status: "pending" }
  | { status: "slow_down" }
  | { status: "connected"; key: string }
  | { status: "denied" }
  | { status: "expired" }
  | { status: "unreachable" }
  | { status: "failed"; code: string };

interface PendingConnection {
  deviceCode: string;
  userCode: string;
  verificationUri: string;
  verificationUriComplete: string;
  expiresAt: number;
  intervalMs: number;
}

export interface RedrobDeviceConnectionsOptions {
  fetchImpl?: RedrobDeviceFetch;
  /** Overridable so the suites can answer as the console without reaching the network. */
  baseUrl?: string;
  now?: () => number;
  newId?: () => string;
}

export interface RedrobDeviceConnections {
  start(product?: string): Promise<RedrobDeviceConnectionStart>;
  poll(id: string): Promise<RedrobDevicePollResult>;
  cancel(id: string): boolean;
  /** Diagnostic only, for the suites. Never contains a device code. */
  pendingCount(): number;
}

/** Thrown when the console will not start a connection at all. */
export class RedrobDeviceStartError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = "RedrobDeviceStartError";
    this.code = code;
  }
}

function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function positiveNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) && value > 0
    ? value
    : null;
}

async function readJson(response: Response): Promise<Record<string, unknown>> {
  try {
    const body = (await response.json()) as unknown;
    return body && typeof body === "object" && !Array.isArray(body)
      ? (body as Record<string, unknown>)
      : {};
  } catch {
    return {};
  }
}

export function createRedrobDeviceConnections(
  options: RedrobDeviceConnectionsOptions = {},
): RedrobDeviceConnections {
  const fetchImpl: RedrobDeviceFetch =
    options.fetchImpl ?? ((input, init) => fetch(input, init));
  const baseUrl = (options.baseUrl ?? REDROB_CONSOLE_API_BASE).replace(
    /\/+$/,
    "",
  );
  // Through the app's TimeSource, so a replayed run's timestamps agree with each
  // other; the suites pass their own clock in.
  const now = options.now ?? (() => nowMs());
  const newId = options.newId ?? (() => randomUUID());

  const pending = new Map<string, PendingConnection>();

  function prune(): void {
    const at = now();
    for (const [id, record] of pending) {
      if (record.expiresAt <= at) pending.delete(id);
    }
  }

  async function start(
    product = REDROB_DEVICE_PRODUCT,
  ): Promise<RedrobDeviceConnectionStart> {
    prune();
    if (pending.size >= MAX_PENDING) {
      throw new RedrobDeviceStartError(
        "device_connect_busy",
        "Too many connection attempts are already waiting. Finish or cancel one first.",
      );
    }

    let response: Response;
    try {
      response = await fetchImpl(`${baseUrl}/device/authorize`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ product }),
      });
    } catch {
      throw new RedrobDeviceStartError(
        "console_unreachable",
        "Could not reach console.redrob.ai to start the connection.",
      );
    }

    if (!response.ok) {
      throw new RedrobDeviceStartError(
        "device_start_rejected",
        "console.redrob.ai would not start the connection.",
      );
    }

    const body = await readJson(response);
    const deviceCode = text(body.deviceCode);
    const userCode = text(body.userCode);
    const verificationUri = text(body.verificationUri);
    /**
     * The console sends the prefilled form as well, but it is only a convenience: if it is missing,
     * the bare page plus a typed code is the same flow, so this falls back rather than failing.
     */
    const verificationUriComplete =
      text(body.verificationUriComplete) || verificationUri;

    if (!deviceCode || !userCode || !verificationUri) {
      throw new RedrobDeviceStartError(
        "device_start_incomplete",
        "console.redrob.ai did not return a usable connection code.",
      );
    }

    const expiresInSeconds = positiveNumber(body.expiresIn);
    const intervalSeconds = positiveNumber(body.interval);
    const record: PendingConnection = {
      deviceCode,
      userCode,
      verificationUri,
      verificationUriComplete,
      expiresAt:
        now() + (expiresInSeconds ? expiresInSeconds * 1000 : FALLBACK_TTL_MS),
      intervalMs: intervalSeconds
        ? intervalSeconds * 1000
        : FALLBACK_INTERVAL_MS,
    };

    const id = newId();
    pending.set(id, record);

    return {
      id,
      userCode: record.userCode,
      verificationUri: record.verificationUri,
      verificationUriComplete: record.verificationUriComplete,
      expiresAt: record.expiresAt,
      intervalMs: record.intervalMs,
    };
  }

  async function poll(id: string): Promise<RedrobDevicePollResult> {
    const record = pending.get(id);
    /**
     * An id we are not holding is not an error worth a stack trace: it is a poll that arrived after
     * the key was collected, after a cancel, or after a restart. Saying "expired" tells the caller
     * to start again, which is the only useful thing it can do.
     */
    if (!record) return { status: "expired" };

    if (record.expiresAt <= now()) {
      pending.delete(id);
      return { status: "expired" };
    }

    let response: Response;
    try {
      response = await fetchImpl(`${baseUrl}/device/token`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ deviceCode: record.deviceCode }),
      });
    } catch {
      // Kept pending: a lost network is worth retrying, unlike a refusal.
      return { status: "unreachable" };
    }

    const body = await readJson(response);

    if (response.ok) {
      const key = text(body.apiKey);
      if (!key) {
        pending.delete(id);
        return { status: "failed", code: "missing_key" };
      }
      // Dropped before the key is handed back, so one approval can only ever be collected once.
      pending.delete(id);
      return { status: "connected", key };
    }

    const code = text(body.error);
    if (code === "authorization_pending") return { status: "pending" };
    if (code === "slow_down") return { status: "slow_down" };

    if (code === "access_denied") {
      pending.delete(id);
      return { status: "denied" };
    }
    if (code === "expired_token") {
      pending.delete(id);
      return { status: "expired" };
    }

    /**
     * Anything else, including invalid_grant and a console that answered with no code at all, is
     * final. Nothing here converts it into another attempt: the console has said this device code
     * will never produce a key, and polling on would only hide that.
     */
    pending.delete(id);
    return { status: "failed", code: code || `http_${response.status}` };
  }

  function cancel(id: string): boolean {
    return pending.delete(id);
  }

  return { start, poll, cancel, pendingCount: () => pending.size };
}

/** The app's one set of pending connections, shared by the IPC handlers. */
let shared: RedrobDeviceConnections | null = null;

export function redrobDeviceConnections(): RedrobDeviceConnections {
  shared ??= createRedrobDeviceConnections();
  return shared;
}

/** @internal for tests: forget the shared connections. */
export function __resetRedrobDeviceConnections(): void {
  shared = null;
}

/**
 * What a renderer is told about a poll. Same set of endings as
 * {@link RedrobDevicePollResult}, minus the key: on success the key has already
 * been stored, and what comes back is the state the rest of the app reads.
 */
export type RedrobDeviceConnectView<TSnapshot> =
  | { status: "pending" }
  | { status: "slowDown" }
  | { status: "connected"; setup: TSnapshot }
  | { status: "denied" }
  | { status: "expired" }
  | { status: "unreachable" }
  | { status: "failed"; code: string };

/**
 * One poll on behalf of a renderer: ask the console, and if it approved, store
 * the key here before answering.
 *
 * The store step is the reason this exists rather than the handler doing it
 * inline. A key that reached the renderer would be a key in a window, in a log,
 * and in whatever crash report the window ends up in; storing it on this side
 * means the only thing that crosses the bridge is the state afterwards.
 */
export async function collectRedrobDeviceConnect<TSnapshot>(
  connections: RedrobDeviceConnections,
  id: string,
  store: (key: string) => Promise<TSnapshot>,
): Promise<RedrobDeviceConnectView<TSnapshot>> {
  const trimmed = id.trim();
  if (!trimmed) return { status: "expired" };

  const result = await connections.poll(trimmed);
  if (result.status === "slow_down") return { status: "slowDown" };
  if (result.status !== "connected") return result;
  return { status: "connected", setup: await store(result.key) };
}
