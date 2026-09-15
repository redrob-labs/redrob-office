import type { ChannelEventView, TeamMemberView } from "../../shared/office-api";
import { useI18n } from "@redrob/ui";

/** The built-in teammate, which is shown as Redrob rather than by its id. */
const ASSISTANT_ID = "assistant";

/**
 * Sibling transcript blocks for non-message channel events.
 * Kept as siblings of messages so streaming layout does not jump.
 */
/**
 * One line of "who is doing what right now", shared by the transcript block and
 * the live indicator under the last message so a long turn keeps talking back.
 */
export function progressLabel(
  event: ChannelEventView,
  t: (key: string, vars?: Record<string, string | number>) => string,
  nameOf: (id: string) => string,
): string {
  const said = String(event.payload["role"] ?? "");
  // The built-in teammate travels as `assistant`, and nobody in the office is
  // called that: it is Redrob wherever it is named.
  const role =
    said && said.toLowerCase() !== ASSISTANT_ID
      ? said
      : nameOf(event.authorId || ASSISTANT_ID);
  const activity = String(event.payload["activity"] ?? "thinking");
  const target = String(event.payload["target"] ?? "");
  const key = target
    ? `floor.progress.${activity}At`
    : `floor.progress.${activity}`;
  return t(key, { role, target });
}

export function ChannelEventBlock({
  event,
  members,
  onResolveApproval,
  onOpenArtifact,
}: {
  event: ChannelEventView;
  members: readonly TeamMemberView[];
  onResolveApproval?: (
    approvalId: string,
    approved: boolean,
    decision: "allow_once" | "allow_session" | "deny",
  ) => void;
  onOpenArtifact?: (artifactId: string) => void;
}): JSX.Element | null {
  const { t } = useI18n();
  const nameOf = (id: string): string => {
    const member = members.find((row) => row.id === id);
    if (member) return member.name;
    return id === ASSISTANT_ID ? t("chat.model") : id;
  };

  // Progress chatter ("이장훈 찾아보는 중") stays off the chat. The answer
  // is enough; the machinery underneath is noise.
  if (event.type === "progress") {
    return null;
  }

  if (event.type === "system") {
    const kind = String(event.payload["kind"] ?? "");
    const name = String(
      event.payload["name"] ?? nameOf(String(event.payload["memberId"] ?? "")),
    );
    if (kind === "invite" && name) {
      return (
        <p className="px-4 py-2 text-center text-xs text-gray-600 dark:text-gray-400">
          {t("chat.systemInvited", { name })}
        </p>
      );
    }
    if (kind === "remove" && name) {
      return (
        <p className="px-4 py-2 text-center text-xs text-gray-600 dark:text-gray-400">
          {t("chat.systemRemoved", { name })}
        </p>
      );
    }
    return null;
  }

  if (event.type === "delegate") {
    const to = String(event.payload["to"] ?? "");
    const reason = String(event.payload["reason"] ?? "");
    const task = String(event.payload["task"] ?? "");
    const permission = String(event.payload["permission"] ?? "");
    return (
      <div className="mx-4 my-2 rounded border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-700 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-200">
        <div className="flex flex-wrap items-center gap-2">
          <p className="font-medium">
            {t("delegate.title", {
              from: nameOf(event.authorId),
              name: nameOf(to),
            })}
          </p>
          {permission ? (
            <span className="rounded-full bg-gray-200 px-2 py-0.5 text-[11px] font-medium text-gray-600 dark:bg-gray-800 dark:text-gray-300">
              {t("delegate.access", { permission })}
            </span>
          ) : null}
        </div>
        {reason ? (
          <p className="mt-0.5 text-xs text-gray-700 dark:text-gray-300">
            {t("delegate.reason", { reason })}
          </p>
        ) : null}
        {task ? (
          <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
            {t("delegate.task", { task })}
          </p>
        ) : null}
      </div>
    );
  }

  if (event.type === "approval") {
    const tool = String(event.payload["tool"] ?? "tool");
    const approvalId = String(event.payload["approvalId"] ?? "");
    return (
      <div
        id={approvalId ? `approval-${approvalId}` : undefined}
        className="mx-4 my-2 rounded border border-warning-muted bg-warning-soft px-3 py-2 text-sm"
      >
        <p className="font-medium text-warning-ink">
          {nameOf(event.authorId)} · {tool}
        </p>
        <div className="mt-2 flex flex-wrap gap-2">
          <button
            type="button"
            className="btn-secondary px-2.5 py-1 text-xs"
            onClick={() =>
              approvalId
                ? onResolveApproval?.(approvalId, true, "allow_once")
                : undefined
            }
          >
            {t("delegate.allowOnce")}
          </button>
          <button
            type="button"
            className="btn-secondary px-2.5 py-1 text-xs"
            onClick={() =>
              approvalId
                ? onResolveApproval?.(approvalId, true, "allow_session")
                : undefined
            }
          >
            {t("delegate.allowSession")}
          </button>
          <button
            type="button"
            className="btn-secondary px-2.5 py-1 text-xs"
            onClick={() =>
              approvalId
                ? onResolveApproval?.(approvalId, false, "deny")
                : undefined
            }
          >
            {t("floor.reject")}
          </button>
        </div>
      </div>
    );
  }

  if (event.type === "artifact") {
    const label = String(event.payload["label"] ?? "File");
    const artifactId = String(event.payload["artifactId"] ?? "");
    return (
      <div className="mx-4 my-2 flex items-center justify-between gap-2 rounded border border-gray-200 bg-white px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-900">
        <span className="min-w-0 truncate font-medium text-gray-800 dark:text-gray-200">
          {label}
        </span>
        {artifactId ? (
          <button
            type="button"
            className="btn-secondary shrink-0 px-2.5 py-1 text-xs"
            onClick={() => onOpenArtifact?.(artifactId)}
          >
            {t("floor.open")}
          </button>
        ) : null}
      </div>
    );
  }

  return null;
}

