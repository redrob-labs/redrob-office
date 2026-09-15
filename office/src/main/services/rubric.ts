import { join } from "node:path";
import { draftRubricFromJd, slugifyRubricSuffix } from "@redrob/generate";
import {
  listUserRubricIds,
  saveUserRubric,
  setUserRubricsDir,
  type RubricDefinition,
} from "@redrob/registry";
import { saveArtifact } from "./artifacts.js";

export interface GenerateRubricRequest {
  jdText: string;
  slug?: string;
  workspaceId?: string;
}

export interface GenerateRubricResult {
  rubric: RubricDefinition;
  path: string;
  source: "jd-draft";
  artifactId: string;
}

export function configureUserRubrics(userDataPath: string): string {
  const dir = join(userDataPath, "registry", "rubrics");
  setUserRubricsDir(dir);
  return dir;
}

export async function generateAndSaveRubric(
  input: GenerateRubricRequest,
  onProgress?: (stepId: "draft" | "save") => void,
): Promise<GenerateRubricResult> {
  const workspace = input.workspaceId ?? "recruiting";
  if (!/^[a-z]+$/.test(workspace)) {
    throw new Error(`invalid workspace id: ${workspace}`);
  }
  onProgress?.("draft");
  const suffix = slugifyRubricSuffix(input.slug?.trim() || "from-jd");
  const rubricId = `${workspace}/${suffix}`;
  const rubric = draftRubricFromJd(input.jdText, rubricId);
  const path = saveUserRubric(rubric);
  const body = [
    `# ${rubric.id}`,
    "",
    ...rubric.axes.map((axis) => `## ${axis.label}\n${axis.guidance}\n`),
  ].join("\n");
  onProgress?.("save");
  const artifact = await saveArtifact({
    kind: "rubric",
    title: rubric.id,
    body,
    categoryId: workspace,
    source: "template",
  });
  return { rubric, path, source: "jd-draft", artifactId: artifact.id };
}

export function listSavedRubrics(): string[] {
  return listUserRubricIds();
}
