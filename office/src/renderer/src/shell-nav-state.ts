import { CATEGORIES, type CategoryDef } from "@redrob/ui";
import { makeWorkDocId, resolveWorkDoc, type WorkDocTab } from "./work-doc-tabs";

/** v8 dropped the browsable task catalog: chat is the only place work starts. */
const STORAGE_KEY = "redrob.shellNav.v8";
const LEGACY_KEYS = [
  "redrob.shellNav.v7",
  "redrob.shellNav.v6",
  "redrob.shellNav.v5",
] as const;

/**
 * `work` is not a destination anybody can navigate to. It hosts the form a
 * skill hands a step off to, so it only appears while such a step is open.
 */
export type ShellTab =
  | "chat"
  | "work"
  | "flows"
  | "documents"
  | "device"
  | "settings";

export type ShellNavState = {
  tab: ShellTab;
  categoryId: string;
  openDocs: WorkDocTab[];
  activeDocId: string | null;
  sidebarCollapsed: boolean;
};

const TABS: ReadonlySet<string> = new Set([
  "chat",
  "work",
  "flows",
  "documents",
  "device",
  "settings",
]);

function migrateCategoryId(categoryId: string, templateId: string): string {
  // Pre-general-purpose axes: Check → Analyze, Day log → Automate.
  if (categoryId === "check") return "analyze";
  if (categoryId === "extract" && templateId === "daylog") return "automate";
  return categoryId;
}

/**
 * Old sessions can name a tab that either moved or stopped being somewhere a
 * person can go. Anything unreachable resolves to chat rather than stranding
 * them on a surface with no way back.
 */
function migrateTab(saved: string): ShellTab {
  if (saved === "floor") return "chat";
  if (saved === "artifacts") return "documents";
  // The task catalog was a tab in v7 and is not one now.
  if (saved === "templates") return "chat";
  return TABS.has(saved) ? (saved as ShellTab) : "chat";
}

function sanitizeDocs(raw: unknown): WorkDocTab[] {
  if (!Array.isArray(raw)) return [];
  const docs: WorkDocTab[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const row = item as Record<string, unknown>;
    if (typeof row.categoryId !== "string" || typeof row.templateId !== "string") continue;
    const categoryId = migrateCategoryId(row.categoryId, row.templateId);
    const id = makeWorkDocId(categoryId, row.templateId);
    const candidate: WorkDocTab = {
      id,
      categoryId,
      templateId: row.templateId,
      ...(typeof row.variantId === "string" ? { variantId: row.variantId } : {}),
    };
    if (!resolveWorkDoc(candidate)) continue;
    if (docs.some((doc) => doc.id === candidate.id)) continue;
    docs.push(candidate);
  }
  return docs;
}

function readRaw(): Record<string, unknown> | null {
  try {
    let raw = sessionStorage.getItem(STORAGE_KEY);
    for (const key of LEGACY_KEYS) {
      if (raw) break;
      raw = sessionStorage.getItem(key);
    }
    if (!raw) return null;
    return JSON.parse(raw) as Record<string, unknown>;
  } catch {
    return null;
  }
}

function bootDefaults(): ShellNavState & { category: CategoryDef } {
  return {
    tab: "chat",
    categoryId: CATEGORIES[0]!.id,
    category: CATEGORIES[0]!,
    openDocs: [],
    activeDocId: null,
    sidebarCollapsed: false,
  };
}

/** Boot defaults, overwritten by sessionStorage when present (survives refresh). */
export function loadShellNav(): ShellNavState & { category: CategoryDef } {
  const parsed = readRaw();
  if (!parsed) return bootDefaults();
  try {
    const openDocs = sanitizeDocs(parsed.openDocs);
    const activeDocId =
      typeof parsed.activeDocId === "string" && openDocs.some((doc) => doc.id === parsed.activeDocId)
        ? parsed.activeDocId
        : (openDocs[0]?.id ?? null);
    const active = activeDocId
      ? openDocs.find((doc) => doc.id === activeDocId)
      : openDocs[0];
    const category =
      CATEGORIES.find((item) => item.id === active?.categoryId) ??
      CATEGORIES.find((item) => item.id === parsed.categoryId) ??
      CATEGORIES[0]!;
    const savedTab = migrateTab(String(parsed.tab));
    // A restored work surface with nothing open would have no way out.
    const tab = savedTab === "work" && openDocs.length === 0 ? "chat" : savedTab;
    return {
      tab,
      categoryId: category.id,
      category,
      openDocs,
      activeDocId,
      sidebarCollapsed: parsed.sidebarCollapsed === true,
    };
  } catch {
    return bootDefaults();
  }
}

export function saveShellNav(state: ShellNavState): void {
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // Quota / private mode — navigation still works in-memory.
  }
}
