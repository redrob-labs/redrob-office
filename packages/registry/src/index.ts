export type RegistryKind = "schema" | "rubric" | "template";

export interface RegistryEntryMeta {
  id: string;
  version: number;
  kind: RegistryKind;
}

export function listRegistryKinds(): readonly RegistryKind[] {
  return ["schema", "rubric", "template"] as const;
}

export { loadSchema, loadRubric, loadTemplate, listSchemaIds, listRubricIds, listTemplateIds } from "./load.js";
export {
  getUserRubricsDir,
  listUserRubricIds,
  loadUserRubric,
  saveUserRubric,
  setUserRubricsDir,
} from "./user-rubrics.js";
export {
  getUserWorkflowsDir,
  listUserWorkflowIds,
  listUserWorkflows,
  loadUserWorkflow,
  saveUserWorkflow,
  setUserWorkflowsDir,
  validateWorkflow,
  WorkflowValidationError,
  WORKFLOW_LIMITS,
  type WorkflowDefinition,
  type WorkflowEngine,
  type WorkflowStep,
  type WorkflowTrigger,
} from "./user-workflows.js";
export {
  REDROB_SKILL_FORMAT,
  REDROB_SKILL_FORMAT_VERSION,
  SkillDependencyError,
  packSkill,
  parseSkillFile,
  parseSkillJson,
  skillToJson,
  unpackSkill,
  validateSkill,
  type RedrobSkill,
  type SkillCollisionPolicy,
  type SkillManifest,
  type UnpackSkillResult,
} from "./skill.js";
export {
  validateSchema,
  validateRubric,
  validateTemplate,
  type SchemaDefinition,
  type SchemaField,
  type SchemaSemanticType,
  type RubricDefinition,
  type RubricAxis,
  type RubricRule,
  type TemplateDefinition,
  type TemplateSlot,
} from "./validate.js";
