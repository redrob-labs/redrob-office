import { useMemo, useState, type CSSProperties } from "react";
import { useI18n } from "@redrob/ui";
import { BrandLogo } from "./BrandLogo";
import { MemberAvatar } from "./MemberAvatar";
import {
  ChatIcon,
  DeviceIcon,
  DocumentsIcon,
  FlowsIcon,
  HashIcon,
  MoonIcon,
  PanelLeftCloseIcon,
  PanelLeftOpenIcon,
  PencilIcon,
  PlusIcon,
  SearchIcon,
  SettingsIcon,
  StarIcon,
  SunIcon,
  TrashIcon,
} from "./icons";
import { ShortcutsTrigger } from "./ShortcutsMap";
import { modKeyLabel } from "./submit-hotkey";
import type { ShellTab } from "./shell-nav-state";

const SEARCH_MIN_ROWS = 3;

/**
 * A chat in the Slack-style sidebar.
 *
 * A channel is a chat: one room, one conversation, one row. A one-to-one chat
 * is addressed to a teammate/persona with an avatar and live status.
 */
export type ChatRow = {
  /** Channel id for a room, member id for a one-to-one chat. */
  id: string;
  kind: "channel" | "dm";
  name: string;
  pinned: boolean;
  /** Whether anything has been said here yet. */
  messageCount: number;
  /** #general: the address the whole workspace shares. Not renamed, not deleted. */
  system: boolean;
  /** The built-in teammate, drawn with the product mark. */
  builtin?: boolean;
  updatedAt?: number | string;
  createdAt?: number | string;
};

export type ChatSessionsPanelProps = {
  /** Active application shell tab */
  tab?: ShellTab | undefined;
  /** Select shell tab (chat, flows, documents, device, settings) */
  onSelectTab?: ((tab: ShellTab) => void) | undefined;
  alertCount?: number | undefined;
  shortcutsOpen?: boolean | undefined;
  onOpenShortcuts?: ((open: boolean) => void) | undefined;
  resolvedTheme?: ("light" | "dark") | undefined;
  onToggleTheme?: (() => void) | undefined;

  /** The rooms, #general first. */
  rooms: readonly ChatRow[];
  /** One row per teammate, whether or not anything has been said yet. */
  dms: readonly ChatRow[];
  /** Which row is open: channel id, or member id while in a one-to-one chat. */
  activeId: string;
  /** A turn is in flight — switching or deleting is blocked. */
  busy: boolean;
  /** History has finished loading from disk. */
  ready: boolean;
  collapsed: boolean;
  style?: CSSProperties | undefined;
  onToggleCollapsed: () => void;
  /** Starts a chat, which is to say makes a room. */
  onNewChat: () => void;
  onOpen: (row: ChatRow) => void;
  onRename: (channelId: string, name: string) => void;
  onTogglePin: (row: ChatRow, pinned: boolean) => void;
  onDelete: (channelId: string) => void;
  onAddTeammate: () => void;
};

export function recencyScore(row: ChatRow): number {
  if (row.updatedAt) {
    const ts =
      typeof row.updatedAt === "number"
        ? row.updatedAt
        : Date.parse(String(row.updatedAt));
    if (!Number.isNaN(ts) && ts > 0) return ts;
  }
  if (row.createdAt) {
    const ts =
      typeof row.createdAt === "number"
        ? row.createdAt
        : Date.parse(String(row.createdAt));
    if (!Number.isNaN(ts) && ts > 0) return ts;
  }
  return 0;
}

