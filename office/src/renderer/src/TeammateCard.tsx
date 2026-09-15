import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useI18n } from "@redrob/ui";
import type {
  ChannelMemoryView,
  TeamMemberView,
  ToolPermissionView,
} from "../../shared/office-api";
import { BrandLogo } from "./BrandLogo";
import { MemberAvatar } from "./MemberAvatar";
import { SparklesIcon } from "./icons";

export const PERMISSION_LABEL: Record<ToolPermissionView, string> = {
  read: "team.permissionRead",
  write: "team.permissionWrite",
  full: "team.permissionFull",
};

const PERMISSION_HINT: Record<ToolPermissionView, string> = {
  read: "team.permissionHintRead",
  write: "team.permissionHintWrite",
  full: "team.permissionHintFull",
};

const PERMISSIONS: readonly ToolPermissionView[] = ["read", "write", "full"];

/**
 * How far this teammate's hands reach. Three answers, not a tool checklist:
 * reading, producing files, and running the machine are the only distinctions a
 * person has an opinion about when they hand work to somebody.
 */
export function PermissionPicker({
  value,
  disabled,
  onChange,
}: {
  value: ToolPermissionView;
  disabled?: boolean;
  onChange: (next: ToolPermissionView) => void;
}): JSX.Element {
  const { t } = useI18n();
  return (
    <div>
      <p className="text-xs font-medium text-gray-600 dark:text-gray-400">
        {t("team.permissionLabel")}
      </p>
      <div className="mt-1 flex gap-1 rounded bg-gray-100 p-1 dark:bg-gray-800">
        {PERMISSIONS.map((id) => {
          const selected = id === value;
          return (
            <button
              key={id}
              type="button"
              aria-pressed={selected}
              disabled={disabled}
              className={`flex-1 rounded px-2 py-1.5 text-xs font-semibold transition-colors disabled:opacity-40 ${
                selected
                  ? "bg-gray-900 text-white shadow-sm dark:bg-brand-500"
                  : "text-gray-700 hover:bg-white hover:text-gray-900 dark:text-gray-300 dark:hover:bg-gray-700 dark:hover:text-white"
              }`}
              onClick={() => onChange(id)}
            >
              {t(PERMISSION_LABEL[id])}
            </button>
          );
        })}
      </div>
      <p className="mt-1 text-[0.6875rem] leading-relaxed text-gray-700 dark:text-gray-400">
        {t(PERMISSION_HINT[value])}
      </p>
    </div>
  );
}

/**
 * One teammate's profile, read beside the conversation the way Slack shows a
 * person: who they are, how they talk, and what they know in this channel.
 *
 * The one setting here is reach - read, write or full - because that is a
 * question about trust rather than about our internals.
 */
