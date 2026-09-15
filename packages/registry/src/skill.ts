import { parse as parseYaml } from "yaml";
import { loadRubric, loadSchema, loadTemplate } from "./load.js";
import {
  listUserRubricIds,
  loadUserRubric,
  saveUserRubric,
} from "./user-rubrics.js";
import {
  listUserWorkflowIds,
  loadUserWorkflow,
  saveUserWorkflow,
  validateWorkflow,
  type WorkflowDefinition,
  type WorkflowEngine,
  type WorkflowStep,
} from "./user-workflows.js";
import { validateRubric, type RubricDefinition } from "./validate.js";

export const REDROB_SKILL_FORMAT = "redrob.skill" as const;
export const REDROB_SKILL_FORMAT_VERSION = 1 as const;

export interface SkillManifest {
  id: string;
  title: string;
  description: string;
  workspaceId: string;
  author?: string;
  createdAt: string;
}

export interface RedrobSkill {
  format: typeof REDROB_SKILL_FORMAT;
  formatVersion: typeof REDROB_SKILL_FORMAT_VERSION;
  deskMinVersion?: string;
  manifest: SkillManifest;
  workflow: WorkflowDefinition;
  rubrics: RubricDefinition[];
}

export type SkillCollisionPolicy = "rename" | "skip";

export interface UnpackSkillResult {
  workflowId: string;
  workflowTitle: string;
  addedRubrics: string[];
  skippedRubrics: string[];
  renamed: Array<{ from: string; to: string }>;
}

export class SkillDependencyError extends Error {
  readonly missingIds: string[];

  constructor(missingIds: string[]) {
    super(`Missing registry dependencies: ${missingIds.join(", ")}`);
    this.name = "SkillDependencyError";
    this.missingIds = missingIds;
  }
}

function assertSkillId(id: string): void {
  if (!/^[a-z]+\/[a-z0-9.-]+$/.test(id)) {
    throw new Error(`invalid skill id: ${id}`);
  }
}

function slugSuffix(id: string): string {
  const slash = id.indexOf("/");
  return slash >= 0 ? id.slice(slash + 1) : id;
}

function withSuffix(id: string, suffix: string): string {
  const slash = id.indexOf("/");
  if (slash < 0) return `${id}-${suffix}`;
  return `${id.slice(0, slash)}/${id.slice(slash + 1)}-${suffix}`;
}

function uniqueId(
  desired: string,
  taken: ReadonlySet<string>,
  policy: SkillCollisionPolicy,
): { id: string; renamedFrom?: string } {
  if (!taken.has(desired)) return { id: desired };
  if (policy === "skip") return { id: desired };
  let n = 2;
  while (taken.has(withSuffix(desired, String(n)))) n += 1;
  return { id: withSuffix(desired, String(n)), renamedFrom: desired };
}

function registryExists(id: string): boolean {
  try {
    if (loadUserRubric(id)) return true;
  } catch {
    /* ignore */
  }
  try {
    loadRubric(id);
    return true;
  } catch {
    /* not a rubric */
  }
  try {
    loadTemplate(id);
    return true;
  } catch {
    /* not a template */
  }
  try {
    loadSchema(id);
    return true;
  } catch {
    /* not a schema */
  }
  return false;
}

function isBundledOrUserResolvable(id: string, bundledRubricIds: ReadonlySet<string>): boolean {
  if (bundledRubricIds.has(id)) return true;
  return registryExists(id);
}

