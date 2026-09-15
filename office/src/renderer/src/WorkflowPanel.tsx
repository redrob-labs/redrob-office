import { useEffect, useState } from "react";
import { useI18n } from "@redrob/ui";
import type {
  SaveWorkflowRequest,
  WorkflowTriggerStatusView,
  WorkflowTriggerView,
  WorkflowView,
} from "../../shared/office-api";
import {
  WORKFLOW_ACTIONS,
  workflowActionSpec,
  type WorkflowActionId,
} from "../../shared/workflow-actions";
import { handleSubmitHotkey } from "./submit-hotkey";
import { moveWorkflowStep, withStepNotes } from "./workflow-pipeline";

type DraftStep = SaveWorkflowRequest["steps"][number];

/** The editor offers exactly the actions chat can save, from one shared list. */
type StepKindId = WorkflowActionId;

export type FlowSelection =
  | { kind: "new" }
  | { kind: "preset"; draft: SaveWorkflowRequest }
  | { kind: "saved"; workflow: WorkflowView };

function kindForStep(step: DraftStep): StepKindId {
  const match = WORKFLOW_ACTIONS.find(
    (kind) =>
      kind.action !== "custom" &&
      kind.action === step.action &&
      kind.engine === step.engine,
  );
  return match?.action ?? "custom";
}

function kindLabelKey(action: string): string {
  return `workflow.kind.${action}`;
}

/** The first step of a brand-new skill should not presume the kind of work. */
function blankDraft(workspaceId: string, t: (key: string) => string): SaveWorkflowRequest {
  return {
    workspaceId,
    title: "",
    steps: [
      {
        engine: "process",
        action: "custom",
        title: t("workflow.kind.custom"),
      },
    ],
  };
}

