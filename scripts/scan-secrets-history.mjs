/*
 * Copyright 2026 Redrob
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

/**
 * Credential scan across every blob in git history, for open-source release.
 *
 *   node scripts/scan-secrets-history.mjs
 *
 * Reports the pattern class, the commit, and the path. It never prints the
 * matched value: the point is to locate exposure, and echoing a live credential
 * into a terminal or CI log would widen it.
 *
 * This only reports. Rewriting history is a separate, deliberate decision.
 */

import { execFileSync } from "node:child_process";
import { writeFileSync } from "node:fs";

const OUT_FILE = "secret-scan-report.json";

/** Ordered so specific vendor patterns win before the generic ones. */
const PATTERNS = [
  { name: "HUGGINGFACE_TOKEN", re: /hf_[A-Za-z0-9]{30,}/g },
  { name: "OPENAI_STYLE_KEY", re: /sk-[A-Za-z0-9_-]{20,}/g },
  { name: "OPENROUTER_KEY", re: /sk-or-[A-Za-z0-9_-]{20,}/g },
  { name: "GITHUB_PAT", re: /gh[pousr]_[A-Za-z0-9]{20,}/g },
  { name: "GITHUB_FINE_PAT", re: /github_pat_[A-Za-z0-9_]{30,}/g },
  { name: "AWS_ACCESS_KEY", re: /AKIA[0-9A-Z]{16}/g },
  { name: "SLACK_TOKEN", re: /xox[baprs]-[A-Za-z0-9-]{10,}/g },
  { name: "GOOGLE_API_KEY", re: /AIza[0-9A-Za-z_-]{35}/g },
  { name: "PRIVATE_KEY_BLOCK", re: /-----BEGIN [A-Z ]*PRIVATE KEY-----/g },
  { name: "CIVITAI_REFERENCE", re: /civitai/gi },
  { name: "GENERIC_BEARER_LITERAL", re: /Bearer\s+[A-Za-z0-9_\-.]{24,}/g },
  {
    name: "ASSIGNED_SECRET_LITERAL",
    // key = "value" with a long opaque value; skips ${...} and process.env reads.
    re: /(?:api[_-]?key|apikey|secret|password|passwd|token)\s*[:=]\s*["'][A-Za-z0-9_\-./+]{24,}["']/gi,
  },
];

/** Paths whose matches are expected and not exposure. */
const IGNORED_PATHS = [/^pnpm-lock\.yaml$/, /^yarn\.lock$/, /^package-lock\.json$/];

/** Values that are obviously fixtures rather than live credentials. */
const FIXTURE_HINTS = [/test/i, /example/i, /dummy/i, /fake/i, /placeholder/i, /xxxx/i, /CHANGE_ME/];

function git(args) {
  return execFileSync("git", args, { encoding: "utf8", maxBuffer: 512 * 1024 * 1024 });
}

function gitBuffer(args) {
  return execFileSync("git", args, { encoding: "buffer", maxBuffer: 512 * 1024 * 1024 });
}

function redact(value) {
  if (value.length <= 8) return `<${value.length} chars>`;
  return `${value.slice(0, 4)}…${value.slice(-2)} <${value.length} chars>`;
}

function isBinary(buf) {
  const probe = buf.subarray(0, 8000);
  return probe.includes(0);
}

function main() {
  console.log("scanning every blob reachable from every ref\n");

  const objects = git(["rev-list", "--objects", "--all"])
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const sp = line.indexOf(" ");
      return sp === -1
        ? { sha: line, path: "" }
        : { sha: line.slice(0, sp), path: line.slice(sp + 1) };
    })
    .filter((entry) => entry.path && !IGNORED_PATHS.some((re) => re.test(entry.path)));

  // Map blob -> the commits that introduced it, so findings are actionable.
  const findings = [];
  let scanned = 0;

  for (const { sha, path } of objects) {
    let type;
    try {
      type = git(["cat-file", "-t", sha]).trim();
    } catch {
      continue;
    }
    if (type !== "blob") continue;

    let buf;
    try {
      buf = gitBuffer(["cat-file", "-p", sha]);
    } catch {
      continue;
    }
    if (isBinary(buf)) continue;
    scanned += 1;
    const text = buf.toString("utf8");

    for (const { name, re } of PATTERNS) {
      re.lastIndex = 0;
      const matches = [...text.matchAll(re)];
      if (matches.length === 0) continue;
      const sample = matches[0][0];
      findings.push({
        pattern: name,
        path,
        blob: sha.slice(0, 12),
        count: matches.length,
        redacted: redact(sample),
        likelyFixture: FIXTURE_HINTS.some((hint) => hint.test(sample)),
      });
    }
  }

  console.log(`scanned ${scanned} text blobs across ${git(["rev-list", "--all", "--count"]).trim()} commits\n`);

  if (findings.length === 0) {
    console.log("no credential patterns found in history");
  } else {
    const live = findings.filter((f) => !f.likelyFixture);
    const fixtures = findings.filter((f) => f.likelyFixture);

    if (live.length > 0) {
      console.log(`REVIEW REQUIRED (${live.length}):`);
      for (const f of live) {
        console.log(`  ${f.pattern.padEnd(24)} ${f.path}  [blob ${f.blob}] x${f.count}  ${f.redacted}`);
      }
    }
    if (fixtures.length > 0) {
      console.log(`\nlikely fixtures (${fixtures.length}):`);
      for (const f of fixtures) {
        console.log(`  ${f.pattern.padEnd(24)} ${f.path}  [blob ${f.blob}] x${f.count}  ${f.redacted}`);
      }
    }
  }

  writeFileSync(OUT_FILE, JSON.stringify({ at: new Date().toISOString(), findings }, null, 2));
  console.log(`\nwrote ${OUT_FILE}`);
  console.log("This script reports only. History rewriting is a separate decision.");
}

main();
