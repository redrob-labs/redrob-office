import { readdir } from "node:fs/promises";
import type { Dirent } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

import type { ModelArtifact } from "../models.js";

export function detectOllamaModelsDir(platform: NodeJS.Platform = process.platform): string {
  const home = platform === "win32" ? (process.env.USERPROFILE ?? homedir()) : homedir();
  return join(home, ".ollama", "models");
}

async function matchingFile(
  directory: string,
  expectedName: string,
  depth = 0,
): Promise<string | null> {
  if (depth > 4) {
    return null;
  }
  let entries: Dirent[];
  try {
    entries = await readdir(directory, { withFileTypes: true, encoding: "utf8" });
  } catch {
    return null;
  }

  const normalizedExpected = expectedName.toLowerCase().replace(/[^a-z0-9]/g, "");
  for (const entry of entries) {
    const candidate = join(directory, entry.name);
    if (entry.isFile()) {
      const normalizedName = entry.name.toLowerCase().replace(/[^a-z0-9]/g, "");
      if (normalizedName.includes(normalizedExpected)) {
        return candidate;
      }
    } else if (entry.isDirectory()) {
      const nested = await matchingFile(candidate, expectedName, depth + 1);
      if (nested !== null) {
        return nested;
      }
    }
  }
  return null;
}

/**
 * Ollama blob names are normally hashes, so this only reuses a file when its
 * actual filename provides a credible artifact-name match.
 */
export async function findOllamaModel(
  artifact: ModelArtifact,
  modelsDir = detectOllamaModelsDir(),
): Promise<string | null> {
  return matchingFile(modelsDir, artifact.hfFile);
}
