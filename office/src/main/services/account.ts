import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { nowIso } from "../app-time.js";
import type { AccountSnapshot } from "../../shared/office-api.js";

export interface AccountStateFile {
  email: string | null;
  accountId: string | null;
  signedInAt: string | null;
  /** Local session marker until a real auth backend is wired. */
  sessionToken: string | null;
  backup: {
    enabled: boolean;
    consentedAt: string | null;
  };
}

function defaultState(): AccountStateFile {
  return {
    email: null,
    accountId: null,
    signedInAt: null,
    sessionToken: null,
    backup: { enabled: false, consentedAt: null },
  };
}

export function accountStatePath(userData: string): string {
  return join(userData, "account.json");
}

export async function loadAccountState(userData: string): Promise<AccountStateFile> {
  try {
    const raw = await readFile(accountStatePath(userData), "utf8");
    const parsed = JSON.parse(raw) as Partial<AccountStateFile>;
    return {
      ...defaultState(),
      ...parsed,
      backup: {
        enabled: Boolean(parsed.backup?.enabled),
        consentedAt: parsed.backup?.consentedAt ?? null,
      },
    };
  } catch {
    return defaultState();
  }
}

export async function saveAccountState(
  userData: string,
  state: AccountStateFile,
): Promise<void> {
  await mkdir(userData, { recursive: true });
  await writeFile(accountStatePath(userData), `${JSON.stringify(state, null, 2)}\n`, "utf8");
}

function toSnapshot(state: AccountStateFile): AccountSnapshot {
  const signedIn = Boolean(state.sessionToken && state.email);
  return {
    signedIn,
    email: signedIn ? state.email : null,
    accountId: signedIn ? state.accountId : null,
    signedInAt: signedIn ? state.signedInAt : null,
    backupEnabled: signedIn ? state.backup.enabled : false,
    backupConsentedAt: signedIn ? state.backup.consentedAt : null,
  };
}

export async function getAccountSnapshot(userData: string): Promise<AccountSnapshot> {
  return toSnapshot(await loadAccountState(userData));
}

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

/** Local sign-in for backup — swaps to real OAuth/magic-link later. */
export async function signInForBackup(
  userData: string,
  emailInput: string,
): Promise<AccountSnapshot> {
  const email = normalizeEmail(emailInput);
  if (!isValidEmail(email)) {
    throw new Error("Enter a valid email address");
  }
  const prev = await loadAccountState(userData);
  const state: AccountStateFile = {
    email,
    accountId: prev.accountId && prev.email === email ? prev.accountId : randomUUID(),
    signedInAt: nowIso(),
    sessionToken: randomUUID(),
    backup: prev.email === email ? prev.backup : { enabled: false, consentedAt: null },
  };
  await saveAccountState(userData, state);
  return toSnapshot(state);
}

export async function signOutAccount(userData: string): Promise<AccountSnapshot> {
  const prev = await loadAccountState(userData);
  const state: AccountStateFile = {
    ...prev,
    signedInAt: null,
    sessionToken: null,
    backup: { ...prev.backup, enabled: false },
  };
  await saveAccountState(userData, state);
  return toSnapshot(state);
}

export async function setBackupOptIn(
  userData: string,
  enabled: boolean,
): Promise<AccountSnapshot> {
  const state = await loadAccountState(userData);
  if (!state.sessionToken || !state.email) {
    throw new Error("Sign in before enabling backup");
  }
  if (enabled) {
    state.backup = {
      enabled: true,
      consentedAt: state.backup.consentedAt ?? nowIso(),
    };
  } else {
    state.backup = {
      enabled: false,
      consentedAt: state.backup.consentedAt,
    };
  }
  await saveAccountState(userData, state);
  return toSnapshot(state);
}
