import { useRef, useState, type ReactNode } from "react";
import { useI18n } from "@redrob/ui";
import type { FloorChannel, TeamMemberView } from "../../shared/office-api";
import {
  CHAT_PANE_TABS,
  CHAT_PANE_TITLE,
  isChatPaneOpen,
  nextChatPaneTab,
  type ChatPane,
  type ChatPaneTab,
} from "./chat-pane";
import { BrandLogo } from "./BrandLogo";
import { MemberAvatar } from "./MemberAvatar";
import { PERMISSION_LABEL, TeammateCard } from "./TeammateCard";
import {
  ArtifactsIcon,
  ChartIcon,
  PlusIcon,
  UsersIcon,
  XIcon,
} from "./icons";

const TAB_ICON: Record<
  ChatPaneTab,
  (props: { className?: string }) => JSX.Element
> = {
  summary: ChartIcon,
  files: ArtifactsIcon,
  members: UsersIcon,
};

/** A file this conversation produced, as the transcript knows it. */
export interface ChatPaneFile {
  id: string;
  title: string;
  kind: string;
}

/**
 * The tab bar over the conversation: summary, files, who is in here, pinned.
 *
 * It is a switcher rather than navigation - each tab opens its view in the
 * right-hand pane and clicking the open one closes the pane again, so nothing
 * ever takes the conversation off the screen.
 */
export function ChatPaneBar({
  active,
  counts,
  onSelect,
}: {
  active: ChatPane | null;
  counts: Partial<Record<ChatPaneTab, number>>;
  onSelect: (tab: ChatPaneTab) => void;
}): JSX.Element {
  const { t } = useI18n();
  const tabRefs = useRef(new Map<ChatPaneTab, HTMLButtonElement>());

  return (
    <div
      role="tablist"
      aria-label={t("chat.paneTabs")}
      aria-orientation="horizontal"
      className="flex h-10 shrink-0 items-center gap-1.5 border-b border-gray-200 bg-card px-4 dark:border-gray-800"
    >
      {CHAT_PANE_TABS.map((id) => {
        const Icon = TAB_ICON[id];
        const label = t(CHAT_PANE_TITLE[id]);
        const count = counts[id] ?? 0;
        const selected = isChatPaneOpen(active, id);
        return (
          <button
            key={id}
            ref={(node) => {
              if (node) tabRefs.current.set(id, node);
              else tabRefs.current.delete(id);
            }}
            type="button"
            role="tab"
            aria-selected={selected}
            aria-pressed={selected}
            onClick={() => onSelect(id)}
            onKeyDown={(event) => {
              const next = nextChatPaneTab(id, event.key);
              if (!next) return;
              event.preventDefault();
              tabRefs.current.get(next)?.focus();
            }}
            className={`flex shrink-0 items-center gap-1.5 rounded px-2.5 py-1 text-xs font-semibold transition-colors ${
              selected
                ? "bg-white text-gray-900 shadow-sm ring-1 ring-gray-200 dark:bg-gray-800 dark:text-white dark:ring-gray-700"
                : "text-gray-600 hover:bg-gray-100/80 hover:text-gray-900 dark:text-gray-400 dark:hover:bg-gray-800/60 dark:hover:text-white"
            }`}
            title={label}
          >
            <Icon className="h-3.5 w-3.5" />
            <span>{label}</span>
            {count > 0 ? (
              <span
                className={`rounded-full px-1.5 text-[10px] font-bold leading-4 ${
                  selected
                    ? "bg-gray-900 text-white dark:bg-brand-500 dark:text-white"
                    : "bg-gray-200/90 text-gray-700 dark:bg-gray-700 dark:text-gray-300"
                }`}
              >
                {count}
              </span>
            ) : null}
          </button>
        );
      })}
    </div>
  );
}

