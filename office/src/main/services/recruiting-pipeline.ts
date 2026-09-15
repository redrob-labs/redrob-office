import type { Store } from "@redrob/store";
import type {
  RecruitingPipelineContext,
  RecruitingPipelineInput,
  RecruitingPipelineProgress,
  RecruitingPipelineResult,
  RecruitingPipelineStep,
} from "../../shared/office-api.js";
import { runAssess } from "./assess.js";
import { draftDecisionEmail } from "./email.js";
import { runIntakeBatch } from "./intake.js";
import { draftJd } from "./jd.js";
import { generateAndSaveRubric } from "./rubric.js";

const PIPELINE_STEPS: readonly RecruitingPipelineStep[] = [
  "jd",
  "rubric",
  "intake",
  "assess",
  "email",
];

const DEFAULT_WORKSPACE_ID = "recruiting";
const DEFAULT_INTAKE_SCHEMA_ID = "recruiting/resume";
const DEFAULT_PASS_THRESHOLD = 0.7;

export interface RecruitingPipelineHooks {
  onProgress?: (progress: RecruitingPipelineProgress) => void;
  /** Where intake keeps resumable batch state; defaults under the cwd. */
  intakeStateDirectory?: string;
}

function initialContext(input: RecruitingPipelineInput): RecruitingPipelineContext {
  const saved = input.context;
  return {
    workspaceId: input.workspaceId ?? saved?.workspaceId ?? DEFAULT_WORKSPACE_ID,
    locale: input.locale ?? saved?.locale ?? "en",
    ...(saved?.roleTitle !== undefined ? { roleTitle: saved.roleTitle } : {}),
    ...(saved?.jdMarkdown !== undefined ? { jdMarkdown: saved.jdMarkdown } : {}),
    ...(saved?.jdArtifactId !== undefined ? { jdArtifactId: saved.jdArtifactId } : {}),
    ...(saved?.rubricId !== undefined ? { rubricId: saved.rubricId } : {}),
    ...(saved?.rubricArtifactId !== undefined
      ? { rubricArtifactId: saved.rubricArtifactId }
      : {}),
    ...(saved?.intakeRunId !== undefined ? { intakeRunId: saved.intakeRunId } : {}),
    documentIds: [...(saved?.documentIds ?? [])],
    assessResults: [...(saved?.assessResults ?? [])],
    emailArtifactIds: [...(saved?.emailArtifactIds ?? [])],
  };
}

function defaultSteps(
  input: RecruitingPipelineInput,
  context: RecruitingPipelineContext,
): RecruitingPipelineStep[] {
  const steps: RecruitingPipelineStep[] = [];
  const willHaveJd = Boolean(context.jdMarkdown || input.jd);
  const willHaveRubric = Boolean(context.rubricId || willHaveJd);
  const willHaveDocuments =
    context.documentIds.length > 0 || Boolean(input.intakeFilePaths?.length);

  if (!context.jdMarkdown && input.jd) steps.push("jd");
  if (!context.rubricId && willHaveJd) steps.push("rubric");
  if (context.documentIds.length === 0 && input.intakeFilePaths?.length) {
    steps.push("intake");
  }

  const assessedDocumentIds = new Set(
    context.assessResults.map((result) => result.documentId),
  );
  const hasDocumentsToAssess =
    context.documentIds.some((id) => !assessedDocumentIds.has(id)) ||
    (context.documentIds.length === 0 && Boolean(input.intakeFilePaths?.length));
  if (willHaveRubric && willHaveDocuments && hasDocumentsToAssess) {
    steps.push("assess");
  }

  const hasResultsToEmail =
    context.assessResults.length > context.emailArtifactIds.length ||
    steps.includes("assess");
  if (!input.skipEmail && hasResultsToEmail) steps.push("email");
  return steps;
}

function selectedSteps(
  input: RecruitingPipelineInput,
  context: RecruitingPipelineContext,
): RecruitingPipelineStep[] {
  if (input.steps === undefined) return defaultSteps(input, context);
  const requested = new Set(input.steps);
  return PIPELINE_STEPS.filter((step) => requested.has(step));
}

function requirePassThreshold(value: number | undefined): number {
  const threshold = value ?? DEFAULT_PASS_THRESHOLD;
  if (!Number.isFinite(threshold) || threshold < 0 || threshold > 1) {
    throw new Error("Recruiting pipeline passThreshold must be between 0 and 1.");
  }
  return threshold;
}

function scoreNotes(scoreSum: number, scoreMax: number): string {
  return `Assessment score: ${scoreSum}/${scoreMax}.`;
}

