import { access } from "node:fs/promises";
import { constants } from "node:fs";
import { join } from "node:path";

import type { ModelArtifact } from "../models.js";
import { downloadModel } from "./download.js";

export function modelPathForArtifact(artifact: ModelArtifact, modelsDir: string): string {
  return join(modelsDir, ...artifact.hfRepo.split("/"), artifact.hfFile);
}

/** Same repo folder as the LM; null when the artifact has no mmproj. */
export function mmprojPathForArtifact(artifact: ModelArtifact, modelsDir: string): string | null {
  if (!artifact.mmprojFile) return null;
  return join(modelsDir, ...artifact.hfRepo.split("/"), artifact.mmprojFile);
}

export async function resolveModel(artifact: ModelArtifact, modelsDir: string): Promise<string> {
  const modelPath = modelPathForArtifact(artifact, modelsDir);
  try {
    await access(modelPath, constants.R_OK);
    return modelPath;
  } catch {
    throw new Error(
      `Model "${artifact.id}" is not available at ${modelPath}. Download it before starting inference.`,
    );
  }
}

export async function ensureModel(
  artifact: ModelArtifact,
  modelsDir: string,
  options: { download?: boolean } = {},
): Promise<string> {
  try {
    return await resolveModel(artifact, modelsDir);
  } catch (error) {
    if (!options.download) {
      throw error;
    }
    return downloadModel(artifact, modelsDir);
  }
}