export function ChatSidePanel({
  pane,
  channel,
  channelLabel,
  members,
  teammates,
  files,
  messageCount,
  artifactSlot,
  artifactTitle,
  onClose,
  onOpenFile,
  onSelectMember,
  onInvite,
  onRemoveMember,
  onAddTeammate,
  onMemberSaved,
  onMemberDeleted,
}: {
  pane: ChatPane;
  channel: FloorChannel | null;
  channelLabel: string;
  /** Only the people invited into this conversation. */
  members: readonly TeamMemberView[];
  /** Everybody in the workspace, for the invite list. */
  teammates: readonly TeamMemberView[];
  files: readonly ChatPaneFile[];
  messageCount: number;
  /** The open document, rendered by the chat that owns its editor state. */
  artifactSlot: ReactNode;
  artifactTitle: string | null;
  onClose: () => void;
  onOpenFile: (artifactId: string) => void;
  onSelectMember: (memberId: string) => void;
  onInvite: (memberId: string) => void;
  onRemoveMember: (memberId: string) => void;
  onAddTeammate: () => void;
  onMemberSaved: (member: TeamMemberView) => void;
  /** The person is gone, and their one-to-one chat with them. */
  onMemberDeleted: (memberId: string) => void;
}): JSX.Element {
  const { t } = useI18n();
  const selectedMember =
    pane.kind === "member"
      ? (teammates.find((row) => row.id === pane.memberId) ?? null)
      : null;
  const heading =
    pane.kind === "artifact"
      ? (artifactTitle ?? t("chat.artifactPane"))
      : pane.kind === "member"
        ? (selectedMember?.name ?? t("chat.paneMember"))
        : t(CHAT_PANE_TITLE[pane.kind]);

  return (
    <aside
      className="flex min-h-0 flex-1 flex-col overflow-hidden bg-card"
      aria-label={heading}
    >
      <div className="flex h-12 shrink-0 items-center justify-between gap-2 border-b border-gray-200 bg-card px-4 dark:border-gray-800">
        <p className="min-w-0 flex-1 truncate text-[0.9375rem] font-bold text-gray-900 dark:text-white">
          {heading}
        </p>
        <button
          type="button"
          className="flex h-7 w-7 items-center justify-center rounded text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-700 dark:text-gray-400 dark:hover:bg-gray-800 dark:hover:text-white"
          title={t("shortcuts.close")}
          aria-label={t("shortcuts.close")}
          onClick={onClose}
        >
          <XIcon className="h-4 w-4" />
        </button>
      </div>

      <div className="flex h-10 shrink-0 items-center justify-between gap-2 border-b border-gray-200 bg-card px-4 dark:border-gray-800">
        {pane.kind === "members" ? (
          <>
            <span className="text-xs font-medium text-gray-500 dark:text-gray-400">
              {members.length} {t("chat.paneMembers")}
            </span>
            {onAddTeammate ? (
              <button
                type="button"
                className="inline-flex items-center gap-1 rounded text-xs font-semibold text-brand-600 transition-colors hover:text-brand-700 dark:text-blue-400 dark:hover:text-blue-300"
                onClick={onAddTeammate}
              >
                <PlusIcon className="h-3.5 w-3.5" />
                <span>{t("team.add")}</span>
              </button>
            ) : null}
          </>
        ) : pane.kind === "files" ? (
          <>
            <span className="text-xs font-medium text-gray-500 dark:text-gray-400">
              {files.length} {t("chat.paneFiles")}
            </span>
            <span className="text-[0.6875rem] text-gray-400 dark:text-gray-500">
              {channelLabel}
            </span>
          </>
        ) : pane.kind === "summary" ? (
          <>
            <span className="text-xs font-medium text-gray-500 dark:text-gray-400">
              {t("chat.paneChannelLabel")}
            </span>
            <span className="text-[0.6875rem] font-semibold text-gray-600 dark:text-gray-300">
              {messageCount} {t("chat.paneMessages")}
            </span>
          </>
        ) : pane.kind === "member" ? (
          <>
            <span className="text-xs font-medium text-gray-500 dark:text-gray-400">
              {selectedMember ? t(PERMISSION_LABEL[selectedMember.permission]) : t("chat.paneMember")}
            </span>
            <span className="text-[0.6875rem] text-gray-400 dark:text-gray-500">
              {channelLabel}
            </span>
          </>
        ) : (
          <span className="truncate text-xs font-medium text-gray-500 dark:text-gray-400">
            {artifactTitle ?? t("chat.artifactPane")}
          </span>
        )}
      </div>

      {pane.kind === "artifact" ? (
        artifactSlot
      ) : pane.kind === "member" ? (
        selectedMember ? (
          <TeammateCard
            member={selectedMember}
            channelId={channel?.id ?? ""}
            onSaved={onMemberSaved}
            onRemoved={() => onMemberDeleted(selectedMember.id)}
          />
        ) : (
          <PaneBody>
            <PaneEmpty>{t("team.empty")}</PaneEmpty>
          </PaneBody>
        )
      ) : pane.kind === "summary" ? (
        <PaneBody>
          <section className="surface px-3 py-2.5 dark:bg-gray-800/60 dark:border-gray-700">
            <PaneLabel>{t("chat.paneChannelLabel")}</PaneLabel>
            <p className="mt-1 text-sm font-medium text-gray-900 dark:text-white">
              {channelLabel}
            </p>
            <p className="mt-1 text-xs leading-relaxed text-gray-600 dark:text-gray-300">
              {channel?.purpose || t("chat.panePurposeEmpty")}
            </p>
          </section>
          <section className="surface px-3 py-2.5 dark:bg-gray-800/60 dark:border-gray-700">
            <PaneLabel>{t("chat.paneCounts")}</PaneLabel>
            <dl className="mt-1.5 grid grid-cols-3 gap-2 text-xs">
              <div>
                <dt className="text-gray-700 dark:text-gray-400">{t("chat.paneMessages")}</dt>
                <dd className="font-medium text-gray-900 dark:text-white">{messageCount}</dd>
              </div>
              <div>
                <dt className="text-gray-700 dark:text-gray-400">{t("chat.paneFiles")}</dt>
                <dd className="font-medium text-gray-900 dark:text-white">{files.length}</dd>
              </div>
              <div>
                <dt className="text-gray-700 dark:text-gray-400">{t("chat.paneMembers")}</dt>
                <dd className="font-medium text-gray-900 dark:text-white">{members.length}</dd>
              </div>
            </dl>
          </section>
        </PaneBody>
      ) : pane.kind === "files" ? (
        <PaneBody>
          {files.length === 0 ? (
            <PaneEmpty>{t("chat.paneFilesEmpty")}</PaneEmpty>
          ) : (
            files.map((file) => (
              <button
                key={file.id}
                type="button"
                className="surface flex items-center gap-2 px-3 py-2 text-left transition-colors hover:bg-gray-50 dark:bg-gray-800/60 dark:border-gray-700 dark:hover:bg-gray-800"
                onClick={() => onOpenFile(file.id)}
              >
                <ArtifactsIcon className="h-4 w-4 shrink-0 text-gray-600 dark:text-gray-400" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium text-gray-900 dark:text-white">
                    {file.title}
                  </span>
                  <span className="block truncate text-[0.6875rem] text-gray-700 dark:text-gray-400">
                    {file.kind}
                  </span>
                </span>
              </button>
            ))
          )}
        </PaneBody>
      ) : (
        <MembersPane
          members={members}
          teammates={teammates}
          // Everybody is in #general, so there is nobody to invite or show out.
          manageMembers={channel?.id !== "general" && !channel?.isDM}
          onSelectMember={onSelectMember}
          onInvite={onInvite}
          onRemoveMember={onRemoveMember}
          onAddTeammate={onAddTeammate}
        />
      )}
    </aside>
  );
}

