import { useEffect, useMemo, useRef, useState } from "react";
import { useI18n } from "@redrob/ui";
import type {
  RecruitingPipelineProgress,
  RecruitingPipelineResult,
  RecruitingPipelineStep,
  SaveWorkflowRequest,
} from "../../shared/office-api";
import {
  planWorkflowRun,
  workflowTimelineStatus,
  type WorkflowTimelineStatus,
} from "./workflow-pipeline";

type DraftStep = SaveWorkflowRequest["steps"][number];

const PIPELINE_ACTIONS = new Set(["jd", "rubric", "intake", "assess", "email"]);

function pipelineStepFor(step: DraftStep): RecruitingPipelineStep | undefined {
  return PIPELINE_ACTIONS.has(step.action)
    ? (step.action as RecruitingPipelineStep)
    : undefined;
}

function statusClasses(status: WorkflowTimelineStatus): {
  node: string;
  card: string;
  label: string;
} {
  if (status === "done") {
    return {
      node: "bg-success text-success-foreground ring-success",
      card: "border-success-muted bg-success-soft",
      label: "bg-success text-success-foreground",
    };
  }
  if (status === "running") {
    return {
      node: "bg-primary text-primary-foreground ring-primary",
      card: "border-primary-muted bg-primary-soft shadow-sm",
      label: "bg-primary text-primary-foreground",
    };
  }
  if (status === "error") {
    return {
      node: "bg-destructive text-destructive-foreground ring-destructive",
      card: "border-destructive-muted bg-destructive-soft",
      label: "bg-destructive text-destructive-foreground",
    };
  }
  if (status === "manual") {
    return {
      node: "bg-warning-soft text-warning-ink ring-warning-muted",
      card: "border-warning-muted bg-warning-soft",
      label: "bg-warning text-warning-foreground",
    };
  }
  return {
    node: "bg-white text-gray-500 ring-gray-300 dark:bg-gray-900 dark:text-gray-400 dark:ring-gray-700",
    card: "border-gray-200 bg-white dark:border-gray-800 dark:bg-gray-900",
    label: "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-300",
  };
}

function statusGlyph(status: WorkflowTimelineStatus, index: number): string {
  if (status === "done") return "✓";
  if (status === "error") return "!";
  if (status === "manual") return "↗";
  if (status === "running") return "•";
  return String(index + 1);
}

