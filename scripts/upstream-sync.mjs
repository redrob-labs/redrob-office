#!/usr/bin/env node
/**
 * Upstream sync tooling.
 *
 * This fork has no shared ancestry with upstream (see upstream-base.json), so
 * "sync" cannot mean `git merge upstream/main`. It means: read what upstream did
 * since the commit we were measured against, decide file by file what to take,
 * and record the commit we stopped at. This script does the reading part - it
 * never writes to the working tree, so there is no half-applied state to undo.
 *
 *   node scripts/upstream-sync.mjs setup   # add or repoint the upstream remote
 *   node scripts/upstream-sync.mjs fetch   # fetch upstream (network)
 *   node scripts/upstream-sync.mjs report  # commits we have not taken yet
 *   node scripts/upstream-sync.mjs files   # paths those commits touch that we also ship
 *
 * After taking anything: run `node scripts/check-upstream-boundary.mjs`, and set
 * `lastSyncedUpstream` in upstream-base.json to the upstream commit you stopped at.
 */
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const pin = JSON.parse(readFileSync(resolve(repoRoot, "upstream-base.json"), "utf8"));
const remoteName = pin.upstream.remoteName ?? "upstream";
const branch = pin.upstream.defaultBranch;
const since = pin.lastSyncedUpstream ?? pin.base.commit;

// `files` prints a long list, and piping it into head or less closes stdout early.
// Without this, node turns that into an unhandled EPIPE and a stack trace that looks
// like the script failed when it did exactly what was asked.
process.stdout.on("error", (error) => {
  if (error.code === "EPIPE") process.exit(0);
  throw error;
});

function git(args, { allowFailure = false } = {}) {
  try {
    return execFileSync("git", args, {
      cwd: repoRoot,
      encoding: "utf8",
      // A probe for a ref that may legitimately not exist yet is not an error worth
      // printing; the caller turns it into a sentence the reader can act on.
      stdio: allowFailure ? ["ignore", "pipe", "ignore"] : ["ignore", "pipe", "inherit"],
    }).trim();
  } catch (error) {
    if (allowFailure) return null;
    throw error;
  }
}

function setup() {
  const existing = git(["remote", "get-url", remoteName], { allowFailure: true });
  if (existing === pin.upstream.remote) {
    process.stdout.write(`${remoteName} already points at ${pin.upstream.remote}\n`);
    return;
  }
  if (existing === null) {
    git(["remote", "add", remoteName, pin.upstream.remote]);
    process.stdout.write(`added ${remoteName} -> ${pin.upstream.remote}\n`);
    return;
  }
  git(["remote", "set-url", remoteName, pin.upstream.remote]);
  process.stdout.write(`repointed ${remoteName}: ${existing} -> ${pin.upstream.remote}\n`);
}

function fetch() {
  setup();
  execFileSync("git", ["fetch", remoteName, branch, "--tags"], { cwd: repoRoot, stdio: "inherit" });
}

function requireFetched() {
  const head = git(["rev-parse", "--verify", `refs/remotes/${remoteName}/${branch}`], {
    allowFailure: true,
  });
  if (!head) {
    console.error(`${remoteName}/${branch} is not fetched. Run: node scripts/upstream-sync.mjs fetch`);
    process.exit(1);
  }
  return head;
}

function report() {
  const head = requireFetched();
  const log = git(["log", "--oneline", "--no-merges", `${since}..${head}`]);
  const count = log ? log.split("\n").length : 0;
  process.stdout.write(`upstream ${remoteName}/${branch} @ ${head.slice(0, 9)}\n`);
  process.stdout.write(`comparing from ${since.slice(0, 9)} (${pin.lastSyncedUpstream ? "last synced" : "measured base"})\n`);
  process.stdout.write(`${count} commit(s) not taken yet\n\n`);
  process.stdout.write(`${log}\n`);
}

function files() {
  const head = requireFetched();
  const touched = git(["diff", "--name-only", `${since}..${head}`]).split("\n").filter(Boolean);
  const ours = new Set(git(["ls-files"]).split("\n").filter(Boolean));
  const shared = touched.filter((path) => ours.has(path));

  process.stdout.write(`${touched.length} upstream path(s) changed; ${shared.length} of them exist here too.\n\n`);
  for (const path of shared) process.stdout.write(`${path}\n`);
  if (shared.length < touched.length) {
    process.stdout.write(
      `\n${touched.length - shared.length} upstream path(s) have no counterpart at the same path here.` +
        " The port renamed directories, so check those by hand rather than assuming they are new.\n"
    );
  }
}

const commands = { setup, fetch, report, files };
const command = process.argv[2];
if (!command || !(command in commands)) {
  console.error(`usage: node scripts/upstream-sync.mjs <${Object.keys(commands).join("|")}>`);
  process.exit(1);
}
commands[command]();