/**
 * Run the recruiting workflow in dependency order, carrying each step's
 * persisted identifiers into the next one. A partial context resumes a run.
 */
export async function runRecruitingPipeline(
  store: Store,
  input: RecruitingPipelineInput,
  hooks: RecruitingPipelineHooks = {},
): Promise<RecruitingPipelineResult> {
  const startedAt = performance.now();
  const context = initialContext(input);
  const threshold = requirePassThreshold(input.passThreshold);
  const steps = selectedSteps(input, context);

  for (const [stepIndex, step] of steps.entries()) {
    hooks.onProgress?.({
      step,
      index: stepIndex + 1,
      total: steps.length,
    });

    if (step === "jd") {
      if (context.jdMarkdown) continue;
      if (!input.jd) {
        throw new Error(
          "Recruiting pipeline jd step requires input.jd or context.jdMarkdown.",
        );
      }
      const result = await draftJd({ ...input.jd, locale: context.locale });
      context.roleTitle = input.jd.roleTitle;
      context.jdMarkdown = result.markdown;
      if (result.artifactId) context.jdArtifactId = result.artifactId;
      continue;
    }

    if (step === "rubric") {
      if (context.rubricId) continue;
      if (!context.jdMarkdown) {
        throw new Error(
          "Recruiting pipeline rubric step requires context.jdMarkdown (run jd first).",
        );
      }
      const result = await generateAndSaveRubric({
        jdText: context.jdMarkdown,
        workspaceId: context.workspaceId,
      });
      context.rubricId = result.rubric.id;
      context.rubricArtifactId = result.artifactId;
      continue;
    }

    if (step === "intake") {
      if (context.documentIds.length > 0) continue;
      if (!input.intakeFilePaths?.length) {
        throw new Error(
          "Recruiting pipeline intake step requires input.intakeFilePaths or context.documentIds.",
        );
      }
      const result = await runIntakeBatch({
        store,
        workspaceId: context.workspaceId,
        schemaId: input.intakeSchemaId ?? DEFAULT_INTAKE_SCHEMA_ID,
        filePaths: input.intakeFilePaths,
        ...(hooks.intakeStateDirectory
          ? { stateDirectory: hooks.intakeStateDirectory }
          : {}),
      });
      context.intakeRunId = result.runId;
      context.documentIds = Array.from(
        new Set(
          result.items.flatMap((item) =>
            item.ok && item.documentId ? [item.documentId] : [],
          ),
        ),
      );
      continue;
    }

    if (step === "assess") {
      if (!context.rubricId) {
        throw new Error(
          "Recruiting pipeline assess step requires context.rubricId (run rubric first).",
        );
      }
      if (context.documentIds.length === 0) {
        throw new Error(
          "Recruiting pipeline assess step requires context.documentIds (run intake first).",
        );
      }
      const assessedDocumentIds = new Set(
        context.assessResults.map((result) => result.documentId),
      );
      for (const documentId of context.documentIds) {
        if (assessedDocumentIds.has(documentId)) continue;
        const result = await runAssess(store, {
          workspaceId: context.workspaceId,
          documentId,
          rubricId: context.rubricId,
        });
        const scores = result.compare.scores ?? [];
        const scoreSum = scores.reduce((sum, score) => sum + score.value, 0);
        const scoreMax = scores.reduce((sum, score) => sum + score.max, 0);
        context.assessResults.push({
          documentId,
          runId: result.runId,
          scoreSum,
          scoreMax,
          decision:
            scoreSum >= scoreMax * threshold ? "pass" : "reject",
        });
      }
      continue;
    }

    if (input.skipEmail) continue;
    if (context.assessResults.length === 0) {
      throw new Error(
        "Recruiting pipeline email step requires context.assessResults (run assess first).",
      );
    }
    for (
      let resultIndex = context.emailArtifactIds.length;
      resultIndex < context.assessResults.length;
      resultIndex += 1
    ) {
      const assessment = context.assessResults[resultIndex];
      if (!assessment) continue;
      const result = await draftDecisionEmail(store, {
        documentId: assessment.documentId,
        decision: assessment.decision,
        ...(context.roleTitle ? { roleTitle: context.roleTitle } : {}),
        notes: scoreNotes(assessment.scoreSum, assessment.scoreMax),
        locale: context.locale,
      });
      context.emailArtifactIds.push(result.artifactId);
    }
  }

  hooks.onProgress?.({
    step: "done",
    index: steps.length,
    total: steps.length,
  });
  return {
    context,
    timingMs: performance.now() - startedAt,
  };
}
