#!/usr/bin/env node
/**
 * Self-audit for computer-agent security settings.
 *
 * Usage:
 *   npm run audit:security
 *   npm run audit:security -- --fix
 *   npm run audit:security -- --config path/to/computer-agent.json
 */
import { chmodSync, existsSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "..");

const args = process.argv.slice(2);
const fix = args.includes("--fix");
const configIdx = args.indexOf("--config");
const configPath =
  configIdx >= 0 && args[configIdx + 1]
    ? resolve(args[configIdx + 1])
    : resolve(
        process.env.REDROB_USER_DATA ||
          join(homedir(), "AppData", "Roaming", "redrob-office"),
        "computer-agent.json",
      );

/** @typedef {{ checkId: string; severity: 'high'|'medium'|'low'; message: string; fixable: boolean }} Finding */

/** @type {Finding[]} */
const findings = [];

function loadConfig() {
  if (!existsSync(configPath)) {
    return {
      allowedPaths: [],
      profile: "readonly",
      execSecurity: "allowlist",
      execAsk: "always",
      execAllowlist: [],
      sandboxMode: "workspace",
      elevatedEnabled: false,
      readerAgent: false,
      _missing: true,
    };
  }
  try {
    return JSON.parse(readFileSync(configPath, "utf8"));
  } catch (err) {
    findings.push({
      checkId: "config.parse",
      severity: "high",
      message: `Cannot parse ${configPath}: ${err instanceof Error ? err.message : String(err)}`,
      fixable: false,
    });
    return null;
  }
}

function checkMode(config) {
  if (!config || config._missing) {
    findings.push({
      checkId: "config.missing",
      severity: "low",
      message: `No computer-agent.json at ${configPath} (defaults will apply at runtime)`,
      fixable: false,
    });
    return;
  }

  if (config.sandboxMode === "off" && config.profile !== "full") {
    findings.push({
      checkId: "sandbox.off_without_full",
      severity: "high",
      message: `sandboxMode is off while profile is "${config.profile}" — sandbox effectively disabled without full profile`,
      fixable: true,
    });
  }

  if (config.elevatedEnabled && config.execAsk === "off") {
    findings.push({
      checkId: "elevated.ask_off",
      severity: "high",
      message: "elevatedEnabled=true with execAsk=off — elevated calls could skip prompts",
      fixable: true,
    });
  }

  const home = resolve(homedir()).toLowerCase();
  for (const p of config.allowedPaths || []) {
    if (typeof p !== "string") continue;
    if (resolve(p).toLowerCase() === home) {
      findings.push({
        checkId: "allowlist.home_root",
        severity: "high",
        message: `Allowed path includes home directory root: ${p}`,
        fixable: true,
      });
    }
  }

  if (config.profile === "full" && config.execSecurity === "full" && config.execAsk === "off") {
    findings.push({
      checkId: "policy.full_open",
      severity: "medium",
      message: "profile=full + execSecurity=full + execAsk=off is a high-risk combination",
      fixable: false,
    });
  }
}

function checkFileModes() {
  if (process.platform === "win32") return;
  const sensitive = [
    configPath,
    join(homedir(), ".ssh"),
    join(homedir(), ".aws", "credentials"),
    join(homedir(), ".netrc"),
  ];
  for (const file of sensitive) {
    if (!existsSync(file)) continue;
    try {
      const mode = statSync(file).mode & 0o777;
      const isDir = statSync(file).isDirectory();
      const ok = isDir ? mode === 0o700 : mode === 0o600 || mode === 0o700;
      if (!ok) {
        findings.push({
          checkId: "perms.sensitive_mode",
          severity: "medium",
          message: `${file} mode is ${mode.toString(8)} (want ${isDir ? "700" : "600/700"})`,
          fixable: true,
        });
      }
    } catch {
      // ignore
    }
  }
}

function applyFixes(config) {
  if (!config || config._missing) return config;
  let changed = false;
  if (config.sandboxMode === "off" && config.profile !== "full") {
    config.sandboxMode = "workspace";
    changed = true;
  }
  if (config.elevatedEnabled && config.execAsk === "off") {
    config.execAsk = "always";
    changed = true;
  }
  const home = resolve(homedir()).toLowerCase();
  if (Array.isArray(config.allowedPaths)) {
    const next = config.allowedPaths.filter(
      (p) => typeof p === "string" && resolve(p).toLowerCase() !== home,
    );
    if (next.length !== config.allowedPaths.length) {
      config.allowedPaths = next;
      changed = true;
    }
  }
  if (changed && !config._missing) {
    writeFileSync(configPath, `${JSON.stringify(config, null, 2)}\n`, "utf8");
    console.log(`Wrote fixes to ${configPath}`);
  }
  if (process.platform !== "win32") {
    for (const file of [configPath, join(homedir(), ".netrc")]) {
      if (!existsSync(file) || statSync(file).isDirectory()) continue;
      try {
        chmodSync(file, 0o600);
      } catch {
        // ignore
      }
    }
  }
  return config;
}

const config = loadConfig();
if (config) checkMode(config);
checkFileModes();

if (fix && config) applyFixes(config);

if (findings.length === 0) {
  console.log("audit:security — no findings");
  process.exit(0);
}

console.log(`audit:security — ${findings.length} finding(s)\n`);
for (const f of findings) {
  console.log(`[${f.severity}] ${f.checkId}`);
  console.log(`  ${f.message}${f.fixable ? " (fixable)" : ""}`);
}
process.exit(findings.some((f) => f.severity === "high") ? 2 : 1);