export function TeammateCard({
  member,
  channelId,
  onSaved,
  onRemoved,
}: {
  member: TeamMemberView;
  channelId: string;
  onSaved: (member: TeamMemberView) => void;
  /** Called once the person is gone, along with their one-to-one chat. */
  onRemoved?: () => void;
}): JSX.Element {
  const { t } = useI18n();
  const [name, setName] = useState(member.name);
  const [persona, setPersona] = useState(member.persona);
  const [tone, setTone] = useState(member.toneHints);
  const [permission, setPermission] = useState<ToolPermissionView>(
    member.permission,
  );
  const [memories, setMemories] = useState<ChannelMemoryView[]>([]);
  const [draft, setDraft] = useState("");
  const [allowPromote, setAllowPromote] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setName(member.name);
    setPersona(member.persona);
    setTone(member.toneHints);
    setPermission(member.permission);
  }, [member]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const rows = await window.office.listChannelMemories({
          channelId,
          memberId: member.id,
          includeShared: true,
        });
        if (!cancelled) setMemories(rows);
      } catch {
        if (!cancelled) setMemories([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [channelId, member.id]);

  async function save(): Promise<void> {
    setBusy(true);
    setError(null);
    try {
      const result = await window.office.updateTeamMember(member.id, {
        name,
        persona,
        toneHints: tone,
        permission,
      });
      if (!result.ok) {
        setError(result.reason);
        return;
      }
      onSaved(result.member);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  async function remove(): Promise<void> {
    if (!window.confirm(t("team.removeConfirm", { name: member.name }))) return;
    setBusy(true);
    setError(null);
    try {
      const result = await window.office.removeTeamMember(member.id);
      if (!result.ok) {
        setError(result.reason);
        return;
      }
      onRemoved?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  async function addMemory(): Promise<void> {
    const content = draft.trim();
    if (!content) return;
    setBusy(true);
    setError(null);
    try {
      const row = await window.office.addChannelMemory({
        channelId,
        memberId: member.id,
        content,
      });
      setMemories((prev) => [...prev, row]);
      setDraft("");
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  async function promote(id: string): Promise<void> {
    if (!allowPromote) return;
    setBusy(true);
    setError(null);
    try {
      const row = await window.office.promoteChannelMemory(id, channelId);
      if (row) {
        setMemories((prev) =>
          prev.map((item) => (item.id === id ? row : item)),
        );
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex h-full min-h-0 flex-col bg-white dark:bg-gray-900">
      <div className="min-h-0 flex-1 space-y-3 overflow-auto px-3 py-3">
        <div className="flex items-center gap-2.5">
          {member.builtin ? (
            <BrandLogo
              variant="mark"
              className="h-9 w-9 shrink-0 rounded ring-1 ring-gray-900/5 dark:ring-white/10"
            />
          ) : (
            <MemberAvatar name={member.name} seed={member.id} />
          )}
          <div className="min-w-0">
            <p className="truncate text-sm font-bold text-gray-900 dark:text-white">
              {member.name}
            </p>
            {member.persona ? (
              <p className="truncate text-xs text-gray-700 dark:text-gray-300">{member.persona}</p>
            ) : null}
          </div>
        </div>
        <label className="block text-xs font-medium text-gray-600 dark:text-gray-400">
          {t("team.nameLabel")}
          <input
            className="mt-1 w-full rounded border border-gray-200 bg-white px-2.5 py-1.5 text-sm text-gray-900 dark:border-gray-700 dark:bg-gray-800 dark:text-white"
            value={name}
            onChange={(event) => setName(event.target.value)}
            disabled={busy}
          />
          <span className="mt-0.5 block text-[0.6875rem] font-normal text-gray-700 dark:text-gray-400">
            {t("team.nameHint")}
          </span>
        </label>
        <label className="block text-xs font-medium text-gray-600 dark:text-gray-400">
          {t("team.persona")}
          <textarea
            className="mt-1 min-h-[5rem] w-full rounded border border-gray-200 bg-white px-2.5 py-1.5 text-sm text-gray-900 dark:border-gray-700 dark:bg-gray-800 dark:text-white"
            value={persona}
            onChange={(event) => setPersona(event.target.value)}
            disabled={busy}
          />
        </label>
        <label className="block text-xs font-medium text-gray-600 dark:text-gray-400">
          {t("team.tone")}
          <textarea
            className="mt-1 min-h-[3rem] w-full rounded border border-gray-200 bg-white px-2.5 py-1.5 text-sm text-gray-900 dark:border-gray-700 dark:bg-gray-800 dark:text-white"
            value={tone}
            onChange={(event) => setTone(event.target.value)}
            disabled={busy}
          />
        </label>
        <PermissionPicker
          value={permission}
          disabled={busy}
          onChange={setPermission}
        />
        <div>
          <p className="text-xs font-medium text-gray-600 dark:text-gray-400">{t("team.knows")}</p>
          {memories.length === 0 ? (
            <p className="mt-1 text-xs text-gray-700 dark:text-gray-400">{t("team.knowsEmpty")}</p>
          ) : (
            <ul className="mt-1 space-y-1.5">
              {memories.map((row) => (
                <li
                  key={row.id}
                  className="rounded border border-gray-100 bg-gray-50 px-2.5 py-1.5 text-xs text-gray-700 dark:border-gray-800 dark:bg-gray-800/60 dark:text-gray-300"
                >
                  <p>{row.content}</p>
                  <div className="mt-1 flex items-center justify-between gap-2">
                    <span className="text-[0.625rem] uppercase tracking-wide text-gray-600 dark:text-gray-400">
                      {row.kind === "shared"
                        ? t("team.memoryShared")
                        : t("team.memoryChannel")}
                    </span>
                    {row.kind === "channel" ? (
                      <button
                        type="button"
                        className="text-[0.6875rem] font-medium text-gray-700 hover:text-gray-800 dark:text-gray-400 dark:hover:text-gray-200 disabled:opacity-40"
                        disabled={!allowPromote || busy}
                        onClick={() => void promote(row.id)}
                      >
                        {t("team.promote")}
                      </button>
                    ) : null}
                  </div>
                </li>
              ))}
            </ul>
          )}
          <label className="mt-2 flex items-center gap-2 text-[0.6875rem] text-gray-600 dark:text-gray-400">
            <input
              type="checkbox"
              checked={allowPromote}
              onChange={(event) => setAllowPromote(event.target.checked)}
            />
            {t("team.promoteEnable")}
          </label>
          <div className="mt-2 flex gap-2">
            <input
              className="min-w-0 flex-1 rounded border border-gray-200 bg-white px-2.5 py-1.5 text-sm text-gray-900 dark:border-gray-700 dark:bg-gray-800 dark:text-white"
              placeholder={t("team.memoryPlaceholder")}
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              disabled={busy}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  void addMemory();
                }
              }}
            />
            <button
              type="button"
              className="btn-secondary shrink-0 px-2.5 py-1 text-xs"
              disabled={busy || !draft.trim()}
              onClick={() => void addMemory()}
            >
              {t("team.addMemory")}
            </button>
          </div>
        </div>

        {error ? <p className="text-xs text-destructive-ink">{error}</p> : null}
      </div>
      <div className="flex gap-2 border-t border-gray-200 px-3 py-2 dark:border-gray-800">
        <button
          type="button"
          className="btn-primary min-w-0 flex-1 px-3 py-1.5 text-sm"
          disabled={busy}
          onClick={() => void save()}
        >
          {t("team.save")}
        </button>
        {member.builtin ? null : (
          <button
            type="button"
            className="shrink-0 rounded px-3 py-1.5 text-sm font-semibold text-destructive-ink transition-colors hover:bg-destructive-soft disabled:opacity-40"
            disabled={busy}
            onClick={() => void remove()}
          >
            {t("team.remove")}
          </button>
        )}
      </div>
    </div>
  );
}

/**
 * Slack's "add teammates": a name, a line about what they do, and they are in.
 *
 * Everything else about them is editable afterwards from their profile, which
 * is where you find out you wanted it changed.
 */
export function AddTeammateDialog({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: (member: TeamMemberView) => void;
}): JSX.Element {
  const { t, locale } = useI18n();
  const [name, setName] = useState("");
  const [persona, setPersona] = useState("");
  const [tone, setTone] = useState("");
  const [permission, setPermission] = useState<ToolPermissionView>("write");
  const [aiPrompt, setAiPrompt] = useState("");
  const [aiGenerating, setAiGenerating] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const nameRef = useRef<HTMLInputElement | null>(null);
  const cardRef = useRef<HTMLDivElement | null>(null);
  /** Where focus was inside the card, so pulling it back lands where it was. */
  const lastFieldRef = useRef<HTMLElement | null>(null);

  /**
   * The chat composer behind this modal takes focus back.
   *
   * ProseMirror refocuses its editor on its own schedule - after a turn ends,
   * after a paint, after a click it thinks was its own - and every one of
   * those left the dialog on screen with its fields dead to the keyboard. So
   * focus is claimed after paint and then held: anything landing outside the
   * card while it is open is pulled back to the field it left.
   */
  useEffect(() => {
    const card = cardRef.current;
    const timer = window.setTimeout(() => nameRef.current?.focus(), 0);
    function onFocusIn(event: FocusEvent): void {
      const target = event.target;
      if (target instanceof Node && card?.contains(target)) return;
      (lastFieldRef.current ?? nameRef.current)?.focus();
    }
    document.addEventListener("focusin", onFocusIn);
    return () => {
      window.clearTimeout(timer);
      document.removeEventListener("focusin", onFocusIn);
    };
  }, []);

  async function generateWithAi(): Promise<void> {
    if (!aiPrompt.trim() && !persona.trim() && !name.trim()) return;
    setAiGenerating(true);
    setError(null);
    try {
      const promptToUse = aiPrompt.trim() || persona.trim() || name.trim();
      const generated = await window.office.generatePersona(
        promptToUse,
        locale,
      );
      setName(generated.name);
      setPersona(generated.persona);
      setTone(generated.tone);
      setPermission(generated.permission);
    } catch (err) {
      setError(err instanceof Error ? err.message : t("team.generateError"));
    } finally {
      setAiGenerating(false);
    }
  }

  async function create(): Promise<void> {
    setBusy(true);
    setError(null);
    try {
      const result = await window.office.addTeamMember({
        name,
        persona,
        permission,
        ...(tone.trim() ? { toneHints: tone } : {}),
      });
      if (!result.ok) {
        setError(result.reason);
        return;
      }
      onCreated(result.member);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  return createPortal(
    <div
      className="fixed inset-0 z-[90] flex items-center justify-center bg-gray-900/40 p-4 dark:bg-black/60"
      role="dialog"
      aria-modal="true"
      onMouseDown={onClose}
      onKeyDown={(event) => {
        if (event.key === "Escape") onClose();
        // Nothing behind the modal gets a say in what is typed into it: the
        // window-level shortcut and tour handlers both swallow plain keys.
        event.stopPropagation();
      }}
    >
      <div
        ref={cardRef}
        className="w-full max-w-md rounded border border-gray-200 bg-white p-4 shadow-xl dark:border-gray-800 dark:bg-gray-900"
        onMouseDown={(event) => event.stopPropagation()}
        onFocus={(event) => {
          lastFieldRef.current = event.target as HTMLElement;
        }}
      >
        <p className="text-sm font-semibold text-gray-900 dark:text-white">{t("team.add")}</p>
        <p className="mt-1 text-xs leading-relaxed text-gray-700 dark:text-gray-300">
          {t("team.addDescription")}
        </p>

        {/* AI Persona Auto-Generator Bar */}
        <div className="mt-3 rounded border border-primary-muted bg-primary-soft p-2.5">
          <label className="block text-[0.6875rem] font-semibold text-brand-900 dark:text-brand-300">
            {t("team.autoGenerate")}
          </label>
          <div className="mt-1.5 flex gap-1.5">
            <input
              className="min-w-0 flex-1 rounded border border-brand-200 bg-white px-2.5 py-1 text-xs text-gray-900 placeholder:text-gray-400 focus:border-brand-500 focus:outline-none dark:border-brand-800 dark:bg-gray-800 dark:text-white dark:placeholder:text-gray-500"
              placeholder={t("team.autoGeneratePrompt")}
              value={aiPrompt}
              onChange={(event) => setAiPrompt(event.target.value)}
              disabled={busy || aiGenerating}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  void generateWithAi();
                }
              }}
            />
            <button
              type="button"
              className="flex shrink-0 items-center gap-1 rounded bg-brand-600 px-2.5 py-1 text-xs font-semibold text-white shadow-sm transition-colors hover:bg-brand-700 disabled:opacity-40"
              disabled={busy || aiGenerating || (!aiPrompt.trim() && !persona.trim() && !name.trim())}
              onClick={() => void generateWithAi()}
            >
              <SparklesIcon className="h-3 w-3" />
              <span>
                {aiGenerating
                  ? t("team.generating")
                  : t("team.autoGenerateButton")}
              </span>
            </button>
          </div>
        </div>

        <div className="mt-3 space-y-2">
          <input
            ref={nameRef}
            className="w-full rounded border border-gray-200 bg-white px-2.5 py-1.5 text-sm text-gray-900 dark:border-gray-700 dark:bg-gray-800 dark:text-white"
            placeholder={t("team.nameLabel")}
            value={name}
            onChange={(event) => setName(event.target.value)}
            disabled={busy || aiGenerating}
          />
          <textarea
            className="min-h-[4rem] w-full rounded border border-gray-200 bg-white px-2.5 py-1.5 text-sm text-gray-900 dark:border-gray-700 dark:bg-gray-800 dark:text-white"
            placeholder={t("team.persona")}
            value={persona}
            onChange={(event) => setPersona(event.target.value)}
            disabled={busy || aiGenerating}
          />
          <textarea
            className="min-h-[2.5rem] w-full rounded border border-gray-200 bg-white px-2.5 py-1.5 text-sm text-gray-900 dark:border-gray-700 dark:bg-gray-800 dark:text-white"
            placeholder={t("team.tone")}
            value={tone}
            onChange={(event) => setTone(event.target.value)}
            disabled={busy || aiGenerating}
          />
          <PermissionPicker
            value={permission}
            disabled={busy || aiGenerating}
            onChange={setPermission}
          />
        </div>
        {error ? <p className="mt-2 text-xs text-destructive-ink">{error}</p> : null}
        <div className="mt-3 flex justify-end gap-2">
          <button
            type="button"
            className="btn-secondary px-3 py-1.5 text-sm"
            onClick={onClose}
            disabled={busy || aiGenerating}
          >
            {t("shortcuts.close")}
          </button>
          <button
            type="button"
            className="btn-primary px-3 py-1.5 text-sm"
            disabled={busy || aiGenerating || !name.trim() || !persona.trim()}
            onClick={() => void create()}
          >
            {t("team.add")}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
