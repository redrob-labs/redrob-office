import { useI18n, CATEGORIES, type CategoryDef, type TemplateDef } from "@redrob/ui";

export type WorkDocTab = {
  id: string;
  categoryId: string;
  templateId: string;
  /** Subject the template opens on, when it covers several. */
  variantId?: string;
};

export function makeWorkDocId(categoryId: string, templateId: string): string {
  return `${categoryId}:${templateId}`;
}

export function resolveWorkDoc(
  tab: WorkDocTab,
): { category: CategoryDef; template: TemplateDef } | null {
  const category = CATEGORIES.find((item) => item.id === tab.categoryId);
  const template = category?.templates.find((item) => item.id === tab.templateId);
  if (!category || !template) return null;
  return { category, template };
}

export function WorkDocTabStrip({
  tabs,
  activeId,
  onSelect,
  onClose,
}: {
  tabs: readonly WorkDocTab[];
  activeId: string | null;
  onSelect: (id: string) => void;
  onClose: (id: string) => void;
}): JSX.Element | null {
  const { t } = useI18n();
  if (tabs.length === 0) return null;

  return (
    <div
      role="tablist"
      aria-label={t("shell.documentTabs")}
      className="flex shrink-0 items-end gap-0.5 overflow-x-auto overflow-y-hidden border-b border-gray-200 bg-background-secondary px-1.5 pt-1.5 dark:border-gray-800"
    >
      {tabs.map((tab) => {
        const resolved = resolveWorkDoc(tab);
        const label = resolved
          ? t(`module.${resolved.template.id}`)
          : tab.templateId;
        const active = tab.id === activeId;
        return (
          <div
            key={tab.id}
            role="tab"
            aria-selected={active}
            tabIndex={active ? 0 : -1}
            title={label}
            onClick={() => onSelect(tab.id)}
            onKeyDown={(event) => {
              if (event.key === "Enter" || event.key === " ") {
                event.preventDefault();
                onSelect(tab.id);
              }
            }}
            onAuxClick={(event) => {
              if (event.button === 1) {
                event.preventDefault();
                onClose(tab.id);
              }
            }}
            className={`group relative flex max-w-[13.5rem] min-w-[7rem] cursor-default items-center gap-1 rounded-t border border-b-transparent px-2.5 py-1.5 text-left text-[0.8125rem] font-medium transition-colors ${
              active
                ? "border-gray-300 border-b-white bg-white text-gray-900 dark:border-gray-800 dark:border-b-gray-900 dark:bg-gray-900 dark:text-gray-100"
                : "border-transparent text-gray-600 hover:bg-white/60 hover:text-gray-900 dark:text-gray-400 dark:hover:bg-gray-800/60 dark:hover:text-gray-100"
            }`}
          >
            <span className="min-w-0 flex-1 truncate">{label}</span>
            <button
              type="button"
              aria-label={t("shell.closeTab", { label })}
              title={t("shell.closeTab", { label })}
              onClick={(event) => {
                event.stopPropagation();
                onClose(tab.id);
              }}
              className={`flex h-5 w-5 shrink-0 items-center justify-center rounded text-sm leading-none transition-colors ${
                active
                  ? "text-gray-400 hover:bg-gray-100 hover:text-gray-800 dark:hover:bg-gray-800 dark:hover:text-gray-100"
                  : "text-transparent group-hover:text-gray-400 hover:!bg-gray-200/80 hover:!text-gray-800 dark:hover:!bg-gray-700/80 dark:hover:!text-gray-100"
              }`}
            >
              ×
            </button>
          </div>
        );
      })}
    </div>
  );
}