/**
 * Who is in this conversation, and who is not yet.
 *
 * The list is the channel's members, not the whole workspace: an office where
 * everybody is in every room is an office where nobody knows who is listening.
 */
function MembersPane({
  members,
  teammates,
  manageMembers,
  onSelectMember,
  onInvite,
  onRemoveMember,
  onAddTeammate,
}: {
  members: readonly TeamMemberView[];
  teammates: readonly TeamMemberView[];
  /**
   * False where the guest list is not a choice: everybody is in `#general`, and
   * a chat with one person is that person.
   */
  manageMembers: boolean;
  onSelectMember: (memberId: string) => void;
  onInvite: (memberId: string) => void;
  onRemoveMember: (memberId: string) => void;
  onAddTeammate: () => void;
}): JSX.Element {
  const { t } = useI18n();
  const memberIds = new Set(members.map((row) => row.id));
  const invitable = teammates.filter((row) => !memberIds.has(row.id));

  return (
    <PaneBody>
      {members.length === 0 ? (
        <PaneEmpty>{t("chat.paneMembersEmpty")}</PaneEmpty>
      ) : (
        members.map((member) => (
          <div
            key={member.id}
            className="surface flex items-center gap-2 px-3 py-2 dark:bg-gray-800/60 dark:border-gray-700"
          >
            <button
              type="button"
              className="flex min-w-0 flex-1 items-center gap-2 text-left"
              onClick={() => onSelectMember(member.id)}
            >
              <MemberFace member={member} />
              <span className="min-w-0 flex-1">
                <span className="flex min-w-0 items-center gap-1.5">
                  <span className="min-w-0 truncate text-sm font-medium text-gray-900 dark:text-white">
                    {member.name}
                  </span>
                  <span className="shrink-0 rounded bg-gray-100 px-1.5 text-[0.625rem] font-bold uppercase leading-4 text-gray-700 dark:bg-gray-700 dark:text-gray-200">
                    {t(PERMISSION_LABEL[member.permission])}
                  </span>
                </span>
                {member.persona ? (
                  <span className="block truncate text-[0.6875rem] text-gray-700 dark:text-gray-400">
                    {member.persona}
                  </span>
                ) : null}
              </span>
            </button>
            {member.builtin || !manageMembers ? null : (
              <button
                type="button"
                className="shrink-0 rounded px-2 py-1 text-[0.6875rem] font-medium text-gray-700 transition-colors hover:bg-gray-100 hover:text-gray-900 dark:text-gray-300 dark:hover:bg-gray-700 dark:hover:text-white"
                onClick={() => onRemoveMember(member.id)}
              >
                {t("chat.paneMemberRemove")}
              </button>
            )}
          </div>
        ))
      )}

      {manageMembers ? <PaneLabel>{t("chat.paneInvite")}</PaneLabel> : null}
      {!manageMembers ? null : invitable.length === 0 ? (
        <p className="px-1 text-xs text-gray-600 dark:text-gray-400">
          {t("chat.paneInviteEmpty")}
        </p>
      ) : (
        invitable.map((member) => (
          <div
            key={member.id}
            className="flex items-center gap-2 rounded px-3 py-1.5 hover:bg-gray-50 dark:hover:bg-gray-800"
          >
            <MemberFace member={member} />
            <span className="min-w-0 flex-1 truncate text-sm text-gray-700 dark:text-gray-300">
              {member.name}
            </span>
            <button
              type="button"
              className="btn-secondary shrink-0 px-2 py-1 text-[0.6875rem]"
              onClick={() => onInvite(member.id)}
            >
              {t("chat.paneInviteAction")}
            </button>
          </div>
        ))
      )}
      {!manageMembers ? null : (
        <button
          type="button"
          className="flex items-center gap-1.5 rounded px-3 py-2 text-sm font-medium text-gray-600 transition-colors hover:bg-gray-50 hover:text-gray-900 dark:text-gray-300 dark:hover:bg-gray-800 dark:hover:text-white"
          onClick={onAddTeammate}
        >
          <PlusIcon className="h-3.5 w-3.5" />
          {t("team.add")}
        </button>
      )}
    </PaneBody>
  );
}

/** The built-in teammate wears the product mark; everybody else wears initials. */
function MemberFace({ member }: { member: TeamMemberView }): JSX.Element {
  return member.builtin ? (
    <BrandLogo
      variant="mark"
      className="h-6 w-6 shrink-0 rounded ring-1 ring-gray-900/5"
    />
  ) : (
    <MemberAvatar name={member.name} seed={member.id} size="sm" />
  );
}

function PaneBody({ children }: { children: ReactNode }): JSX.Element {
  return (
    <div className="min-h-0 flex-1 overflow-y-auto px-3 py-3">
      <div className="flex flex-col gap-2">{children}</div>
    </div>
  );
}

function PaneLabel({ children }: { children: ReactNode }): JSX.Element {
  return (
    <p className="px-1 pt-1 text-[0.6875rem] font-bold uppercase tracking-wider text-gray-600 dark:text-gray-400">
      {children}
    </p>
  );
}

function PaneEmpty({ children }: { children: ReactNode }): JSX.Element {
  return <p className="py-10 text-center text-sm text-gray-600 dark:text-gray-400">{children}</p>;
}
