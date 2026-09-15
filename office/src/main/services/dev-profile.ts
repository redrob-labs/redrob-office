import { join } from "node:path";

/**
 * Where this instance keeps its data, once dev isolation is taken into account.
 *
 * OpenWork runs each worktree against its own profile so two checkouts never
 * fight over one SQLite file, one keychain entry, or one running instance. Redrob
 * already honours `REDROB_OFFICE_USER_DATA` for the Floor demo; this adds an
 * opt-in `REDROB_DEV_PROFILE=<name>` that files a checkout under its own subtree
 * of the real userData dir, so `git worktree` copies do not collide and the
 * production profile is left untouched.
 *
 * Pure and total: an explicit override always wins, a blank/dangerous profile
 * name is ignored, and with neither set the real userData dir is returned as-is.
 */
export function resolveUserDataDir(
  userDataDir: string,
  env: { userDataOverride?: string | undefined; devProfile?: string | undefined },
): string {
  const override = env.userDataOverride?.trim();
  if (override) return override;
  const profile = sanitizeProfile(env.devProfile);
  if (!profile) return userDataDir;
  return join(userDataDir, "profiles", profile);
}

/** A profile name safe to use as one path segment, or null when unusable. */
export function sanitizeProfile(name: string | undefined): string | null {
  const trimmed = name?.trim().toLowerCase() ?? "";
  if (!trimmed) return null;
  const safe = trimmed.replace(/[^a-z0-9._-]+/g, "-").replace(/^-+|-+$/g, "");
  // No traversal, no hidden, and a real segment left after cleaning.
  if (!safe || safe === "." || safe === ".." || safe.startsWith(".")) return null;
  return safe.slice(0, 64);
}
