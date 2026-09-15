import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { parse as parseYaml, stringify } from "yaml";
import { validateRubric, type RubricDefinition } from "./validate.js";

let userRubricsDir: string | null = null;

export function setUserRubricsDir(directory: string | null): void {
  userRubricsDir = directory;
}

export function getUserRubricsDir(): string | null {
  return userRubricsDir;
}

function userRubricPath(id: string): string {
  if (!userRubricsDir) throw new Error("User rubrics directory is not configured.");
  if (!/^[a-z]+\/[a-z0-9.-]+$/.test(id)) throw new Error(`invalid registry id: ${id}`);
  const path = join(userRubricsDir, `${id}.v1.yaml`);
  mkdirSync(dirname(path), { recursive: true });
  return path;
}

export function loadUserRubric(id: string): RubricDefinition | null {
  if (!userRubricsDir) return null;
  if (!/^[a-z]+\/[a-z0-9.-]+$/.test(id)) return null;
  const path = join(userRubricsDir, `${id}.v1.yaml`);
  if (!existsSync(path)) return null;
  return validateRubric(parseYaml(readFileSync(path, "utf8")));
}

export function saveUserRubric(rubric: RubricDefinition): string {
  const validated = validateRubric(rubric);
  const path = userRubricPath(validated.id);
  const document = {
    id: validated.id,
    version: validated.version,
    axes: validated.axes.map((axis) => ({
      id: axis.id,
      label: axis.label,
      range: [...axis.range],
      guidance: axis.guidance,
    })),
    rules: validated.rules.map((rule) => ({
      id: rule.id,
      kind: rule.kind,
      severity: rule.severity,
      ...(rule.implementation ? { implementation: rule.implementation } : {}),
      ...(rule.prompt ? { prompt: rule.prompt } : {}),
    })),
  };
  writeFileSync(path, `${stringify(document)}\n`, "utf8");
  return path;
}

export function listUserRubricIds(): string[] {
  if (!userRubricsDir || !existsSync(userRubricsDir)) return [];
  const ids: string[] = [];

  function walk(dir: string, prefix: string): void {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(full, prefix ? `${prefix}/${entry.name}` : entry.name);
        continue;
      }
      const match = entry.name.match(/^([a-z0-9.-]+)\.v1\.yaml$/);
      if (!match || !entry.isFile()) continue;
      const suffix = match[1];
      if (!suffix) continue;
      const id = prefix ? `${prefix}/${suffix}` : suffix;
      if (/^[a-z]+\/[a-z0-9.-]+$/.test(id)) ids.push(id);
    }
  }

  walk(userRubricsDir, "");
  return ids.sort();
}
