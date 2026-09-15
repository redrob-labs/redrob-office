import { lstatSync, realpathSync, existsSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { dirname, isAbsolute, join, normalize, resolve, sep } from "node:path";

const WINDOWS = process.platform === "win32";

function norm(p: string): string {
  const resolved = resolve(p);
  return WINDOWS ? resolved.toLowerCase() : resolved;
}

function withSep(p: string): string {
  return p.endsWith(sep) ? p : p + sep;
}

/**
 * Resolve symlinks for the path and every ancestor that exists.
 * Falls back to normalize+resolve when a segment does not exist yet (write targets).
 */
export function resolveRealPath(targetPath: string): string {
  const absolute = resolve(normalize(targetPath));
  try {
    if (existsSync(absolute)) {
      return realpathSync(absolute);
    }
  } catch {
    // continue with ancestor walk
  }

  // Walk up to an existing ancestor, realpath it, then rejoin the missing suffix.
  let cur = absolute;
  const missing: string[] = [];
  while (cur && cur !== dirname(cur)) {
    try {
      if (existsSync(cur)) {
        const real = realpathSync(cur);
        return missing.length ? join(real, ...missing.reverse()) : real;
      }
    } catch {
      // keep walking
    }
    missing.push(cur.slice(dirname(cur).length).replace(/^[\\/]/, ""));
    const parent = dirname(cur);
    if (parent === cur) break;
    cur = parent;
  }
  return absolute;
}

/** Hard denylist — always applied, elevated cannot bypass. */
export function hardDenylistRoots(): string[] {
  const home = homedir();
  const roots: string[] = [
    resolve("/"),
    "/etc",
    "/proc",
    "/sys",
    "/dev",
    "/root",
    "/boot",
    "/var/run/docker.sock",
    "/run/docker.sock",
    resolve(home, ".ssh"),
    resolve(home, ".aws"),
    resolve(home, ".gnupg"),
    resolve(home, ".netrc"),
    resolve(home, ".docker"),
    resolve(home, ".npm"),
    resolve(home, ".config"),
  ];

  if (WINDOWS) {
    roots.push(
      "C:\\Windows",
      "C:\\Program Files",
      "C:\\Program Files (x86)",
      "C:\\ProgramData",
      "\\\\.\\pipe\\docker_engine",
      resolve(home, "AppData", "Roaming", "Microsoft", "Credentials"),
      resolve(home, "AppData", "Local", "Microsoft", "Credentials"),
      resolve(home, "AppData", "Roaming", "docker"),
      resolve(home, ".docker"),
    );
    for (const letter of "CDEFGHIJ") {
      roots.push(`${letter}:\\`);
    }
  } else {
    roots.push("/usr", "/bin", "/sbin", "/System", "/Library");
  }

  // Exact home / tmp roots stay blocked as allowlist entries.
  roots.push(home, tmpdir());
  return [...new Set(roots.map(norm))];
}

/** @deprecated Use hardDenylistRoots — kept for older imports. */
export function blockedRoots(): string[] {
  return hardDenylistRoots();
}

function isDeniedPath(target: string): boolean {
  const n = norm(target);
  const nSep = withSep(n);
  const denylist = hardDenylistRoots();

  for (const blocked of denylist) {
    if (n === blocked) return true;
    // For sensitive home subdirs and system roots, also block descendants.
    const blockDescendants =
      blocked.includes(`${sep}.ssh`) ||
      blocked.includes(`${sep}.aws`) ||
      blocked.includes(`${sep}.gnupg`) ||
      blocked.includes(`${sep}.netrc`) ||
      blocked.includes(`${sep}.docker`) ||
      blocked.includes(`${sep}.npm`) ||
      blocked.includes(`${sep}.config`) ||
      blocked.includes("credentials") ||
      blocked.endsWith("docker.sock") ||
      blocked === norm("/etc") ||
      blocked === norm("/proc") ||
      blocked === norm("/sys") ||
      blocked === norm("/dev") ||
      blocked === norm("/root") ||
      blocked === norm("/boot") ||
      blocked === norm("C:\\Windows") ||
      blocked === norm("C:\\Program Files") ||
      blocked === norm("C:\\Program Files (x86)") ||
      blocked === norm("C:\\ProgramData");

    if (blockDescendants && nSep.startsWith(withSep(blocked))) return true;
  }

  // Substring denylist for credential dirs (covers symlink renames under allow roots).
  const forbiddenFrags = WINDOWS
    ? [
        `${sep}.ssh${sep}`,
        `${sep}.aws${sep}`,
        `${sep}.gnupg${sep}`,
        `${sep}.netrc`,
        `${sep}.docker${sep}`,
        `${sep}.npm${sep}`,
        `${sep}appdata${sep}roaming${sep}microsoft${sep}credentials`,
        `${sep}appdata${sep}local${sep}microsoft${sep}credentials`,
      ]
    : [
        `${sep}.ssh${sep}`,
        `${sep}.aws${sep}`,
        `${sep}.gnupg${sep}`,
        `${sep}.netrc`,
        `${sep}.docker${sep}`,
        `${sep}.npm${sep}`,
        `${sep}.config${sep}`,
        `${sep}etc${sep}`,
        `${sep}proc${sep}`,
        `${sep}sys${sep}`,
      ];
  for (const frag of forbiddenFrags) {
    if (nSep.includes(frag) || n.endsWith(frag.replace(/[\\/]+$/g, ""))) return true;
  }
  return false;
}

/**
 * True when `target` is exactly a blocked root (home, drive root, system dir)
 * that must not be registered as an allowlist entry.
 */
export function isBlockedExactRoot(targetPath: string): boolean {
  const n = norm(resolveRealPath(targetPath));
  const home = norm(homedir());
  const tmp = norm(tmpdir());
  if (n === home || n === tmp || n === norm(resolve("/"))) return true;
  if (WINDOWS) {
    if (/^[a-z]:\\$/i.test(n)) return true;
    if (n === norm("C:\\Windows") || n === norm("C:\\ProgramData")) return true;
  } else {
    if (
      [
        "/etc",
        "/proc",
        "/sys",
        "/dev",
        "/root",
        "/boot",
        "/usr",
        "/bin",
        "/sbin",
      ].map(norm).includes(n)
    ) {
      return true;
    }
  }
  return isDeniedPath(n) && hardDenylistRoots().includes(n);
}

export function isHardDenied(targetPath: string): boolean {
  try {
    const real = resolveRealPath(targetPath);
    return isDeniedPath(real);
  } catch {
    return isDeniedPath(resolve(normalize(targetPath)));
  }
}

export function isUnderAllowed(targetPath: string, allowedPaths: string[]): boolean {
  let target: string;
  try {
    target = norm(resolveRealPath(targetPath));
  } catch {
    target = norm(resolve(normalize(targetPath)));
  }

  if (isDeniedPath(target)) return false;
  if (isBlockedExactRoot(target)) return false;

  for (const raw of allowedPaths) {
    let allow: string;
    try {
      allow = norm(resolveRealPath(raw));
    } catch {
      allow = norm(resolve(normalize(raw)));
    }
    if (!allow) continue;
    if (target === allow) return true;
    if (target.startsWith(withSep(allow))) return true;
  }
  return false;
}

export function assertAllowedPath(
  targetPath: string,
  allowedPaths: string[],
  label = "path",
): string {
  const absolute = resolveRealPath(targetPath);
  if (isHardDenied(absolute)) {
    throw new Error(`Access denied: ${label} hits hard denylist (${absolute})`);
  }
  if (!isUnderAllowed(absolute, allowedPaths)) {
    throw new Error(
      `Access denied: ${label} is outside allowed folders (${absolute})`,
    );
  }
  // Re-check after realpath of allow roots (symlink escape).
  if (!isUnderAllowed(absolute, allowedPaths.map((p) => resolveRealPath(p)))) {
    throw new Error(
      `Access denied: ${label} escaped allowlist via symlink (${absolute})`,
    );
  }
  return absolute;
}

export function assertAllowedPathEntry(candidate: string): string {
  const absolute = resolveRealPath(candidate);
  if (isBlockedExactRoot(absolute) || isHardDenied(absolute)) {
    throw new Error(`Cannot allow blocked system path: ${absolute}`);
  }
  // Refuse allowing the literal home directory.
  if (norm(absolute) === norm(homedir())) {
    throw new Error(`Cannot allow blocked system path: ${absolute}`);
  }
  return absolute;
}

/** Detect if path looks like a symlink at any existing prefix. */
export function pathContainsSymlink(targetPath: string): boolean {
  let cur = resolve(normalize(targetPath));
  while (cur && cur !== dirname(cur)) {
    try {
      if (existsSync(cur) && lstatSync(cur).isSymbolicLink()) return true;
    } catch {
      // ignore
    }
    const parent = dirname(cur);
    if (parent === cur) break;
    cur = parent;
  }
  return false;
}
