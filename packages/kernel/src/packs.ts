import { localModelIdForGrade, type ModelGrade } from "./grades.js";
import { MODEL_ARTIFACTS, type ModelArtifact, type ModelRole } from "./models.js";
import { TIERS } from "./tiers.js";
import type { Tier } from "./types.js";

/** Default local pack — SPEC §4.3. Higher tiers are explicit upgrades. */
export const DEFAULT_LOCAL_PACK_TIER: Tier = "T4";

/** Approximate installed sizes in bytes (Hugging Face Content-Length / tree sizes). */
export const APPROX_ARTIFACT_BYTES: Readonly<Record<string, number>> = {
  "qwen3-1.7b-q4": 1_280_000_000,
  "qwen3-4b-q4": 2_500_000_000,
  "qwen35-0.8b-q4": 532_517_120,
  "qwen35-2b-q4": 1_280_835_840,
  "qwen35-2b-q4-mmproj": 668_227_264,
  "qwen35-4b-q4": 2_740_937_888,
  "qwen35-4b-q4-mmproj": 672_423_616,
  "qwen35-9b-q4": 5_761_495_040,
  "qwen35-9b-q4-mmproj": 672_423_616,
  "qwen3-embedding-0.6b": 639_000_000,
  "qwen3-reranker-0.6b": 639_000_000,
  "qwen3-embedding-4b": 2_500_000_000,
  "qwen3-embedding-8b": 4_676_000_000,
  "qwen3-reranker-4b": 2_496_000_000,
};

export type PackRole = ModelRole;

export interface RolePack {
  role: PackRole;
  label: string;
  description: string;
  requiredForModules: string[];
  artifacts: ModelArtifact[];
  approxBytes: number;
}

export interface LocalPackPlan {
  tier: Tier;
  grade: ModelGrade;
  roles: RolePack[];
  minimalBytes: number;
  fullBytes: number;
}

function artifactBytes(artifact: ModelArtifact): number {
  const key = artifact.id;
  const main = APPROX_ARTIFACT_BYTES[key] ?? 0;
  const mmproj =
    artifact.mmprojFile !== undefined
      ? (APPROX_ARTIFACT_BYTES[`${artifact.id}-mmproj`] ?? 0)
      : 0;
  return main + mmproj;
}

/**
 * Embed and rerank are sized by how much memory the machine has; text is sized
 * by the grade the person chose, because that is a preference about answers
 * rather than a fact about the hardware.
 */
function roleArtifacts(tier: Tier, role: PackRole, grade: ModelGrade): ModelArtifact[] {
  const id = role === "text" ? localModelIdForGrade(grade) : TIERS[tier][role];
  const artifact = MODEL_ARTIFACTS[id];
  if (!artifact) {
    throw new Error(`Missing artifact for ${tier}.${role} id=${id}`);
  }
  return [artifact];
}

const ROLE_META: Record<
  PackRole,
  { label: string; description: string; requiredForModules: string[] }
> = {
  text: {
    label: "Text",
    description: "Extract, compare (text rules), generate, chat",
    requiredForModules: ["intake", "assess", "verify", "publish", "capture", "chat"],
  },
  embed: {
    label: "Embedding",
    description: "Screen ranking recall",
    requiredForModules: ["screen"],
  },
  rerank: {
    label: "Reranker",
    description: "Screen ranking refinement",
    requiredForModules: ["screen"],
  },
};

/** Progressive install order for a tier and grade (no separate VLM role). */
export function buildLocalPackPlan(
  tier: Tier = DEFAULT_LOCAL_PACK_TIER,
  grade: ModelGrade = "flash",
): LocalPackPlan {
  const order: PackRole[] = ["text", "embed", "rerank"];
  const roles: RolePack[] = order.map((role) => {
    const artifacts = roleArtifacts(tier, role, grade);
    const approxBytes = artifacts.reduce((sum, artifact) => sum + artifactBytes(artifact), 0);
    return {
      role,
      ...ROLE_META[role],
      artifacts,
      approxBytes,
    };
  });
  const text = roles[0];
  if (!text) {
    throw new Error("Pack plan missing text role");
  }
  return {
    tier,
    grade,
    roles,
    minimalBytes: text.approxBytes,
    fullBytes: roles.reduce((sum, role) => sum + role.approxBytes, 0),
  };
}

export function humanBytes(bytes: number): string {
  if (bytes >= 1024 ** 3) {
    return `${(bytes / 1024 ** 3).toFixed(1)} GB`;
  }
  return `${(bytes / 1024 ** 2).toFixed(0)} MB`;
}

export type InferenceMode = "local" | "redrob_remote";

export interface SetupDecision {
  packTier: Tier;
  inferenceMode: InferenceMode;
  rolesToDownload: PackRole[];
}