export function ChatSessionsPanel({
  tab = "chat",
  onSelectTab,
  alertCount = 0,
  shortcutsOpen = false,
  onOpenShortcuts,
  resolvedTheme = "light",
  onToggleTheme,
  rooms,
  dms,
  activeId,
  busy,
  ready,
  collapsed,
  style,
  onToggleCollapsed,
  onNewChat,
  onOpen,
  onRename,
  onTogglePin,
  onDelete,
  onAddTeammate,
}: ChatSessionsPanelProps): JSX.Element {
  const { t } = useI18n();
  const [query, setQuery] = useState("");
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameDraft, setRenameDraft] = useState("");
  const [channelsCollapsed, setChannelsCollapsed] = useState(false);
  const [dmsCollapsed, setDmsCollapsed] = useState(false);

  const trimmedQuery = query.trim().toLowerCase();
  const matches = (row: ChatRow): boolean =>
    !trimmedQuery || row.name.toLowerCase().includes(trimmedQuery);

  // Recency sorted lists (newest first)
  const sortedRooms = useMemo(() => {
    return [...rooms].sort((a, b) => {
      const scoreA = recencyScore(a);
      const scoreB = recencyScore(b);
      if (scoreA !== scoreB) return scoreB - scoreA;
      if (a.system !== b.system) return a.system ? -1 : 1;
      return a.name.localeCompare(b.name);
    });
  }, [rooms]);

  const sortedDms = useMemo(() => {
    return [...dms].sort((a, b) => {
      const scoreA = recencyScore(a);
      const scoreB = recencyScore(b);
      if (scoreA > 0 || scoreB > 0) {
        if (scoreA !== scoreB) return scoreB - scoreA;
      }
      if (a.builtin !== b.builtin) return a.builtin ? -1 : 1;
      return a.name.localeCompare(b.name);
    });
  }, [dms]);

  // Pinned items (channels and DMs) sorted by recency
  const starred = useMemo(() => {
    return [...rooms, ...dms]
      .filter((row) => row.pinned && matches(row))
      .sort((a, b) => recencyScore(b) - recencyScore(a));
  }, [rooms, dms, matches]);

  const roomRows = useMemo(() => {
    return sortedRooms.filter((row) => !row.pinned && matches(row));
  }, [sortedRooms, matches]);

  const dmRows = useMemo(() => {
    return sortedDms.filter((row) => !row.pinned && matches(row));
  }, [sortedDms, matches]);

  const showSearch = rooms.length + dms.length >= SEARCH_MIN_ROWS;

  function commitRename(row: ChatRow): void {
    const name = renameDraft.replace(/\s+/g, " ").trim();
    setRenamingId(null);
    if (name) onRename(row.id, name);
  }

  function beginRename(row: ChatRow): void {
    setRenamingId(row.id);
    setRenameDraft(row.name);
  }

  const primaryNavItems = [
    {
      id: "chat" as const,
      label: t("shell.chat"),
      hint: `${modKeyLabel()}+1`,
      Icon: ChatIcon,
      tourId: "nav-chat",
    },
    {
      id: "flows" as const,
      label: t("shell.flows"),
      hint: `${modKeyLabel()}+2`,
      Icon: FlowsIcon,
      tourId: "nav-flows",
    },
    {
      id: "documents" as const,
      label: t("shell.documents"),
      hint: `${modKeyLabel()}+3`,
      Icon: DocumentsIcon,
      tourId: "nav-documents",
    },
  ];

  if (collapsed) {
    return (
      <aside
        className="flex w-14 shrink-0 flex-col items-center gap-1 border-r border-gray-200 bg-card py-3 dark:border-gray-800"
        aria-label={t("chat.historyPanel")}
      >
        <button
          type="button"
          className="flex h-8 w-8 items-center justify-center rounded text-gray-700 transition-colors hover:bg-white hover:text-gray-900 hover:shadow-sm dark:text-gray-300 dark:hover:bg-gray-800 dark:hover:text-white"
          title={t("shell.expandSidebarHint", { chord: `${modKeyLabel()}+\\` })}
          aria-label={t("shell.expandSidebarHint", { chord: `${modKeyLabel()}+\\` })}
          onClick={onToggleCollapsed}
        >
          <PanelLeftOpenIcon className="h-4 w-4" />
        </button>

        <button
          type="button"
          className="my-1 flex h-8 w-8 items-center justify-center rounded bg-gray-900 text-white shadow-sm transition-opacity hover:opacity-90 disabled:opacity-30 dark:bg-blue-600"
          title={t("chat.newChat")}
          aria-label={t("chat.newChat")}
          disabled={busy || !ready}
          onClick={onNewChat}
        >
          <PlusIcon className="h-4 w-4" />
        </button>

        {/* Primary Tabs */}
        <div className="flex w-full flex-col items-center gap-1 border-y border-gray-200/80 py-2 dark:border-gray-800">
          {primaryNavItems.map(({ id, label, hint, Icon, tourId }) => {
            const active = tab === id;
            return (
              <button
                key={id}
                type="button"
                data-tour={tourId}
                className={`flex h-8 w-8 items-center justify-center rounded transition-colors ${
                  active
                    ? "bg-gray-900 text-white shadow-sm dark:bg-blue-600 dark:text-white"
                    : "text-gray-700 hover:bg-white hover:text-gray-900 hover:shadow-sm dark:text-gray-400 dark:hover:bg-gray-800 dark:hover:text-white"
                }`}
                title={`${label} (${hint})`}
                aria-label={`${label} (${hint})`}
                aria-current={active ? "page" : undefined}
                onClick={() => onSelectTab?.(id)}
              >
                <Icon className="h-4 w-4" />
              </button>
            );
          })}
        </div>

        {/* Quick Channels / DMs */}
        <div className="flex min-h-0 flex-1 flex-col items-center gap-1 overflow-y-auto py-1">
          {sortedRooms.slice(0, 4).map((row) => {
            const active = tab === "chat" && row.id === activeId;
            return (
              <button
                key={row.id}
                type="button"
                className={`flex h-8 w-8 items-center justify-center rounded transition-colors ${
                  active
                    ? "bg-white text-gray-900 shadow-sm ring-1 ring-gray-200 dark:bg-gray-800 dark:text-white dark:ring-gray-700"
                    : "text-gray-600 hover:bg-white hover:text-gray-900 hover:shadow-sm dark:text-gray-400 dark:hover:bg-gray-800 dark:hover:text-white"
                }`}
                title={`#${row.name}`}
                aria-label={`#${row.name}`}
                aria-current={active ? "true" : undefined}
                disabled={busy}
                onClick={() => onOpen(row)}
              >
                <HashIcon className="h-4 w-4" />
              </button>
            );
          })}
        </div>

        {/* Bottom Actions */}
        <div className="mt-auto flex w-full flex-col items-center gap-1 border-t border-gray-200/80 pt-2 dark:border-gray-800">
          {onToggleTheme ? (
            <button
              type="button"
              className="flex h-8 w-8 items-center justify-center rounded text-gray-700 transition-colors hover:bg-white hover:text-gray-900 hover:shadow-sm dark:text-gray-300 dark:hover:bg-gray-800 dark:hover:text-white"
              title={t("settings.appearanceTitle")}
              aria-label={t("settings.appearanceTitle")}
              onClick={onToggleTheme}
            >
              {resolvedTheme === "dark" ? (
                <SunIcon className="h-4 w-4 text-spectrum-orange" />
              ) : (
                <MoonIcon className="h-4 w-4" />
              )}
            </button>
          ) : null}

          {onOpenShortcuts ? (
            <ShortcutsTrigger
              open={shortcutsOpen}
              onOpenChange={onOpenShortcuts}
              expanded={false}
            />
          ) : null}

          <button
            type="button"
            className={`relative flex h-8 w-8 items-center justify-center rounded transition-colors ${
              tab === "device"
                ? "bg-gray-900 text-white dark:bg-blue-600 dark:text-white"
                : "text-gray-700 hover:bg-white hover:text-gray-900 hover:shadow-sm dark:text-gray-400 dark:hover:bg-gray-800 dark:hover:text-white"
            }`}
            title={`${t("tabs.device")} (${modKeyLabel()}+Shift+D)`}
            aria-label={`${t("tabs.device")} (${modKeyLabel()}+Shift+D)`}
            onClick={() => onSelectTab?.("device")}
          >
            <DeviceIcon className="h-4 w-4" />
            {alertCount > 0 ? (
              <span className="absolute right-1 top-1 h-2 w-2 rounded-full bg-destructive ring-2 ring-white dark:ring-gray-900" />
            ) : null}
          </button>

          <button
            type="button"
            className={`flex h-8 w-8 items-center justify-center rounded transition-colors ${
              tab === "settings"
                ? "bg-gray-900 text-white dark:bg-blue-600 dark:text-white"
                : "text-gray-700 hover:bg-white hover:text-gray-900 hover:shadow-sm dark:text-gray-400 dark:hover:bg-gray-800 dark:hover:text-white"
            }`}
            title={`${t("tabs.settings")} (${modKeyLabel()}+,)`}
            aria-label={`${t("tabs.settings")} (${modKeyLabel()}+,)`}
            onClick={() => onSelectTab?.("settings")}
          >
            <SettingsIcon className="h-4 w-4" />
          </button>
        </div>
      </aside>
    );
  }

  function renderRow(row: ChatRow): JSX.Element {
    const active = tab === "chat" && row.id === activeId;
    const renaming = renamingId === row.id;
    if (renaming) {
      return (
        <li key={`${row.kind}-${row.id}`} className="px-2">
          <form
            onSubmit={(event) => {
              event.preventDefault();
              commitRename(row);
            }}
          >
            <input
              autoFocus
              value={renameDraft}
              onChange={(event) => setRenameDraft(event.target.value)}
              onBlur={() => commitRename(row)}
              onKeyDown={(event) => {
                if (event.key === "Escape") {
                  event.preventDefault();
                  setRenamingId(null);
                }
              }}
              className="w-full rounded border border-gray-300 bg-white px-2.5 py-1 text-xs text-gray-900 outline-none ring-brand-500/30 focus:border-brand-500 focus:ring-2 dark:border-gray-700 dark:bg-gray-800 dark:text-white"
              aria-label={t("chat.renameChat")}
            />
          </form>
        </li>
      );
    }

    const editable = row.kind === "channel" && !row.system;

    return (
      <li key={`${row.kind}-${row.id}`} className="group/row px-2">
        <div
          className={`flex items-stretch gap-0.5 rounded transition-colors ${
            active
              ? "bg-white shadow-[var(--shadow-soft)] ring-1 ring-gray-200 dark:bg-gray-800 dark:ring-gray-700"
              : "hover:bg-gray-200/60 dark:hover:bg-gray-800/60"
          }`}
        >
          <button
            type="button"
            className="flex min-w-0 flex-1 items-center gap-2 rounded px-2.5 py-1.5 text-left"
            disabled={busy}
            onClick={() => onOpen(row)}
            onDoubleClick={(event) => {
              if (!editable) return;
              event.preventDefault();
              beginRename(row);
            }}
            title={row.kind === "channel" ? `#${row.name}` : row.name}
            aria-current={active ? "true" : undefined}
          >
            {/*
              One 24px slot for every row, whoever is in it. Redrob's mark used
              to be 16px next to 24px teammate avatars, and an 8px corner on a
              16px square is just a circle — so the one row people open most
              looked like a different kind of thing from the rest of the list.
            */}
            <span className="flex h-6 w-6 shrink-0 items-center justify-center">
              {row.kind === "channel" ? (
                <HashIcon className="h-4 w-4 text-gray-500 dark:text-gray-400" />
              ) : row.builtin ? (
                <BrandLogo
                  variant="mark"
                  theme={resolvedTheme === "dark" ? "onDark" : "light"}
                  className="h-6 w-6 rounded ring-1 ring-gray-900/5 dark:ring-white/10"
                />
              ) : (
                <MemberAvatar name={row.name} seed={row.id} size="sm" />
              )}
            </span>
            <span
              className={`min-w-0 flex-1 truncate text-xs leading-4 ${
                active
                  ? "font-semibold text-gray-900 dark:text-white"
                  : "font-medium text-gray-700 dark:text-gray-300"
              }`}
            >
              {row.name}
            </span>
          </button>
          <div
            className={`flex shrink-0 items-center gap-0.5 py-0.5 pr-1 transition-opacity ${
              active || row.pinned
                ? "opacity-100"
                : "opacity-0 focus-within:opacity-100 group-hover/row:opacity-100"
            }`}
          >
            {row.messageCount > 0 ? (
              <button
                type="button"
                className={`flex h-6 w-6 items-center justify-center rounded transition-colors ${
                  row.pinned
                    ? "text-warning hover:bg-warning-soft"
                    : "text-gray-400 hover:bg-gray-100 hover:text-gray-700 dark:text-gray-500 dark:hover:bg-gray-700 dark:hover:text-gray-200"
                }`}
                title={row.pinned ? t("chat.unpinChat") : t("chat.pinChat")}
                aria-label={row.pinned ? t("chat.unpinChat") : t("chat.pinChat")}
                onClick={() => onTogglePin(row, !row.pinned)}
              >
                <StarIcon className="h-3.5 w-3.5" filled={row.pinned} />
              </button>
            ) : null}
            {editable ? (
              <>
                <button
                  type="button"
                  className="flex h-6 w-6 items-center justify-center rounded text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-700 dark:text-gray-500 dark:hover:bg-gray-700 dark:hover:text-gray-200"
                  title={t("chat.renameChat")}
                  aria-label={t("chat.renameChat")}
                  onClick={() => beginRename(row)}
                >
                  <PencilIcon className="h-3.5 w-3.5" />
                </button>
                <button
                  type="button"
                  className="flex h-6 w-6 items-center justify-center rounded text-gray-400 transition-colors hover:bg-destructive-soft hover:text-destructive-ink dark:text-gray-500"
                  title={t("chat.deleteChat")}
                  aria-label={t("chat.deleteChat")}
                  onClick={() => {
                    setRenamingId(null);
                    onDelete(row.id);
                  }}
                >
                  <TrashIcon className="h-3.5 w-3.5" />
                </button>
              </>
            ) : null}
          </div>
        </div>
      </li>
    );
  }

  return (
    <aside
      className="flex min-h-0 shrink-0 flex-col border-r border-gray-200 bg-card dark:border-gray-800"
      style={style}
      aria-label={t("chat.historyPanel")}
    >
      {/* Workspace Header & Action */}
      <div className="flex h-12 shrink-0 items-center justify-between gap-2 border-b border-gray-200 px-3 dark:border-gray-800">
        <div className="flex min-w-0 items-center gap-2">
          <BrandLogo
            variant="full"
            theme={resolvedTheme === "dark" ? "onDark" : "light"}
            className="h-5 w-auto max-w-[6.5rem]"
          />
        </div>
        <div className="flex items-center gap-1">
          <button
            type="button"
            className="flex h-8 w-8 items-center justify-center rounded bg-gray-900 text-white shadow-sm transition-all hover:bg-gray-800 active:scale-[0.95] disabled:opacity-40 dark:bg-blue-600 dark:hover:bg-blue-500"
            title={t("chat.newChat")}
            aria-label={t("chat.newChat")}
            disabled={busy || !ready}
            onClick={onNewChat}
          >
            <PlusIcon className="h-4 w-4" />
          </button>
          <button
            type="button"
            className="flex h-8 w-8 items-center justify-center rounded text-gray-500 transition-all hover:bg-white hover:text-gray-800 active:scale-[0.95] dark:text-gray-400 dark:hover:bg-gray-800 dark:hover:text-white"
            title={t("shell.collapseSidebarHint", { chord: `${modKeyLabel()}+\\` })}
            aria-label={t("shell.collapseSidebarHint", { chord: `${modKeyLabel()}+\\` })}
            onClick={onToggleCollapsed}
          >
            <PanelLeftCloseIcon className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* Global Navigation Section (Slack style) */}
      <nav
        className="flex shrink-0 flex-col gap-0.5 px-2 pb-2 pt-2"
        aria-label={t("shell.nav")}
      >
        {primaryNavItems.map(({ id, label, hint, Icon, tourId }) => {
          const active = tab === id;
          return (
            <button
              key={id}
              type="button"
              data-tour={tourId}
              aria-label={`${label} (${hint})`}
              aria-current={active ? "page" : undefined}
              onClick={() => onSelectTab?.(id)}
              className={`flex h-8 items-center gap-2.5 rounded px-2.5 text-left text-xs font-medium transition-colors ${
                active
                  ? "bg-gray-900 text-white shadow-sm dark:bg-blue-600 dark:text-white"
                  : "text-gray-700 hover:bg-gray-200/60 hover:text-gray-900 dark:text-gray-300 dark:hover:bg-gray-800 dark:hover:text-white"
              }`}
            >
              <Icon className="h-4 w-4 shrink-0" />
              <span className="min-w-0 flex-1 truncate">{label}</span>
              <span
                className={`text-[0.625rem] ${
                  active ? "text-gray-300 dark:text-blue-200" : "text-gray-400 dark:text-gray-500"
                }`}
              >
                {hint}
              </span>
            </button>
          );
        })}
      </nav>

      {/* Search Input */}
      {showSearch ? (
        <div className="shrink-0 px-2.5 pb-2">
          <div className="flex items-center gap-2 rounded border border-transparent bg-white px-2.5 py-1.5 shadow-[var(--shadow-soft)] focus-within:border-gray-300 dark:bg-gray-800 dark:focus-within:border-gray-600">
            <SearchIcon className="h-3.5 w-3.5 shrink-0 text-gray-400 dark:text-gray-500" />
            <input
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder={t("chat.historySearch")}
              aria-label={t("chat.historySearch")}
              className="min-w-0 flex-1 bg-transparent text-xs text-gray-800 outline-none placeholder:text-gray-400 dark:text-gray-100 dark:placeholder:text-gray-500"
            />
          </div>
        </div>
      ) : null}

      {/*
        Two scrollers, not one. With ninety-odd channels a single list pushed the
        DM section past the bottom of the panel, so the handful of people someone
        talks to every day were the hardest rows in the app to reach. Channels
        take the space that is left over and scroll inside it; DMs keep their own
        capped strip anchored just above the workspace bar.
      */}
      <div className="flex min-h-0 flex-1 flex-col">
        <div className="min-h-0 flex-1 overflow-y-auto pb-2">
          {/* Pinned Section */}
          {starred.length > 0 ? (
            <section className="mb-2">
              <h3 className="px-3 pb-1 pt-1 text-[0.6875rem] font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400">
                {t("chat.pinned")}
              </h3>
              <ul className="flex flex-col gap-0.5">{starred.map(renderRow)}</ul>
            </section>
          ) : null}

          {/* Channels Section */}
          <section className="mb-2">
            {/*
              Sticky, not scrolled away: the caret that collapses ninety-odd
              channels is the way out of a long list, so it has to stay reachable
              while that list moves under it. The background is the panel's own,
              or rows would show through as they pass beneath.
            */}
            <div className="sticky top-0 z-10 flex items-center justify-between bg-card px-3 pb-1 pt-1">
              <button
                type="button"
                className="flex items-center gap-1 text-[0.6875rem] font-bold uppercase tracking-wider text-gray-500 hover:text-gray-800 dark:text-gray-400 dark:hover:text-gray-200"
                onClick={() => setChannelsCollapsed(!channelsCollapsed)}
              >
                <span>{channelsCollapsed ? "▸" : "▾"}</span>
                <span>{t("chat.channelsHeading")}</span>
                <span className="text-[0.625rem] font-normal text-gray-400">
                  ({roomRows.length})
                </span>
              </button>
              <button
                type="button"
                className="flex h-6 w-6 items-center justify-center rounded text-gray-400 hover:bg-white hover:text-gray-700 dark:hover:bg-gray-800 dark:hover:text-gray-200"
                title={t("chat.newChat")}
                onClick={onNewChat}
              >
                <PlusIcon className="h-3.5 w-3.5" />
              </button>
            </div>
            {!channelsCollapsed && (
              <>
                {roomRows.length === 0 ? (
                  trimmedQuery ? (
                    <p className="px-4 py-3 text-center text-xs leading-relaxed text-gray-500">
                      {t("chat.historySearchEmpty", { query: query.trim() })}
                    </p>
                  ) : null
                ) : (
                  <ul className="flex flex-col gap-0.5">
                    {roomRows.map(renderRow)}
                  </ul>
                )}
              </>
            )}
          </section>
        </div>

        {/* Direct Messages Section — its own scroller, so channels cannot push it away */}
        <section className="flex shrink-0 flex-col border-t border-gray-200/80 dark:border-gray-800">
          <div className="flex shrink-0 items-center justify-between px-3 pb-1 pt-2">
            <button
              type="button"
              className="flex items-center gap-1 text-[0.6875rem] font-bold uppercase tracking-wider text-gray-500 hover:text-gray-800 dark:text-gray-400 dark:hover:text-gray-200"
              onClick={() => setDmsCollapsed(!dmsCollapsed)}
            >
              <span>{dmsCollapsed ? "▸" : "▾"}</span>
              <span>{t("team.directMessages")}</span>
              <span className="text-[0.625rem] font-normal text-gray-400">
                ({dmRows.length})
              </span>
            </button>
            <button
              type="button"
              className="flex h-6 w-6 items-center justify-center rounded text-gray-400 hover:bg-white hover:text-gray-700 dark:hover:bg-gray-800 dark:hover:text-gray-200"
              title={t("team.add")}
              aria-label={t("team.add")}
              onClick={onAddTeammate}
            >
              <PlusIcon className="h-3.5 w-3.5" />
            </button>
          </div>
          {!dmsCollapsed && (
            <>
              {dmRows.length === 0 ? (
                <p className="px-4 py-2 text-[0.6875rem] leading-relaxed text-gray-500 dark:text-gray-400">
                  {t("team.empty")}
                </p>
              ) : (
                // Capped rather than free-growing: a long teammate list must not
                // take the panel back from the channels.
                <div className="max-h-56 min-h-0 overflow-y-auto pb-2">
                  <ul className="flex flex-col gap-0.5">
                    {dmRows.map(renderRow)}
                  </ul>
                </div>
              )}
            </>
          )}
        </section>
      </div>

      {/* Bottom User / Workspace Bar */}
      <div className="flex shrink-0 flex-col gap-0.5 border-t border-gray-200/80 p-2 dark:border-gray-800">
        <div className="flex items-center justify-between gap-1">
          {onToggleTheme ? (
            <button
              type="button"
              className="flex h-8 flex-1 items-center gap-2 rounded px-2 text-xs font-medium text-gray-700 transition-colors hover:bg-white hover:text-gray-900 hover:shadow-sm dark:text-gray-300 dark:hover:bg-gray-800 dark:hover:text-white"
              title={
                resolvedTheme === "dark"
                  ? t("settings.themeSwitchToLight")
                  : t("settings.themeSwitchToDark")
              }
              onClick={onToggleTheme}
            >
              {resolvedTheme === "dark" ? (
                <SunIcon className="h-3.5 w-3.5 text-spectrum-orange" />
              ) : (
                <MoonIcon className="h-3.5 w-3.5" />
              )}
              <span className="truncate">
                {resolvedTheme === "dark"
                  ? t("settings.themeSwitchToLight")
                  : t("settings.themeSwitchToDark")}
              </span>
            </button>
          ) : null}

          {onOpenShortcuts ? (
            <ShortcutsTrigger
              open={shortcutsOpen}
              onOpenChange={onOpenShortcuts}
              expanded={false}
            />
          ) : null}
        </div>

        <div className="flex items-center gap-1">
          <button
            type="button"
            className={`flex h-8 flex-1 items-center gap-2 rounded px-2 text-left text-xs font-semibold transition-all active:scale-[0.98] ${
              tab === "device"
                ? "bg-gray-900 text-white shadow-sm dark:bg-blue-600 dark:text-white"
                : "text-gray-700 hover:bg-white hover:text-gray-900 hover:shadow-sm dark:text-gray-300 dark:hover:bg-gray-800 dark:hover:text-white"
            }`}
            onClick={() => onSelectTab?.("device")}
          >
            <DeviceIcon className="h-3.5 w-3.5 shrink-0" />
            <span className="truncate">{t("tabs.device")}</span>
            {alertCount > 0 ? (
              <span className="ml-auto shrink-0 rounded bg-destructive px-1.5 py-0.2 text-[0.625rem] font-bold text-destructive-foreground">
                {alertCount}
              </span>
            ) : null}
          </button>

          <button
            type="button"
            className={`flex h-8 items-center gap-1.5 rounded px-2 text-left text-xs font-semibold transition-all active:scale-[0.98] ${
              tab === "settings"
                ? "bg-gray-900 text-white shadow-sm dark:bg-blue-600 dark:text-white"
                : "text-gray-700 hover:bg-white hover:text-gray-900 hover:shadow-sm dark:text-gray-300 dark:hover:bg-gray-800 dark:hover:text-white"
            }`}
            title={`${t("tabs.settings")} (${modKeyLabel()}+,)`}
            onClick={() => onSelectTab?.("settings")}
          >
            <SettingsIcon className="h-3.5 w-3.5 shrink-0" />
            <span className="truncate">{t("tabs.settings")}</span>
          </button>
        </div>
      </div>
    </aside>
  );
}
