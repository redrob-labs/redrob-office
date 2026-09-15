import { useI18n } from "@redrob/ui";
import { FlowsIcon } from "./icons";
import {
  isAutomatedStep,
  stepTemplate,
  type FlowRef,
  type FlowWalk,
} from "./flow-task-link";

/**
 * The strip above the task tabs that says which flow this work belongs to.
 *
 * Without it a task opened from a flow looks exactly like a task opened from
 * the catalog, so the person loses the sequence the moment they start typing.
 */
export function FlowWalkBar({
  walk,
  done,
  activeTemplateId,
  onOpenStep,
  onAdvance,
  onBackToFlow,
  onExit,
}: {
  walk: FlowWalk;
  done: readonly number[];
  activeTemplateId: string | null;
  onOpenStep: (index: number) => void;
  onAdvance: () => void;
  onBackToFlow: () => void;
  onExit: () => void;
}): JSX.Element {
  const { t } = useI18n();
  const steps = walk.flow.steps;
  const current = steps[walk.index];
  const currentTemplateId = current ? stepTemplate(current)?.template.id : undefined;
  const onCurrentStep =
    Boolean(currentTemplateId) && currentTemplateId === activeTemplateId;

  return (
    <div
      className="flex shrink-0 flex-wrap items-center gap-x-3 gap-y-2 border-b border-primary-muted bg-primary-soft px-3 py-2"
      aria-label={t("workflow.walkBar")}
    >
      <span className="flex min-w-0 items-center gap-1.5 text-xs font-semibold text-brand-800 dark:text-brand-200">
        <FlowsIcon className="h-3.5 w-3.5 shrink-0" />
        <span className="truncate">{walk.flow.title}</span>
      </span>

      <ol className="flex min-w-0 flex-wrap items-center gap-1">
        {steps.map((step, index) => {
          const automated = isAutomatedStep(step);
          const finished = done.includes(index);
          const active = index === walk.index;
          const openable = Boolean(stepTemplate(step));
          const tone = finished
            ? "bg-success text-success-foreground ring-success"
            : active
              ? "bg-brand-600 text-white ring-brand-600"
              : automated
                ? "bg-white text-gray-400 ring-gray-200 dark:bg-gray-900 dark:text-gray-600 dark:ring-gray-800"
                : "bg-white text-gray-600 ring-gray-300 hover:bg-gray-100 dark:bg-gray-900 dark:text-gray-300 dark:ring-gray-700 dark:hover:bg-gray-800";
          return (
            <li key={`${step.action}-${index}`}>
              <button
                type="button"
                disabled={!openable}
                onClick={() => onOpenStep(index)}
                title={
                  automated
                    ? t("workflow.stepRunsInFlow", { title: step.title })
                    : step.title
                }
                aria-current={active ? "step" : undefined}
                className={`flex h-6 items-center gap-1 rounded-full px-2 text-[0.6875rem] font-semibold ring-1 ring-inset transition-colors disabled:cursor-default ${tone}`}
              >
                <span>{finished ? "✓" : index + 1}</span>
                {active ? (
                  <span className="max-w-[9rem] truncate font-medium">
                    {step.title}
                  </span>
                ) : null}
              </button>
            </li>
          );
        })}
      </ol>

      <div className="ml-auto flex shrink-0 items-center gap-1.5">
        <span className="text-[0.6875rem] font-medium text-brand-800 dark:text-brand-200">
          {t("workflow.walkStep", {
            index: walk.index + 1,
            total: steps.length,
          })}
        </span>
        {onCurrentStep ? null : (
          <button
            type="button"
            className="btn-secondary px-2.5 py-1 text-xs"
            onClick={() => onOpenStep(walk.index)}
          >
            {t("workflow.openThisStep")}
          </button>
        )}
        <button
          type="button"
          className="btn-primary px-2.5 py-1 text-xs"
          onClick={onAdvance}
        >
          {t("workflow.doneAndNext")}
        </button>
        <button
          type="button"
          className="btn-secondary px-2.5 py-1 text-xs"
          onClick={onBackToFlow}
        >
          {t("workflow.backToFlow")}
        </button>
        <button
          type="button"
          aria-label={t("workflow.leaveWalk")}
          title={t("workflow.leaveWalk")}
          onClick={onExit}
          className="flex h-6 w-6 items-center justify-center rounded text-gray-500 transition-colors hover:bg-white hover:text-gray-800 dark:text-gray-400 dark:hover:bg-gray-800 dark:hover:text-gray-100"
        >
          ×
        </button>
      </div>
    </div>
  );
}

/** The other direction: a task saying which flows it is a step of. */
export function FlowTaskChips({
  matches,
  onStart,
}: {
  matches: readonly { flow: FlowRef; stepIndex: number }[];
  onStart: (flow: FlowRef, stepIndex: number) => void;
}): JSX.Element | null {
  const { t } = useI18n();
  if (matches.length === 0) return null;

  return (
    <div className="flex shrink-0 flex-wrap items-center gap-2 border-b border-gray-200 bg-background-secondary px-3 py-1.5 dark:border-gray-800">
      <span className="text-[0.6875rem] font-medium uppercase tracking-wide text-gray-400 dark:text-gray-500">
        {t("workflow.partOfFlows")}
      </span>
      {matches.map(({ flow, stepIndex }) => (
        <button
          key={flow.key}
          type="button"
          onClick={() => onStart(flow, stepIndex)}
          title={t("workflow.partOfFlowsHint", { title: flow.title })}
          className="flex items-center gap-1.5 rounded-full bg-white px-2.5 py-1 text-xs font-medium text-gray-700 ring-1 ring-inset ring-gray-300 transition-colors hover:bg-primary-soft hover:text-primary-ink hover:ring-primary-muted dark:bg-gray-900 dark:text-gray-300 dark:ring-gray-700"
        >
          <FlowsIcon className="h-3 w-3 shrink-0 text-gray-400" />
          <span className="max-w-[12rem] truncate">{flow.title}</span>
          <span className="text-[0.625rem] font-semibold text-gray-400">
            {t("workflow.stepShort", {
              index: stepIndex + 1,
              total: flow.steps.length,
            })}
          </span>
        </button>
      ))}
    </div>
  );
}
