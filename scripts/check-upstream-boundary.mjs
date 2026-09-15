#!/usr/bin/env node
/**
 * Fork boundary guard.
 *
 * A fork's licence obligations are the part of it that rots silently: a rebrand
 * sweep, a file move or a well-meant "clean up the headers" commit can delete an
 * upstream copyright notice without breaking a single test. This script fails the
 * build instead, and it reads `upstream-base.json` rather than hard-coding names,
 * so the pin file stays the one place the fork's provenance is written down.
 *
 * Checks:
 *   1. `upstream-base.json` parses and records an upstream remote and a base commit.
 *   2. Every file listed under `attribution` exists and still contains every string
 *      it must contain - upstream's holder as well as ours. Add your line, never
 *      replace theirs.
 *   3. No tracked file sits under an `excludedPrefixes` entry (an upstream tree we
 *      deliberately do not ship), checked against the committed tree AND the index,
 *      so a staged file cannot slip through.
 *   4. `excludedReason` is stated, so an empty exclusion list is a decision on the
 *      record rather than an oversight.
 *
 * Usage: node scripts/check-upstream-boundary.mjs
 */
import { execFileSync } from "node:child_process";
import { readFileSync, existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const pinPath = resolve(repoRoot, "upstream-base.json");
const violations = [];

function fail(message) {
  violations.push(message);
}

function git(...args) {
  return execFileSync("git", args, { cwd: repoRoot, encoding: "utf8" });
}

function readPin() {
  if (!existsSync(pinPath)) {
    fail("upstream-base.json is missing: the fork has no recorded provenance.");
    return null;
  }
  try {
    return JSON.parse(readFileSync(pinPath, "utf8"));
  } catch (error) {
    fail(`upstream-base.json does not parse: ${error.message}`);
    return null;
  }
}

function checkPin(pin) {
  if (!pin.upstream?.remote) fail("upstream-base.json: upstream.remote is not set.");
  if (!pin.upstream?.defaultBranch) fail("upstream-base.json: upstream.defaultBranch is not set.");
  if (!pin.base?.commit) fail("upstream-base.json: base.commit is not set, so drift cannot be measured.");
  if (typeof pin.excludedReason !== "string" || pin.excludedReason.trim() === "") {
    fail("upstream-base.json: excludedReason must say why excludedPrefixes is what it is.");
  }
}

function checkAttribution(pin) {
  const entries = Array.isArray(pin.attribution) ? pin.attribution : [];
  if (entries.length === 0) {
    fail("upstream-base.json: attribution is empty, so nothing keeps the upstream notice alive.");
    return;
  }
  for (const entry of entries) {
    const path = resolve(repoRoot, entry.path);
    if (!existsSync(path)) {
      fail(`${entry.path} is missing: it carries the licence notice this fork must keep.`);
      continue;
    }
    const text = readFileSync(path, "utf8");
    for (const needle of entry.mustContain ?? []) {
      if (!text.includes(needle)) {
        fail(`${entry.path} no longer contains "${needle}". ${entry.why ?? ""}`.trim());
      }
    }
  }
}

function checkExcludedPrefixes(pin) {
  const prefixes = Array.isArray(pin.excludedPrefixes) ? pin.excludedPrefixes : [];
  if (prefixes.length === 0) return;

  const committed = git("ls-tree", "-r", "--name-only", "HEAD").split("\n");
  const staged = git("ls-files").split("\n");
  const tracked = new Set([...committed, ...staged].filter(Boolean));

  for (const prefix of prefixes) {
    const hits = [...tracked].filter((path) => path === prefix || path.startsWith(prefix));
    if (hits.length > 0) {
      fail(
        `${hits.length} tracked file(s) under the excluded upstream tree "${prefix}": ` +
          `${hits.slice(0, 5).join(", ")}${hits.length > 5 ? ", ..." : ""}`
      );
    }
  }
}

const pin = readPin();
if (pin) {
  checkPin(pin);
  checkAttribution(pin);
  checkExcludedPrefixes(pin);
}

if (violations.length > 0) {
  console.error("Fork boundary violations:\n");
  for (const violation of violations) console.error(`  - ${violation}`);
  const doc = pin?.doc ?? "UPSTREAM.md";
  console.error(`\nSee ${doc} for what this guard protects and why.`);
  process.exit(1);
}

process.stdout.write("Fork boundary intact: provenance recorded, upstream attribution present.\n");