export function WorkflowPanel({
  workspaceId,
  selection = { kind: "new" },
  embedded = false,
  onSaved,
}: {
  workspaceId: string;
  selection?: FlowSelection;
  embedded?: boolean;
  onSaved?: (workflow: WorkflowView) => void;
}): JSX.Element {
  const { t } = useI18n();
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [instructions, setInstructions] = useState("");
  const [slug, setSlug] = useState("");
  const [steps, setSteps] = useState<DraftStep[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [triggerType, setTriggerType] =
    useState<WorkflowTriggerView["type"]>("manual");
  const [intervalMinutes, setIntervalMinutes] = useState("60");
  const [cron, setCron] = useState("0 9 * * 1-5");
  const [targetChannelId, setTargetChannelId] = useState("general");
  const [channels, setChannels] = useState<Array<{ id: string; name: string }>>([]);
  const [runStatus, setRunStatus] = useState<WorkflowTriggerStatusView | null>(null);

  function applyDraft(draft: SaveWorkflowRequest): void {
    setTitle(draft.title);
    setDescription(draft.description ?? "");
    setInstructions(draft.instructions ?? "");
    setSlug(draft.slug ?? "");
    setSteps(draft.steps.map((step) => ({ ...step })));
    setTriggerType(draft.trigger?.type ?? "manual");
    if (draft.trigger?.intervalMinutes) {
      setIntervalMinutes(String(draft.trigger.intervalMinutes));
    }
    if (draft.trigger?.cron) setCron(draft.trigger.cron);
    setTargetChannelId(draft.trigger?.targetChannelId ?? "general");
    setError(null);
    setMessage(null);
  }

  // Where a scheduled result can be posted, in the words of the sidebar.
  useEffect(() => {
    let live = true;
    void window.office
      .floorSnapshot()
      .then((snapshot) => {
        if (!live) return;
        setChannels(
          snapshot.channels.map((channel) => ({
            id: channel.id,
            name: channel.name,
          })),
        );
      })
      .catch(() => undefined);
    return () => {
      live = false;
    };
  }, []);

  const savedId = selection.kind === "saved" ? selection.workflow.id : "";
  useEffect(() => {
    if (!savedId) {
      setRunStatus(null);
      return;
    }
    let live = true;
    const load = (): void => {
      void window.office
        .workflowTriggerStatus()
        .then((all) => {
          if (!live) return;
          setRunStatus(all.find((item) => item.workflowId === savedId) ?? null);
        })
        .catch(() => undefined);
    };
    load();
    // A schedule that fires while this panel is open should show it.
    const timer = window.setInterval(load, 15_000);
    return () => {
      live = false;
      window.clearInterval(timer);
    };
  }, [savedId]);

  useEffect(() => {
    if (selection.kind === "new") {
      applyDraft(blankDraft(workspaceId, (key) => t(key)));
      return;
    }
    if (selection.kind === "preset") {
      applyDraft(selection.draft);
      return;
    }
    applyDraft({
      workspaceId: selection.workflow.workspaceId,
      title: selection.workflow.title,
      ...(selection.workflow.description
        ? { description: selection.workflow.description }
        : {}),
      ...(selection.workflow.instructions
        ? { instructions: selection.workflow.instructions }
        : {}),
      slug: selection.workflow.id.includes("/")
        ? selection.workflow.id.slice(selection.workflow.id.indexOf("/") + 1)
        : selection.workflow.id,
      steps: selection.workflow.steps.map(
        ({ engine, action, title: stepTitle, registryId, notes }) => ({
          engine,
          action,
          title: stepTitle,
          ...(registryId ? { registryId } : {}),
          ...(notes ? { notes } : {}),
        }),
      ),
      ...(selection.workflow.trigger ? { trigger: selection.workflow.trigger } : {}),
    });
    // selection identity drives reload; t is used only for blank defaults
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    workspaceId,
    selection.kind,
    selection.kind === "preset" ? selection.draft.slug : "",
    selection.kind === "saved" ? selection.workflow.id : "",
  ]);

  function setStepKind(index: number, kindId: StepKindId): void {
    const kind = workflowActionSpec(kindId) ?? workflowActionSpec("custom")!;
    setSteps((current) =>
      current.map((step, i) => {
        if (i !== index) return step;
        const next: DraftStep = {
          engine: kind.engine,
          action: kind.action,
          title: t(kindLabelKey(kind.action)),
        };
        if (kind.registryId) next.registryId = kind.registryId;
        if (step.notes) next.notes = step.notes;
        return next;
      }),
    );
  }

  function updateTitle(index: number, value: string): void {
    setSteps((current) =>
      current.map((step, i) => (i === index ? { ...step, title: value } : step)),
    );
  }

  function updateNotes(index: number, value: string): void {
    setSteps((current) => withStepNotes(current, index, value));
  }

  function addStep(): void {
    const kind = workflowActionSpec("custom")!;
    setSteps((current) => [
      ...current,
      {
        engine: kind.engine,
        action: kind.action,
        title: t(kindLabelKey(kind.action)),
      },
    ]);
  }

  function removeStep(index: number): void {
    setSteps((current) => current.filter((_, i) => i !== index));
  }

  function moveStep(index: number, delta: number): void {
    setSteps((current) =>
      moveWorkflowStep(current, index, index + delta),
    );
  }

  function dropStep(index: number): void {
    if (dragIndex === null) return;
    setSteps((current) => moveWorkflowStep(current, dragIndex, index));
    setDragIndex(null);
  }

  function finishPointerDrag(clientX: number, clientY: number): void {
    if (dragIndex === null) return;
    const target = document
      .elementFromPoint(clientX, clientY)
      ?.closest<HTMLElement>("[data-workflow-step-index]");
    const index = Number(target?.dataset["workflowStepIndex"]);
    if (Number.isInteger(index)) dropStep(index);
    else setDragIndex(null);
  }

  function draftTrigger(): WorkflowTriggerView {
    if (triggerType === "interval") {
      return {
        type: "interval",
        intervalMinutes: Number(intervalMinutes),
        targetChannelId,
        enabled: true,
      };
    }
    if (triggerType === "cron") {
      return {
        type: "cron",
        cron: cron.trim(),
        targetChannelId,
        enabled: true,
      };
    }
    return { type: "manual" };
  }

  async function save(): Promise<void> {
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      const result = await window.office.saveWorkflow({
        workspaceId,
        title,
        ...(description.trim() ? { description: description.trim() } : {}),
        ...(instructions.trim() ? { instructions: instructions.trim() } : {}),
        ...(slug.trim() ? { slug: slug.trim() } : {}),
        steps,
        trigger: draftTrigger(),
      });
      setMessage(t("workflow.saved", { title: result.workflow.title }));
      onSaved?.(result.workflow);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  const shell = embedded ? "flex flex-col gap-5" : "panel";

  return (
    <div
      className={shell}
      onKeyDown={(event) =>
        handleSubmitHotkey(
          event,
          !busy && Boolean(title.trim()) && steps.length > 0,
          () => void save(),
        )
      }
    >
      <div className={embedded ? "" : "surface p-6"}>
        <label className="block">
          <span className="field-label">{t("workflow.name")}</span>
          <input
            className="field-input"
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            placeholder={t("workflow.nameHint")}
          />
        </label>

        <label className="mt-4 block">
          <span className="field-label">{t("workflow.describe")}</span>
          <textarea
            className="field-input"
            rows={2}
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            placeholder={t("workflow.describeHint")}
          />
          <span className="mt-1 block text-xs text-gray-500 dark:text-gray-400">
            {t("workflow.describeWhy")}
          </span>
        </label>

        <div className="mt-6 flex items-center justify-between gap-3">
          <p className="font-semibold tracking-tight">{t("workflow.steps")}</p>
          <button type="button" className="btn-secondary" onClick={addStep}>
            {t("workflow.addStep")}
          </button>
        </div>

        <ol
          className="mt-4"
          onPointerUp={(event) =>
            finishPointerDrag(event.clientX, event.clientY)
          }
          onPointerCancel={() => setDragIndex(null)}
        >
          {steps.map((step, index) => (
            <li
              // Keyed by position, never by the title. With the title in the
              // key, typing one letter changed the key, React threw the row
              // away and rebuilt it, the input lost focus, and the rest of the
              // sentence went nowhere: step titles could only ever be one
              // character long.
              key={`${step.action}-${index}`}
              data-workflow-step-index={index}
              className={`relative pb-5 pl-12 ${
                dragIndex === index ? "opacity-50" : ""
              }`}
            >
              {index < steps.length - 1 ? (
                <span
                  aria-hidden="true"
                  className="absolute bottom-0 left-[1.125rem] top-9 w-px bg-gray-300 dark:bg-gray-700"
                />
              ) : null}
              <span
                onPointerDown={(event) => {
                  if (busy) return;
                  event.preventDefault();
                  event.currentTarget.setPointerCapture(event.pointerId);
                  setDragIndex(index);
                }}
                title={t("workflow.dragStep")}
                className="absolute left-0 top-3 flex h-9 w-9 touch-none select-none items-center justify-center rounded-full bg-white text-sm font-bold text-brand-600 shadow-sm ring-1 ring-gray-300 cursor-grab active:cursor-grabbing dark:bg-gray-800 dark:text-brand-300 dark:ring-gray-700"
              >
                {index + 1}
              </span>
              <div className="rounded-lg bg-gray-50 p-4 ring-1 ring-inset ring-gray-300 dark:bg-gray-900 dark:ring-gray-700">
                <div className="mb-3 flex items-center justify-between gap-3">
                  <span className="text-xs font-medium text-gray-500 dark:text-gray-400">
                    {t("workflow.dragStep")}
                  </span>
                  <span className="rounded-full bg-white px-2 py-1 text-[0.6875rem] font-semibold uppercase tracking-wide text-gray-500 ring-1 ring-gray-200 dark:bg-gray-800 dark:text-gray-300 dark:ring-gray-700">
                    {t("workflow.editBadge")}
                  </span>
                </div>
                <div className="flex flex-wrap items-center gap-3">
                <select
                  className="min-w-[10rem] flex-1 rounded border-0 bg-white px-3 py-2.5 text-sm font-medium ring-1 ring-inset ring-gray-200 dark:bg-gray-800 dark:text-gray-100 dark:ring-gray-700"
                  value={kindForStep(step)}
                  onChange={(event) => setStepKind(index, event.target.value as StepKindId)}
                >
                  {WORKFLOW_ACTIONS.map((kind) => (
                    <option key={kind.action} value={kind.action}>
                      {t(kindLabelKey(kind.action))}
                    </option>
                  ))}
                </select>
                <input
                  className="min-w-[12rem] flex-[2] rounded border-0 bg-white px-3 py-2.5 text-sm ring-1 ring-inset ring-gray-200 dark:bg-gray-800 dark:text-gray-100 dark:placeholder:text-gray-500 dark:ring-gray-700"
                  value={step.title}
                  onChange={(event) => updateTitle(index, event.target.value)}
                  placeholder={t("workflow.stepTitle")}
                />
                </div>
                <textarea
                  className="mt-3 w-full rounded border-0 bg-white px-3 py-2.5 text-sm ring-1 ring-inset ring-gray-200 dark:bg-gray-800 dark:text-gray-100 dark:placeholder:text-gray-500 dark:ring-gray-700"
                  rows={2}
                  value={step.notes ?? ""}
                  onChange={(event) => updateNotes(index, event.target.value)}
                  placeholder={t("workflow.stepNotes")}
                />
                <div className="mt-3 flex flex-wrap gap-2">
                  <button
                    type="button"
                    className="btn-secondary"
                    disabled={index === 0}
                    onClick={() => moveStep(index, -1)}
                  >
                    {t("workflow.moveUp")}
                  </button>
                  <button
                    type="button"
                    className="btn-secondary"
                    disabled={index === steps.length - 1}
                    onClick={() => moveStep(index, 1)}
                  >
                    {t("workflow.moveDown")}
                  </button>
                  <button type="button" className="btn-secondary" onClick={() => removeStep(index)}>
                    {t("workflow.removeStep")}
                  </button>
                </div>
              </div>
            </li>
          ))}
        </ol>

        <div className="mt-6 rounded-lg bg-gray-50 p-4 ring-1 ring-inset ring-gray-300 dark:bg-gray-900 dark:ring-gray-700">
          <p className="font-semibold tracking-tight">{t("workflow.scheduleTitle")}</p>
          <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
            {t("workflow.scheduleWhy")}
          </p>
          <div className="mt-3 flex flex-wrap items-end gap-3">
            <label className="block">
              <span className="field-label">{t("workflow.scheduleWhen")}</span>
              <select
                className="select-input"
                value={triggerType}
                onChange={(event) =>
                  setTriggerType(event.target.value as WorkflowTriggerView["type"])
                }
              >
                <option value="manual">{t("workflow.scheduleManual")}</option>
                <option value="interval">{t("workflow.scheduleInterval")}</option>
                <option value="cron">{t("workflow.scheduleCron")}</option>
              </select>
            </label>

            {triggerType === "interval" ? (
              <label className="block">
                <span className="field-label">{t("workflow.scheduleEveryMinutes")}</span>
                <input
                  className="field-input w-28"
                  type="number"
                  min={1}
                  value={intervalMinutes}
                  onChange={(event) => setIntervalMinutes(event.target.value)}
                />
              </label>
            ) : null}

            {triggerType === "cron" ? (
              <label className="block">
                <span className="field-label">{t("workflow.scheduleCronLine")}</span>
                <input
                  className="field-input w-48 font-mono"
                  value={cron}
                  onChange={(event) => setCron(event.target.value)}
                  placeholder="0 9 * * 1-5"
                />
              </label>
            ) : null}

            {triggerType !== "manual" ? (
              <label className="block">
                <span className="field-label">{t("workflow.scheduleReportIn")}</span>
                <select
                  className="select-input"
                  value={targetChannelId}
                  onChange={(event) => setTargetChannelId(event.target.value)}
                >
                  {channels.length === 0 ? (
                    <option value="general">general</option>
                  ) : (
                    channels.map((channel) => (
                      <option key={channel.id} value={channel.id}>
                        {channel.name}
                      </option>
                    ))
                  )}
                </select>
              </label>
            ) : null}
          </div>
          {triggerType === "cron" ? (
            <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">
              {t("workflow.scheduleCronHint")}
            </p>
          ) : null}
          {runStatus ? (
            <p className="mt-3 text-xs text-gray-600 dark:text-gray-300">
              {runStatus.lastRunAt
                ? t("workflow.scheduleLastRun", {
                    when: new Date(runStatus.lastRunAt).toLocaleString(),
                    status:
                      runStatus.lastStatus === "failed"
                        ? t("workflow.scheduleFailed")
                        : t("workflow.scheduleOk"),
                  })
                : t("workflow.scheduleArmed", {
                    when: new Date(runStatus.armedAt).toLocaleString(),
                  })}
              {runStatus.lastSummary ? (
                <span className="mt-1 block italic opacity-80">
                  {runStatus.lastSummary}
                </span>
              ) : null}
            </p>
          ) : null}
        </div>

        <div className="mt-5 flex flex-wrap gap-2">
          <button
            type="button"
            className="btn-primary"
            disabled={busy || !title.trim() || steps.length === 0}
            onClick={() => void save()}
          >
            {busy ? t("workflow.working") : t("workflow.save")}
          </button>
        </div>
        {error ? (
          <p className="mt-3 rounded border border-destructive-muted bg-destructive-soft p-3 text-sm text-destructive-ink">
            {error}
          </p>
        ) : null}
        {message ? (
          <p className="mt-3 text-sm text-gray-600 dark:text-gray-300">{message}</p>
        ) : null}
      </div>
    </div>
  );
}
