import { useId } from "react";
import { useI18n } from "@redrob/ui";
import { KeyboardIcon } from "./icons";
import {
  SHORTCUT_GROUPS,
  SHORTCUTS,
  shortcutKeyLabels,
  type ShortcutGroupId,
} from "./shortcut-registry";
import { modKeyLabel } from "./submit-hotkey";

function ShortcutKeys({ keys }: { keys: string[] }): JSX.Element {
  return (
    <span className="inline-flex flex-wrap items-center justify-end gap-1">
      {keys.map((key, index) => (
        <span
          key={`${key}-${index}`}
          className="inline-flex items-center gap-1"
        >
          {index > 0 ? (
            <span className="text-[0.625rem] text-gray-300">+</span>
          ) : null}
          <kbd className="inline-flex min-w-[1.4rem] items-center justify-center rounded border border-gray-200 bg-gray-50 px-1.5 py-0.5 font-sans text-[0.6875rem] font-medium text-gray-700 shadow-[var(--shadow-soft)] dark:border-gray-700 dark:bg-gray-800 dark:text-gray-200">
            {key}
          </kbd>
        </span>
      ))}
    </span>
  );
}

function GroupSection({
  groupId,
  title,
}: {
  groupId: ShortcutGroupId;
  title: string;
}): JSX.Element {
  const { t } = useI18n();
  const rows = SHORTCUTS.filter((row) => row.group === groupId);
  return (
    <section>
      <h3 className="px-3 pb-1 pt-3 text-[0.6875rem] font-semibold uppercase tracking-wide text-gray-400">
        {title}
      </h3>
      <ul>
        {rows.map((row) => (
          <li
            key={row.id}
            className="flex items-center justify-between gap-4 rounded px-3 py-2 hover:bg-gray-50 dark:hover:bg-gray-800/60"
          >
            <span className="text-sm text-gray-700 dark:text-gray-300">{t(row.labelKey)}</span>
            <ShortcutKeys keys={shortcutKeyLabels(row)} />
          </li>
        ))}
      </ul>
    </section>
  );
}

export function ShortcutsMap({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}): JSX.Element | null {
  const { t } = useI18n();
  const titleId = useId();
  const mod = modKeyLabel();

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-5">
      <button
        type="button"
        className="absolute inset-0 bg-black/25"
        aria-label={t("shortcuts.close")}
        onClick={() => onOpenChange(false)}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="relative z-10 flex max-h-[min(36rem,85vh)] w-full max-w-lg flex-col overflow-hidden rounded border border-gray-200/80 bg-card text-card-foreground shadow-[var(--shadow-elevated)] dark:border-gray-800"
      >
        <div className="flex shrink-0 items-center justify-between border-b border-gray-200 px-4 py-3 dark:border-gray-800">
          <div className="flex items-center gap-2">
            <KeyboardIcon className="h-4 w-4 text-gray-500 dark:text-gray-400" />
            <h2 id={titleId} className="text-sm font-semibold text-gray-900 dark:text-white">
              {t("shortcuts.title")}
            </h2>
          </div>
          <div className="flex items-center gap-2">
            <ShortcutKeys keys={[mod, "/"]} />
            <button
              type="button"
              className="rounded px-2 py-1 text-xs text-gray-400 hover:bg-gray-100 hover:text-gray-700 dark:hover:bg-gray-800 dark:hover:text-gray-200"
              onClick={() => onOpenChange(false)}
            >
              {t("shortcuts.close")}
            </button>
          </div>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-1 pb-3">
          {SHORTCUT_GROUPS.map((group) => (
            <GroupSection
              key={group.id}
              groupId={group.id}
              title={t(group.titleKey)}
            />
          ))}
        </div>
        <p className="shrink-0 border-t border-gray-200 px-4 py-2.5 text-xs text-gray-400 dark:border-gray-800 dark:text-gray-500">
          {t("shortcuts.hint")}
        </p>
      </div>
    </div>
  );
}

/** Sidebar rail trigger for the shortcuts map. */
export function ShortcutsTrigger({
  open,
  onOpenChange,
  expanded = false,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  expanded?: boolean;
}): JSX.Element {
  const { t } = useI18n();
  const mod = modKeyLabel();
  const label = t("shortcuts.open");
  const tip = t("shortcuts.openHint", { chord: `${mod}+/` });
  return (
    <button
      type="button"
      aria-label={tip}
      aria-expanded={open}
      onClick={() => onOpenChange(!open)}
      className={`flex h-8 items-center rounded text-left transition-all active:scale-[0.95] ${
        expanded ? "w-full" : "w-8"
      } ${
        open
          ? "bg-gray-900 text-white dark:bg-blue-600 dark:text-white"
          : "text-gray-700 hover:bg-white hover:text-gray-900 hover:shadow-sm dark:text-gray-300 dark:hover:bg-gray-800 dark:hover:text-white"
      }`}
    >
      <span className="flex h-8 w-8 shrink-0 items-center justify-center">
        <KeyboardIcon className="h-4 w-4" />
      </span>
      {expanded ? (
        <span className="min-w-0 flex-1 truncate pr-2 text-xs font-medium">
          {label}
        </span>
      ) : null}
    </button>
  );
}
