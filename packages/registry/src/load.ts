import { readdirSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parse } from "yaml";
import {
  validateRubric,
  validateSchema,
  validateTemplate,
  type RubricDefinition,
  type SchemaDefinition,
  type TemplateDefinition,
} from "./validate.js";
import { loadUserRubric } from "./user-rubrics.js";

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");

function read(kind: "schemas" | "rubrics" | "templates", id: string): unknown {
  if (!/^[a-z]+\/[a-z0-9.-]+$/.test(id)) throw new Error(`invalid registry id: ${id}`);
  const path = join(packageRoot, kind, `${id}.v1.yaml`);
  return parse(readFileSync(path, "utf8"));
}

/** Packaged schema ids (`workspace/name`) — no version suffix. */
export function listSchemaIds(): string[] {
  return listKindIds("schemas");
}

/** Packaged rubric ids (`workspace/name`) — no version suffix. */
export function listRubricIds(): string[] {
  return listKindIds("rubrics");
}

/** Packaged template ids (`workspace/name`) — no version suffix. */
export function listTemplateIds(): string[] {
  return listKindIds("templates");
}

function listKindIds(kind: "schemas" | "rubrics" | "templates"): string[] {
  const root = join(packageRoot, kind);
  const out: string[] = [];
  for (const workspace of readdirSync(root, { withFileTypes: true })) {
    if (!workspace.isDirectory()) continue;
    for (const file of readdirSync(join(root, workspace.name))) {
      const m = /^([a-z0-9.-]+)\.v1\.yaml$/.exec(file);
      if (m) out.push(`${workspace.name}/${m[1]}`);
    }
  }
  return out.sort();
}

export function loadSchema(id: string): SchemaDefinition {
  return validateSchema(read("schemas", id));
}

export function loadRubric(id: string): RubricDefinition {
  const user = loadUserRubric(id);
  if (user) return user;
  return validateRubric(read("rubrics", id));
}

export function loadTemplate(id: string): TemplateDefinition {
  return validateTemplate(read("templates", id));
}