export function WorkflowRunPanel({
  workspaceId,
  title,
  description,
  instructions,
  steps,
  handDone,
  focusIndex,
  onEdit,
  onOpenArtifact,
  onOpenManual,
  onToggleHandDone,
  onRunInChat,
}: {
  workspaceId: string;
  title: string;
  /** When to use this flow — the trigger, in the author's words. */
  description?: string | undefined;
  /** The skill body chat follows in guide mode. */
  instructions?: string | undefined;
  steps: DraftStep[];
  /** Steps the person ticked off in Tasks, by position in this flow. */
  handDone: readonly number[];
  /** Step to open expanded, set when Tasks hands the flow back. */
  focusIndex?: number | undefined;
  onEdit: () => void;
  onOpenArtifact: (artifactId: string) => void;
  onOpenManual: (step: DraftStep, index: number) => void;
  onToggleHandDone: (index: number) => void;
  /** Hand the run to the chat box, which can call this flow by name. */
  onRunInChat: () => void;
}): JSX.Element {
  const { t, locale } = useI18n();
  const plan = useMemo(() => planWorkflowRun(steps), [steps]);
  const [roleTitle, setRoleTitle] = useState("");
  const [responsibilities, setResponsibilities] = useState("");
  const [qualifications, setQualifications] = useState("");
  const [location, setLocation] = useState("");
  const [folder, setFolder] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<RecruitingPipelineProgress | null>(null);
  const progressRef = useRef<RecruitingPipelineProgress | null>(null);
  const [result, setResult] = useState<RecruitingPipelineResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [failedStep, setFailedStep] = useState<RecruitingPipelineStep | undefined>();
  const firstInputAction = plan.needsJdInput
    ? "jd"
    : plan.needsResumeInput
      ? "intake"
      : plan.steps[0];
  const [expandedIndex, setExpandedIndex] = useState<number | undefined>(() => {
    const index = steps.findIndex((step) => step.action === firstInputAction);
    return index >= 0 ? index : undefined;
  });

  /** Arriving from a task opens the step that task belongs to, not the first one. */
  useEffect(() => {
    if (focusIndex !== undefined) setExpandedIndex(focusIndex);
  }, [focusIndex]);

  useEffect(
    () =>
      window.office.onRecruitingPipelineProgress((next) => {
        progressRef.current = next;
        setProgress(next);
      }),
    [],
  );

  const ready =
    plan.steps.length > 0 &&
    (!plan.needsJdInput ||
      (roleTitle.trim().length > 0 && responsibilities.trim().length > 0)) &&
    (!plan.needsResumeInput || Boolean(folder));

  async function pickFolder(): Promise<void> {
    try {
      const picked = await window.office.pickIntakeFolder();
      if (picked) setFolder(picked);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  async function run(): Promise<void> {
    setBusy(true);
    setError(null);
    setResult(null);
    setProgress(null);
    progressRef.current = null;
    setFailedStep(undefined);
    try {
      const outcome = await window.office.runRecruitingPipeline({
        workspaceId,
        locale: locale === "en" ? "en" : "ko",
        steps: plan.steps,
        ...(plan.needsJdInput
          ? {
              jd: {
                roleTitle: roleTitle.trim(),
                responsibilities: responsibilities.trim(),
                qualifications: qualifications.trim(),
                ...(location.trim() ? { location: location.trim() } : {}),
              },
            }
          : {}),
        ...(plan.needsResumeInput && folder
          ? { intakeDirectoryPath: folder }
          : {}),
      });
      setResult(outcome);
      const doneProgress: RecruitingPipelineProgress = {
        step: "done",
        index: plan.steps.length,
        total: plan.steps.length,
      };
      progressRef.current = doneProgress;
      setProgress(doneProgress);
    } catch (err) {
      const lastProgress = progressRef.current;
      if (lastProgress?.step && lastProgress.step !== "done") {
        setFailedStep(lastProgress.step);
      }
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  function statusFor(
    pipelineStep: RecruitingPipelineStep | undefined,
    index: number,
  ): WorkflowTimelineStatus {
    return workflowTimelineStatus({
      plan,
      busy,
      resultReady: Boolean(result),
      handDone: handDone.includes(index),
      ...(pipelineStep ? { pipelineStep } : {}),
      ...(progress?.step ? { progressStep: progress.step } : {}),
      ...(failedStep ? { failedStep } : {}),
    });
  }

  function stepResult(
    pipelineStep: RecruitingPipelineStep | undefined,
  ): JSX.Element | null {
    if (!result || !pipelineStep) return null;
    const context = result.context;
    if (pipelineStep === "jd" && context.jdMarkdown) {
      return (
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span>{t("workflow.runResultJd", { chars: context.jdMarkdown.length })}</span>
          {context.jdArtifactId ? (
            <button
              type="button"
              className="text-xs font-semibold text-brand-700 hover:underline dark:text-brand-300"
              onClick={() => onOpenArtifact(context.jdArtifactId!)}
            >
              {t("workflow.openResult")}
            </button>
          ) : null}
        </div>
      );
    }
    if (pipelineStep === "rubric" && context.rubricId) {
      return (
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span>{t("workflow.runResultRubric", { id: context.rubricId })}</span>
          {context.rubricArtifactId ? (
            <button
              type="button"
              className="text-xs font-semibold text-brand-700 hover:underline dark:text-brand-300"
              onClick={() => onOpenArtifact(context.rubricArtifactId!)}
            >
              {t("workflow.openResult")}
            </button>
          ) : null}
        </div>
      );
    }
    if (pipelineStep === "intake" && context.documentIds.length > 0) {
      return (
        <span>
          {t("workflow.runResultDocuments", { count: context.documentIds.length })}
        </span>
      );
    }
    if (pipelineStep === "assess" && context.assessResults.length > 0) {
      return (
        <ul className="space-y-1">
          {context.assessResults.map((assessment) => (
            <li key={assessment.runId}>
              {t("workflow.runResultScore", {
                score: assessment.scoreSum,
                max: assessment.scoreMax,
                decision: assessment.decision,
              })}
            </li>
          ))}
        </ul>
      );
    }
    if (pipelineStep === "email" && context.emailArtifactIds.length > 0) {
      return (
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span>
            {t("workflow.runResultEmails", {
              count: context.emailArtifactIds.length,
            })}
          </span>
          <button
            type="button"
            className="text-xs font-semibold text-brand-700 hover:underline dark:text-brand-300"
            onClick={() => onOpenArtifact(context.emailArtifactIds[0]!)}
          >
            {t("workflow.openResult")}
          </button>
        </div>
      );
    }
    return null;
  }

  return (
    <section className="mx-auto w-full max-w-3xl">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-brand-600">
            {t("workflow.runMode")}
          </p>
          <h3 className="mt-1 text-xl font-bold tracking-tight text-gray-900 dark:text-white">
            {title}
          </h3>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
            {t("workflow.timelineHint")}
          </p>
        </div>
        <div className="flex shrink-0 gap-2">
          <button type="button" className="btn-secondary" onClick={onRunInChat}>
            {t("workflow.runInChat")}
          </button>
          <button type="button" className="btn-secondary" onClick={onEdit}>
            {t("workflow.editWorkflow")}
          </button>
        </div>
      </div>

      {description || instructions ? (
        <div className="mt-4 rounded-lg border border-gray-200 bg-gray-50/70 p-4 dark:border-gray-800 dark:bg-gray-900/60">
          <p className="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
            {t("workflow.skillPreview")}
          </p>
          {description ? (
            <p className="mt-1 text-sm text-gray-700 dark:text-gray-300">
              <span className="font-medium text-gray-900 dark:text-gray-100">
                {t("workflow.whenToUse")}:{" "}
              </span>
              {description}
            </p>
          ) : null}
          {instructions ? (
            <details className="mt-2">
              <summary className="cursor-pointer text-sm font-medium text-brand-700 dark:text-brand-300">
                {t("workflow.howToDoIt")}
              </summary>
              <pre className="mt-2 whitespace-pre-wrap font-sans text-sm leading-relaxed text-gray-700 dark:text-gray-300">
                {instructions}
              </pre>
            </details>
          ) : null}
        </div>
      ) : null}

      <ol className="mt-6">
        {steps.map((step, index) => {
          const pipelineStep = pipelineStepFor(step);
          const status = statusFor(pipelineStep, index);
          const classes = statusClasses(status);
          const expanded =
            expandedIndex === index ||
            status === "running" ||
            status === "error";
          const hasInput = step.action === "jd" || step.action === "intake";
          const resultBody = stepResult(pipelineStep);
          return (
            <li key={`${step.action}-${index}`} className="relative pb-5 pl-14">
              {index < steps.length - 1 ? (
                <span
                  aria-hidden="true"
                  className="absolute bottom-0 left-[1.375rem] top-11 w-px bg-gray-300 dark:bg-gray-700"
                />
              ) : null}
              <span
                className={`absolute left-0 top-3 flex h-11 w-11 items-center justify-center rounded-full text-sm font-bold ring-2 ${classes.node}`}
              >
                {statusGlyph(status, index)}
              </span>
              <article className={`rounded-xl border p-4 ${classes.card}`}>
                <button
                  type="button"
                  className="flex w-full items-start justify-between gap-3 text-left"
                  onClick={() => setExpandedIndex(expanded ? undefined : index)}
                >
                  <span className="min-w-0">
                    <span className="block font-semibold text-gray-900 dark:text-gray-100">
                      {step.title}
                    </span>
                    {step.notes ? (
                      <span className="mt-1 block text-sm leading-relaxed text-gray-500 dark:text-gray-400">
                        {step.notes}
                      </span>
                    ) : null}
                  </span>
                  <span
                    className={`shrink-0 rounded-full px-2.5 py-1 text-[0.6875rem] font-semibold uppercase tracking-wide ${classes.label}`}
                  >
                    {t(`workflow.status.${status}`)}
                  </span>
                </button>

                {expanded && step.action === "jd" ? (
                  <div className="mt-4 grid gap-3 border-t border-gray-200 pt-4 dark:border-gray-800">
                    <label className="block">
                      <span className="field-label">{t("workflow.runRole")}</span>
                      <input
                        className="field-input"
                        value={roleTitle}
                        disabled={busy || Boolean(result)}
                        onChange={(event) => setRoleTitle(event.target.value)}
                      />
                    </label>
                    <label className="block">
                      <span className="field-label">
                        {t("workflow.runResponsibilities")}
                      </span>
                      <textarea
                        className="field-input"
                        rows={3}
                        value={responsibilities}
                        disabled={busy || Boolean(result)}
                        onChange={(event) => setResponsibilities(event.target.value)}
                      />
                    </label>
                    <label className="block">
                      <span className="field-label">
                        {t("workflow.runQualifications")}
                      </span>
                      <textarea
                        className="field-input"
                        rows={3}
                        value={qualifications}
                        disabled={busy || Boolean(result)}
                        onChange={(event) => setQualifications(event.target.value)}
                      />
                    </label>
                    <label className="block">
                      <span className="field-label">{t("workflow.runLocation")}</span>
                      <input
                        className="field-input"
                        value={location}
                        disabled={busy || Boolean(result)}
                        onChange={(event) => setLocation(event.target.value)}
                      />
                    </label>
                  </div>
                ) : null}

                {expanded && step.action === "intake" ? (
                  <div className="mt-4 border-t border-gray-200 pt-4 dark:border-gray-800">
                    <p className="field-label">{t("workflow.runResumes")}</p>
                    <div className="mt-1 flex flex-wrap items-center gap-3">
                      <button
                        type="button"
                        className="btn-secondary"
                        disabled={busy || Boolean(result)}
                        onClick={() => void pickFolder()}
                      >
                        {t("workflow.runPickFolder")}
                      </button>
                      <span className="text-sm text-gray-500 dark:text-gray-400">
                        {folder ?? t("workflow.runNoFolder")}
                      </span>
                    </div>
                  </div>
                ) : null}

                {!pipelineStep ? (
                  <div
                    className={`mt-4 flex flex-wrap items-center justify-between gap-3 border-t pt-4 ${
                      handDone.includes(index)
                        ? "border-success-muted"
                        : "border-warning-muted"
                    }`}
                  >
                    <p
                      className={`text-sm ${
                        handDone.includes(index)
                          ? "text-success-ink"
                          : "text-warning-ink"
                      }`}
                    >
                      {handDone.includes(index)
                        ? t("workflow.handStepDone")
                        : t("workflow.manualStepHint")}
                    </p>
                    <div className="flex shrink-0 gap-2">
                      <button
                        type="button"
                        className="btn-secondary"
                        onClick={() => onOpenManual(step, index)}
                      >
                        {handDone.includes(index)
                          ? t("workflow.reopenStep")
                          : t("workflow.openStep")}
                      </button>
                      <button
                        type="button"
                        className="btn-secondary"
                        onClick={() => onToggleHandDone(index)}
                      >
                        {handDone.includes(index)
                          ? t("workflow.markUndone")
                          : t("workflow.markDone")}
                      </button>
                    </div>
                  </div>
                ) : null}

                {resultBody ? (
                  <div className="mt-4 border-t border-success-muted pt-4 text-sm text-success-ink">
                    {resultBody}
                  </div>
                ) : null}

                {status === "running" ? (
                  <p className="mt-4 border-t border-brand-200 pt-4 text-sm font-medium text-brand-800 dark:border-brand-800 dark:text-brand-200">
                    {t("workflow.runProgress", {
                      index: progress?.index ?? 1,
                      total: progress?.total ?? plan.steps.length,
                      step: progress?.step ?? pipelineStep ?? "",
                    })}
                  </p>
                ) : null}
              </article>
            </li>
          );
        })}
      </ol>

      {error ? (
        <p className="rounded border border-destructive-muted bg-destructive-soft p-3 text-sm text-destructive-ink">
          {error}
        </p>
      ) : null}

      <div className="sticky bottom-0 mt-2 flex items-center justify-between gap-4 rounded-xl border border-gray-200 bg-white/95 p-4 shadow-lg backdrop-blur dark:border-gray-800 dark:bg-gray-900/95">
        <div>
          <p className="text-sm font-semibold text-gray-900 dark:text-gray-100">
            {result
              ? t("workflow.runDone", {
                  seconds: Math.round(result.timingMs / 100) / 10,
                })
              : t("workflow.readyCount", {
                  count: plan.steps.length,
                })}
          </p>
          {plan.manual.length > 0 ? (
            <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">
              {t("workflow.handProgress", {
                done: steps.filter(
                  (step, index) =>
                    !pipelineStepFor(step) && handDone.includes(index),
                ).length,
                total: plan.manual.length,
              })}
            </p>
          ) : null}
          {!ready && !result ? (
            <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">
              {t("workflow.completeInputs")}
            </p>
          ) : null}
        </div>
        <button
          type="button"
          className="btn-primary shrink-0"
          disabled={busy || !ready || Boolean(result)}
          onClick={() => void run()}
        >
          {busy
            ? t("workflow.running")
            : result
              ? t("workflow.runComplete")
              : t("workflow.runStart")}
        </button>
      </div>
    </section>
  );
}