export function validateSkill(value: unknown): RedrobSkill {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("skill must be an object");
  }
  const entry = value as Record<string, unknown>;
  if (entry.format !== REDROB_SKILL_FORMAT) {
    throw new Error(`unsupported skill format: ${String(entry.format)}`);
  }
  const formatVersion = Number(entry.formatVersion);
  if (!Number.isInteger(formatVersion) || formatVersion < 1) {
    throw new Error("skill formatVersion must be a positive integer");
  }
  if (formatVersion > REDROB_SKILL_FORMAT_VERSION) {
    throw new Error(`skill formatVersion ${formatVersion} is newer than this Desk`);
  }

  if (!entry.manifest || typeof entry.manifest !== "object" || Array.isArray(entry.manifest)) {
    throw new Error("skill manifest is required");
  }
  const manifestRaw = entry.manifest as Record<string, unknown>;
  const manifestId = String(manifestRaw.id ?? "");
  assertSkillId(manifestId);
  const title = String(manifestRaw.title ?? "").trim();
  const description = String(manifestRaw.description ?? "").trim();
  const workspaceId = String(manifestRaw.workspaceId ?? "");
  if (!title) throw new Error("skill manifest.title is required");
  if (!description) throw new Error("skill manifest.description is required");
  if (!/^[a-z]+$/.test(workspaceId)) throw new Error("skill manifest.workspaceId is invalid");

  const workflow = validateWorkflow(entry.workflow);
  if (!Array.isArray(entry.rubrics)) throw new Error("skill rubrics must be an array");
  const rubrics = entry.rubrics.map((item, index) => {
    try {
      return validateRubric(item);
    } catch (error) {
      throw new Error(
        `skill rubrics[${index}]: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  });

  const rubricIds = new Set(rubrics.map((rubric) => rubric.id));
  const missing: string[] = [];
  for (const step of workflow.steps) {
    if (!step.registryId) continue;
    if (!isBundledOrUserResolvable(step.registryId, rubricIds)) {
      missing.push(step.registryId);
    }
  }
  if (missing.length > 0) {
    throw new SkillDependencyError([...new Set(missing)]);
  }

  const deskMinVersion =
    entry.deskMinVersion === undefined || entry.deskMinVersion === null
      ? undefined
      : String(entry.deskMinVersion);
  const author =
    manifestRaw.author === undefined || manifestRaw.author === null
      ? undefined
      : String(manifestRaw.author);

  return {
    format: REDROB_SKILL_FORMAT,
    formatVersion: REDROB_SKILL_FORMAT_VERSION,
    ...(deskMinVersion ? { deskMinVersion } : {}),
    manifest: {
      id: manifestId,
      title,
      description,
      workspaceId,
      ...(author ? { author } : {}),
      createdAt: String(manifestRaw.createdAt ?? new Date().toISOString()),
    },
    workflow,
    rubrics,
  };
}

export function packSkill(
  workflowId: string,
  options?: {
    description?: string;
    author?: string;
    skillId?: string;
  },
): RedrobSkill {
  const workflow = loadUserWorkflow(workflowId);
  if (!workflow) throw new Error(`workflow not found: ${workflowId}`);

  const rubrics: RubricDefinition[] = [];
  const seen = new Set<string>();
  const missing: string[] = [];

  for (const step of workflow.steps) {
    const registryId = step.registryId;
    if (!registryId || seen.has(registryId)) continue;
    seen.add(registryId);

    const userRubric = loadUserRubric(registryId);
    if (userRubric) {
      rubrics.push(userRubric);
      continue;
    }

    if (!registryExists(registryId)) {
      missing.push(registryId);
    }
  }

  if (missing.length > 0) {
    throw new SkillDependencyError(missing);
  }

  const skillId = options?.skillId ?? `community/${slugSuffix(workflow.id)}`;
  assertSkillId(skillId);

  return {
    format: REDROB_SKILL_FORMAT,
    formatVersion: REDROB_SKILL_FORMAT_VERSION,
    manifest: {
      id: skillId,
      title: workflow.title,
      // The author already wrote what this flow is for; a shared copy should
      // arrive with that sentence rather than a generated placeholder.
      description:
        options?.description?.trim() ||
        workflow.description?.trim() ||
        `Shared Desk skill: ${workflow.title}`,
      workspaceId: workflow.workspaceId,
      ...(options?.author ? { author: options.author } : {}),
      createdAt: new Date().toISOString(),
    },
    workflow,
    rubrics,
  };
}

export function unpackSkill(
  value: unknown,
  options?: { onCollision?: SkillCollisionPolicy },
): UnpackSkillResult {
  const skill = validateSkill(value);
  const policy = options?.onCollision ?? "rename";

  const takenRubrics = new Set(listUserRubricIds());
  // Also treat bundled rubrics as taken so we don't overwrite conceptually —
  // user rubrics live in a separate dir, but ids can collide with bundled names.
  const idMap = new Map<string, string>();
  const addedRubrics: string[] = [];
  const skippedRubrics: string[] = [];
  const renamed: Array<{ from: string; to: string }> = [];

  for (const rubric of skill.rubrics) {
    const { id, renamedFrom } = uniqueId(rubric.id, takenRubrics, policy);
    if (policy === "skip" && takenRubrics.has(rubric.id)) {
      skippedRubrics.push(rubric.id);
      idMap.set(rubric.id, rubric.id);
      continue;
    }
    const next: RubricDefinition = { ...rubric, id };
    saveUserRubric(next);
    takenRubrics.add(id);
    addedRubrics.push(id);
    idMap.set(rubric.id, id);
    if (renamedFrom) renamed.push({ from: renamedFrom, to: id });
  }

  const takenWorkflows = new Set(listUserWorkflowIds());
  const workflowDesired = skill.workflow.id;
  const workflowPick = uniqueId(workflowDesired, takenWorkflows, policy);
  if (policy === "skip" && takenWorkflows.has(workflowDesired)) {
    throw new Error(`workflow already exists: ${workflowDesired}`);
  }
  if (workflowPick.renamedFrom) {
    renamed.push({ from: workflowPick.renamedFrom, to: workflowPick.id });
  }

  const remappedSteps = skill.workflow.steps.map((step) => {
    if (!step.registryId) return step;
    const mapped = idMap.get(step.registryId) ?? step.registryId;
    if (mapped === step.registryId) return step;
    return { ...step, registryId: mapped };
  });

  // After saving user rubrics, every registryId must resolve.
  const missing: string[] = [];
  for (const step of remappedSteps) {
    if (!step.registryId) continue;
    if (!registryExists(step.registryId)) missing.push(step.registryId);
  }
  if (missing.length > 0) {
    throw new SkillDependencyError([...new Set(missing)]);
  }

  const workflow: WorkflowDefinition = {
    ...skill.workflow,
    id: workflowPick.id,
    workspaceId: skill.workflow.workspaceId,
    steps: remappedSteps,
    updatedAt: new Date().toISOString(),
  };
  saveUserWorkflow(workflow);

  return {
    workflowId: workflow.id,
    workflowTitle: workflow.title,
    addedRubrics,
    skippedRubrics,
    renamed,
  };
}

export function skillToJson(skill: RedrobSkill): string {
  return `${JSON.stringify(skill, null, 2)}\n`;
}

export function parseSkillJson(raw: string): RedrobSkill {
  return skillFromObject(JSON.parse(raw) as Record<string, unknown>);
}

/**
 * Read a skill, whether or not it was written for this app.
 *
 * A Redrob skill arrives as itself. A Claude skill (`name` / `description` /
 * a body of instructions) and an OpenClaw playbook (a named agent and a list of
 * steps) are the two shapes people already have, and both say the same thing in
 * different words: here is what this flow is for, and here is how to do it. They
 * are read into one flow rather than rejected as the wrong file.
 */
function skillFromObject(parsed: Record<string, unknown>): RedrobSkill {
  if (parsed?.format === REDROB_SKILL_FORMAT) {
    return validateSkill(parsed);
  }
  // A playbook is recognised by its agent, not by having steps: a Claude skill
  // may carry steps too, so that test has to come first.
  if (parsed?.claw || parsed?.playbook || parsed?.agent) {
    return importedSkill(parsed, "OpenClaw playbook");
  }
  if (parsed?.tools || parsed?.input_schema || parsed?.instructions || parsed?.name) {
    return importedSkill(parsed, "Claude skill");
  }

  return validateSkill(parsed);
}

/**
 * Split a markdown file into its front matter and the prose under it.
 *
 * A Claude skill is a SKILL.md: three dashes, a couple of YAML lines naming the
 * skill, three dashes, then the instructions. A markdown file without that
 * header is still worth reading, so the whole file becomes the prose.
 */
export function splitFrontMatter(raw: string): {
  data: Record<string, unknown>;
  body: string;
} {
  const text = raw.replace(/^\uFEFF/, "");
  const match = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/.exec(text);
  if (!match) return { data: {}, body: text.trim() };
  const parsed = parseYaml(match[1]!) as unknown;
  const data =
    typeof parsed === "object" && parsed !== null && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : {};
  return { data, body: text.slice(match[0].length).trim() };
}

function skillFromMarkdown(raw: string): RedrobSkill {
  const { data, body } = splitFrontMatter(raw);
  // Failing that, the first heading is the name the author gave it.
  const heading = /^#\s+(.+)$/m.exec(body)?.[1]?.trim();
  return importedSkill(
    {
      ...data,
      ...(text(data.name) || text(data.title) ? {} : heading ? { name: heading } : {}),
      instructions: body,
    },
    "Claude skill",
  );
}

/**
 * Read a skill file, whichever of the four shapes it arrives in.
 *
 * The name matters as much as the bytes: a `.md` is a Claude skill even though
 * YAML would also parse it, and a Redrob skill is JSON even though it is handed
 * over with a `.redrobskill` name. Anything unrecognised is tried as JSON, then
 * as YAML, so a playbook saved under the wrong extension still imports.
 */
export function parseSkillFile(raw: string, fileName?: string): RedrobSkill {
  const name = (fileName ?? "").toLowerCase();
  if (/\.(md|markdown)$/.test(name)) return skillFromMarkdown(raw);
  if (/\.(ya?ml)$/.test(name)) {
    const parsed = parseYaml(raw) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      throw new Error("skill file must describe one skill");
    }
    return skillFromObject(parsed as Record<string, unknown>);
  }
  if (/\.(redrobskill|json)$/.test(name)) return parseSkillJson(raw);

  try {
    return parseSkillJson(raw);
  } catch {
    return parseSkillFile(raw, "skill.yaml");
  }
}

const IMPORT_ENGINES = new Set<WorkflowEngine>(["lookup", "process", "review"]);

function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function firstText(...values: unknown[]): string {
  for (const value of values) {
    const found = text(value);
    if (found) return found;
  }
  return "";
}

function slugOf(title: string, fallback: string): string {
  const slug = title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
  return slug || fallback;
}

/**
 * A step from a foreign file, in this app's shape.
 *
 * The engines here are the three this app runs; anything else a file names is
 * work for the model to do, which is `process`. A step that asks for a person's
 * approval is `review`, so importing a playbook does not quietly drop its
 * confirmation points.
 */
function importedStep(raw: unknown, index: number): WorkflowStep {
  const step =
    typeof raw === "object" && raw !== null ? (raw as Record<string, unknown>) : {};
  const named = text(step.engine) as WorkflowEngine;
  const wantsReview = Boolean(step.confirm ?? step.requiresConfirmation ?? step.review);
  const engine: WorkflowEngine = IMPORT_ENGINES.has(named)
    ? named
    : wantsReview
      ? "review"
      : "process";
  const notes = firstText(step.instruction, step.prompt, step.description, step.body);
  return {
    id: `step-${index + 1}`,
    engine,
    action: firstText(step.action, step.tool, step.id) || "custom",
    title: firstText(step.title, step.name) || `Step ${index + 1}`,
    ...(notes ? { notes } : {}),
  };
}

function importedSkill(
  parsed: Record<string, unknown>,
  author: "Claude skill" | "OpenClaw playbook",
): RedrobSkill {
  const fallback = author === "Claude skill" ? "claude-skill" : "openclaw-playbook";
  const title =
    firstText(parsed.title, parsed.name, parsed.agent) ||
    (author === "Claude skill" ? "Imported Claude skill" : "Imported OpenClaw playbook");
  const description =
    firstText(parsed.description, parsed.summary, parsed.goal) ||
    `Imported ${author}.`;
  // The prose body is what the file is really carrying; chat reads it when it
  // runs the flow as a guide, so it is kept whole rather than cut into steps.
  const instructions = firstText(
    parsed.instructions,
    parsed.body,
    parsed.prompt,
    parsed.system,
  );

  const rawSteps = [parsed.steps, parsed.playbook, parsed.tools].find((value) =>
    Array.isArray(value),
  ) as unknown[] | undefined;
  const steps = (rawSteps ?? []).map(importedStep);
  const slug = slugOf(title, fallback);
  const createdAt = new Date().toISOString();

  return {
    format: REDROB_SKILL_FORMAT,
    formatVersion: REDROB_SKILL_FORMAT_VERSION,
    manifest: {
      id: `community/${slug}`,
      title,
      description,
      workspaceId: "custom",
      author,
      createdAt,
    },
    workflow: {
      id: `custom/${slug}`,
      version: 1,
      workspaceId: "custom",
      title,
      description,
      ...(instructions ? { instructions } : {}),
      steps:
        steps.length > 0
          ? steps
          : [
              // A file with prose but no steps becomes one step to do the thing.
              // Its notes stay empty when the body is already on the flow, since
              // running a skill prints both and nobody wants it twice.
              {
                id: "step-1",
                engine: "process" as const,
                action: "custom",
                title,
                ...(!instructions && description ? { notes: description } : {}),
              },
            ],
      updatedAt: createdAt,
    },
    rubrics: [],
  };
}
