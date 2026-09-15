import { useEffect, useMemo, useState } from "react";
import {
  CATEGORIES,
  DOMAINS,
  templateDomain,
  useI18n,
  type CategoryDef,
  type DomainId,
  type TemplateDef,
  type TemplateVariant,
} from "@redrob/ui";
import { BrandLogo, BrandSplash } from "./BrandLogo";
import {
  ChatIcon,
  DeviceIcon,
  DocumentsIcon,
  ExternalLinkIcon,
  FlowsIcon,
  MoonIcon,
  PanelLeftCloseIcon,
  PanelLeftOpenIcon,
  SettingsIcon,
  SunIcon,
  WorkflowGalleryIcon,
} from "./icons";
import { useTheme } from "./theme";
import {
  WORKFLOW_GALLERY_URL,
  type SaveWorkflowRequest,
  type SetupSnapshot,
  type WorkflowView,
} from "../../shared/office-api";
import { DocumentsPanel } from "./DocumentsPanel";
import { DevicePanel } from "./DevicePanel";
import { DayLogPanel } from "./DayLogPanel";
import { DocumentEditPanel } from "./DocumentEditPanel";
import { PanelResizeHandle, usePanelWidths } from "./panel-widths";
import { AssessPanel } from "./AssessPanel";
import { BulkIntakePanel } from "./BulkIntakePanel";
import { ChatPanel } from "./ChatPanel";
import { TranscribePanel } from "./TranscribePanel";
import { EmailPanel } from "./EmailPanel";
import { ResearchPanel } from "./ResearchPanel";
import { JdPanel } from "./JdPanel";
import { PublishPanel } from "./PublishPanel";
import { ResultPane } from "./ResultPane";
import { RubricCheckPanel } from "./RubricCheckPanel";
import { RubricPanel } from "./RubricPanel";
import { ScreenPanel } from "./ScreenPanel";
import { requestSettingsSection, SettingsPanel } from "./SettingsPanel";
import { BetaAccessGate } from "./BetaAccessGate";
import { PaySheet, useCreditState } from "./PaySheet";
import { onOutOfCredit } from "./credit-bridge";
import { UpdateBanner } from "./UpdateBanner";
import { ChatSessionsPanel } from "./ChatSessionsPanel";
import { chatNavBridge, useChatNavState } from "./chat-nav-bridge";
import { AddTeammateDialog } from "./TeammateCard";
import {
  ProductTour,
  clearTourDone,
  shouldStartProductTour,
} from "./ProductTour";
import { ShortcutsMap, ShortcutsTrigger } from "./ShortcutsMap";
import { SlotDraftPanel, type DraftFormat } from "./SlotDraftPanel";
import { useGlobalShortcuts } from "./use-global-shortcuts";
import { loadShellNav, saveShellNav, type ShellTab } from "./shell-nav-state";
import { VerifyPanel } from "./VerifyPanel";
import { WorkflowPanel } from "./WorkflowPanel";
import { WorkflowRunPanel } from "./WorkflowRunPanel";
import { FlowTaskChips, FlowWalkBar } from "./FlowTaskBar";
import { requestChatDraft, onOpenChat } from "./chat-draft";
import {
  collectFlowRefs,
  flowKeyFor,
  flowsForTemplate,
  nextHandStepIndex,
  presetFlowRef,
  savedFlowRef,
  stepTemplate,
  toggleStepDone,
  type FlowRef,
  type FlowWalk,
} from "./flow-task-link";
import { WorkResultProvider, useWorkResult } from "./work-result";
import { WorkProgressListener } from "./WorkProgressListener";
import {
  WorkDocTabStrip,
  makeWorkDocId,
  resolveWorkDoc,
  type WorkDocTab,
} from "./work-doc-tabs";
import { modKeyLabel } from "./submit-hotkey";

type Tab = ShellTab;

type FlowSelection =
  | { kind: "new" }
  | { kind: "preset"; draft: SaveWorkflowRequest }
  | { kind: "saved"; workflow: WorkflowView };

type FlowMode = "run" | "edit";

function toDraftFormats(variant: TemplateVariant): readonly DraftFormat[] | undefined {
  return variant.formats?.map((format) => ({
    id: format.id,
    templateId: format.registryId,
  }));
}

/**
 * A template is a panel plus, when it covers several subjects, a chip row that
 * swaps which registry entry the panel loads. Nothing browses these any more —
 * a skill step is what opens one.
 */
function TemplateView({
  template,
  initialVariantId,
}: {
  template: TemplateDef;
  initialVariantId?: string | undefined;
}): JSX.Element {
  const { t } = useI18n();
  const variants = template.variants ?? [];
  const [variantId, setVariantId] = useState(initialVariantId ?? variants[0]?.id ?? "");
  useEffect(() => {
    if (initialVariantId) setVariantId(initialVariantId);
  }, [initialVariantId]);
  const variant = variants.find((item) => item.id === variantId) ?? variants[0];
  const domain = templateDomain(template, variant?.id);

  if (variants.length <= 1) {
    return <TemplatePanel template={template} variant={variant} domain={domain} />;
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div
        className="mb-4 flex flex-wrap gap-1.5"
        role="group"
        aria-label={t("shell.variants")}
      >
        {variants.map((item) => {
          const active = item.id === variant?.id;
          return (
            <button
              key={item.id}
              type="button"
              aria-pressed={active}
              onClick={() => setVariantId(item.id)}
              className={`rounded px-2.5 py-1 text-xs font-medium transition-colors ${
                active
                  ? "bg-gray-900 text-white"
                  : "bg-gray-100 text-gray-600 hover:bg-gray-200 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700"
              }`}
            >
              {t(item.labelKey)}
            </button>
          );
        })}
      </div>
      <TemplatePanel template={template} variant={variant} domain={domain} />
    </div>
  );
}

function TemplatePanel({
  template,
  variant,
  domain,
}: {
  template: TemplateDef;
  variant: TemplateVariant | undefined;
  domain: string;
}): JSX.Element {
  const { t } = useI18n();
  switch (template.id) {
    case "research":
      return <ResearchPanel />;
    case "jd":
      return <JdPanel />;
    case "rubric":
      return <RubricPanel workspaceId={domain} />;
    case "screen":
      return <ScreenPanel />;
    case "assess":
      return <AssessPanel workspaceId={domain} />;
    case "verify":
      return <VerifyPanel workspaceId={domain} />;
    case "email":
      return <EmailPanel />;
    case "transcribe":
      return <TranscribePanel />;
    case "publish":
      return <PublishPanel />;
    case "daylog":
      return <DayLogPanel />;
    case "documentEdit":
      return <DocumentEditPanel />;
    case "intake":
      return <BulkIntakePanel schemaId={variant?.registryId} workspaceId={domain} />;
    case "checklist":
      return variant ? (
        <RubricCheckPanel
          key={variant.id}
          rubricId={variant.registryId}
          titleKey={variant.titleKey ?? variant.labelKey}
          bodyKey={variant.bodyKey ?? variant.labelKey}
        />
      ) : (
        <TemplateSoon />
      );
    case "draft":
    case "deck":
    case "graphic": {
      if (!variant) return <TemplateSoon />;
      const formats = toDraftFormats(variant);
      return (
        <SlotDraftPanel
          key={variant.id}
          templateId={variant.registryId}
          titleKey={variant.titleKey ?? variant.labelKey}
          bodyKey={variant.bodyKey ?? variant.labelKey}
          categoryId={domain}
          {...(formats ? { formats } : {})}
        />
      );
    }
    default:
      return (
        <div className="rounded bg-gray-50 p-5 dark:bg-gray-900">
          <p className="text-sm text-gray-500 dark:text-gray-400">
            {t("shell.moduleSoon")}
          </p>
        </div>
      );
  }
}

function TemplateSoon(): JSX.Element {
  const { t } = useI18n();
  return (
    <div className="rounded bg-gray-50 p-5 dark:bg-gray-900">
      <p className="text-sm text-gray-500 dark:text-gray-400">
        {t("shell.moduleSoon")}
      </p>
    </div>
  );
}

export function App(): JSX.Element {
  return (
    <WorkResultProvider>
      <WorkProgressListener />
      <AppShell />
      <UpdateBanner />
    </WorkResultProvider>
  );
}

/**
 * Setup being finished once is not the same as being usable now. Raising the
 * text floor to 4B leaves machines that finished setup on smaller weights with
 * nothing the Floor will run, so they go back through the download step instead
 * of reaching a workspace where every turn refuses.
 *
 * A machine routing to the cloud is exempt: it has a working route and no use
 * for weights it will never load, and sending it back to a download step it
 * cannot complete is a loop with no exit.
 */
function needsLocalWeights(snapshot: SetupSnapshot): boolean {
  if (snapshot.state.mode !== "local") return false;
  if (snapshot.presentRoles.includes("text")) return false;
  return !hasCloudRoute(snapshot);
}

function hasCloudRoute(snapshot: SetupSnapshot): boolean {
  return Boolean(snapshot.state.llmProviders?.openai?.apiKey);
}

/**
 * First-run is done only when API access and the agent engine are both ready.
 * Missing either sends the person back through the onboarding gate.
 */
async function isSetupReady(snapshot: SetupSnapshot): Promise<boolean> {
  if (!snapshot.state.completedAt) return false;
  if (needsLocalWeights(snapshot)) return false;
  if (!hasCloudRoute(snapshot)) return false;
  try {
    const engine = await window.office.getEngineStatus();
    return engine.available;
  } catch {
    return false;
  }
}

function AppShell(): JSX.Element {
  const { t, locale } = useI18n();
  const { clearResult, clearResultIfIdle, result } = useWorkResult();
  const bootNav = useMemo(() => loadShellNav(), []);
  const [setup, setSetup] = useState<SetupSnapshot | null>(null);
  const [setupReady, setSetupReady] = useState(false);
  /**
   * The pay sheet, opened by a turn the console refused for want of credit. The
   * state it shows is read back from the main process rather than passed through
   * the renderer, so the sheet quotes the console rather than a screen.
   */
  const { credit, refresh: refreshCredit, set: setCredit } = useCreditState();
  const [payOpen, setPayOpen] = useState(false);
  /**
   * Hold the splash briefly even when startup beats it. A brand that appears
   * for one frame and vanishes reads as a flicker, which is worse than not
   * showing it — and on the machines this app targets, startup is rarely that
   * fast anyway.
   */
  const [splashHold, setSplashHold] = useState(true);
  const [category, setCategory] = useState<CategoryDef>(bootNav.category);
  const [tab, setTab] = useState<Tab>(bootNav.tab);
  /** Keep visited shell tabs mounted so form drafts survive navigation. */
  const [mountedTabs, setMountedTabs] = useState<ReadonlySet<Tab>>(
    () => new Set<Tab>(["chat", bootNav.tab]),
  );
  const [openDocs, setOpenDocs] = useState<WorkDocTab[]>(bootNav.openDocs);
  const [activeDocId, setActiveDocId] = useState<string | null>(bootNav.activeDocId);
  const [flowSelection, setFlowSelection] = useState<FlowSelection>({
    kind: "new",
  });
  const [savedFlows, setSavedFlows] = useState<WorkflowView[]>([]);
  const [flowPresets, setFlowPresets] = useState<SaveWorkflowRequest[]>([]);
  const [flowMode, setFlowMode] = useState<FlowMode>("edit");
  /** The flow whose step is open as a form, so both surfaces describe one walk. */
  const [flowWalk, setFlowWalk] = useState<FlowWalk | null>(null);
  /** Hand steps ticked off, per flow. Which step the run timeline then shows done. */
  const [flowDone, setFlowDone] = useState<Record<string, readonly number[]>>({});
  /** Step the run timeline should open on when Tasks hands the flow back. */
  const [flowFocusIndex, setFlowFocusIndex] = useState<number | undefined>();
  /** Flows are stored per industry, which the task catalog no longer tracks. */
  const [flowDomain, setFlowDomain] = useState<DomainId>("general");
  const activeFlowDraft: SaveWorkflowRequest | null =
    flowSelection.kind === "preset"
      ? flowSelection.draft
      : flowSelection.kind === "saved"
        ? {
            workspaceId: flowSelection.workflow.workspaceId,
            title: flowSelection.workflow.title,
            ...(flowSelection.workflow.description
              ? { description: flowSelection.workflow.description }
              : {}),
            ...(flowSelection.workflow.instructions
              ? { instructions: flowSelection.workflow.instructions }
              : {}),
            slug: flowSelection.workflow.id.includes("/")
              ? flowSelection.workflow.id.slice(
                  flowSelection.workflow.id.indexOf("/") + 1,
                )
              : flowSelection.workflow.id,
            steps: flowSelection.workflow.steps.map((step) => ({ ...step })),
          }
        : null;
  const activeFlowKey = activeFlowDraft ? flowKeyFor(activeFlowDraft) : null;
  const activeFlowRef: FlowRef | null =
    activeFlowDraft && activeFlowKey
      ? {
          key: activeFlowKey,
          title: activeFlowDraft.title,
          steps: activeFlowDraft.steps,
          source: flowSelection.kind === "saved" ? "saved" : "preset",
        }
      : null;
  const flowRefs = useMemo(
    () => collectFlowRefs(flowPresets, savedFlows),
    [flowPresets, savedFlows],
  );
  const [bootError, setBootError] = useState<string | null>(null);
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  const { resolvedTheme, toggleTheme } = useTheme();
  const [sidebarCollapsed, setSidebarCollapsed] = useState(bootNav.sidebarCollapsed);
  const [sidebarHovered, setSidebarHovered] = useState(false);
  /** After pin-collapse, ignore hover until the pointer leaves the rail. */
  const [hoverPeekBlocked, setHoverPeekBlocked] = useState(false);
  const [tourOpen, setTourOpen] = useState(false);
  const [tourKey, setTourKey] = useState(0);
  /** Silent ASR/inference fallbacks must be visible without opening Device. */
  const [alertCount, setAlertCount] = useState(0);
  /** Set when the Library hands an artifact over to the Documents tab for editing. */
  const [documentRequestId, setDocumentRequestId] = useState<string | null>(null);
  const sidebarPanels = usePanelWidths("appSidebar", {
    pane: { default: 260, min: 200, max: 480 },
  });
  const chatState = useChatNavState();
  const [addingTeammate, setAddingTeammate] = useState(false);
  const workPanels = usePanelWidths("work", {
    form: { default: 520, min: 320, max: 900 },
  });
  const flowPanels = usePanelWidths("flows", {
    rail: { default: 280, min: 180, max: 480 },
  });

  const activeDoc = openDocs.find((doc) => doc.id === activeDocId) ?? null;
  const activeResolved = activeDoc ? resolveWorkDoc(activeDoc) : null;
  const selectedTemplate = activeResolved?.template ?? null;
  /** Flows this step belongs to, so a handed-off form is not a dead end. */
  const taskFlowMatches = useMemo(
    () =>
      selectedTemplate ? flowsForTemplate(flowRefs, selectedTemplate.id) : [],
    [flowRefs, selectedTemplate],
  );

  /** Minimum time the splash stays up, in ms. Long enough to read as intentional. */
  useEffect(() => {
    const timer = setTimeout(() => setSplashHold(false), 700);
    return () => clearTimeout(timer);
  }, []);

  useEffect(() => onOpenChat(() => setTab("chat")), []);

  useEffect(() => {
    setMountedTabs((prev) => {
      if (prev.has(tab)) return prev;
      const next = new Set(prev);
      next.add(tab);
      return next;
    });
  }, [tab]);

  useEffect(() => {
    saveShellNav({
      tab,
      categoryId: category.id,
      openDocs,
      activeDocId,
      sidebarCollapsed,
    });
  }, [tab, category.id, openDocs, activeDocId, sidebarCollapsed]);

  function openDoc(
    nextCategory: CategoryDef,
    template: TemplateDef,
    variantId?: string,
  ): void {
    const id = makeWorkDocId(nextCategory.id, template.id);
    setCategory(nextCategory);
    setOpenDocs((prev) => {
      const existing = prev.find((doc) => doc.id === id);
      if (existing) {
        // Reopening with a subject (from a flow) retargets the tab already open.
        if (!variantId || existing.variantId === variantId) return prev;
        return prev.map((doc) => (doc.id === id ? { ...doc, variantId } : doc));
      }
      return [
        ...prev,
        {
          id,
          categoryId: nextCategory.id,
          templateId: template.id,
          ...(variantId ? { variantId } : {}),
        },
      ];
    });
    setActiveDocId(id);
    setTab("work");
    clearResultIfIdle();
  }

  /** Open one step of a flow as a form, keeping the flow named above the tabs. */
  function openFlowStep(flow: FlowRef, index: number): void {
    const step = flow.steps[index];
    const matched = step ? stepTemplate(step) : undefined;
    setFlowWalk({ flow, index });
    if (matched) openDoc(matched.category, matched.template, matched.variantId);
    else setTab("work");
  }

  /** Show a flow's run timeline, optionally opened on the step just worked on. */
  function showFlowRun(flow: FlowRef, focusIndex?: number): void {
    const saved = savedFlows.find((item) => savedFlowRef(item).key === flow.key);
    if (saved) {
      setFlowSelection({ kind: "saved", workflow: saved });
    } else {
      const preset = flowPresets.find(
        (item) => presetFlowRef(item).key === flow.key,
      );
      if (!preset) return;
      setFlowSelection({ kind: "preset", draft: preset });
    }
    setFlowMode("run");
    setFlowFocusIndex(focusIndex);
    setTab("flows");
    clearResultIfIdle();
  }

  function toggleFlowStepDone(flowKey: string, index: number): void {
    setFlowDone((prev) => ({
      ...prev,
      [flowKey]: toggleStepDone(prev[flowKey] ?? [], index),
    }));
  }

  /**
   * Tick the open step off and move to the next one a person has to do. When
   * there is none left the walk ends where it started: back in the flow, which
   * can now run the rest.
   */
  function advanceFlowWalk(): void {
    if (!flowWalk) return;
    const { flow, index } = flowWalk;
    const done = flowDone[flow.key] ?? [];
    const nextDone = done.includes(index) ? done : toggleStepDone(done, index);
    setFlowDone((prev) => ({ ...prev, [flow.key]: nextDone }));
    const next = nextHandStepIndex(flow.steps, index, nextDone);
    if (next === undefined) {
      showFlowRun(flow, index);
      return;
    }
    openFlowStep(flow, next);
  }

  function focusDoc(id: string): void {
    if (id === activeDocId) return;
    setActiveDocId(id);
    const doc = openDocs.find((item) => item.id === id);
    if (doc) {
      const resolved = resolveWorkDoc(doc);
      if (resolved) setCategory(resolved.category);
    }
    clearResultIfIdle();
  }

  /**
   * The work surface exists only while a skill step is open in it. Closing the
   * last form would otherwise leave a pane nothing in the sidebar points at, so
   * the shell goes back to chat.
   */
  function closeDoc(id: string): void {
    setOpenDocs((prev) => {
      const index = prev.findIndex((doc) => doc.id === id);
      if (index < 0) return prev;
      const next = prev.filter((doc) => doc.id !== id);
      setActiveDocId((current) => {
        if (current !== id) return current;
        const neighbor = next[index] ?? next[index - 1] ?? null;
        if (neighbor) {
          const resolved = resolveWorkDoc(neighbor);
          if (resolved) setCategory(resolved.category);
        }
        return neighbor?.id ?? null;
      });
      if (next.length === 0) {
        setFlowWalk(null);
        setTab("chat");
      }
      return next;
    });
    clearResultIfIdle();
  }

  const shortcutHandlers = useMemo(
    () => ({
      toggleShortcuts: () => setShortcutsOpen((prev) => !prev),
      closeOverlay: () => setShortcutsOpen(false),
      toggleSidebar: () => {
        setSidebarCollapsed((prev) => {
          const next = !prev;
          if (next) {
            setSidebarHovered(false);
            setHoverPeekBlocked(true);
          } else {
            setHoverPeekBlocked(false);
          }
          return next;
        });
      },
      goChat: () => {
        setTab("chat");
        clearResultIfIdle();
        setShortcutsOpen(false);
      },
      goFlows: () => {
        setTab("flows");
        setFlowSelection({ kind: "new" });
        setFlowMode("edit");
        clearResultIfIdle();
        setShortcutsOpen(false);
      },
      goDocuments: () => {
        setTab("documents");
        clearResultIfIdle();
        setShortcutsOpen(false);
      },
      goDevice: () => {
        setTab("device");
        setShortcutsOpen(false);
      },
      goSettings: () => {
        setTab("settings");
        clearResultIfIdle();
        setShortcutsOpen(false);
      },
      closeTab: () => {
        if (activeDocId) closeDoc(activeDocId);
      },
      copyResult: () => {
        if (!result?.body) return;
        void navigator.clipboard.writeText(result.body);
      },
      saveResult: () => {
        window.dispatchEvent(new CustomEvent("office:saveResult", { cancelable: true }));
      },
      clearResult: () => clearResult(),
    }),
    [category, selectedTemplate, openDocs, activeDocId, result, clearResult],
  );

  useGlobalShortcuts(shortcutsOpen, shortcutHandlers);

  useEffect(() => {
    if (!window.office) {
      setBootError(
        "Preload bridge missing (window.office). Restart the Electron app.",
      );
      return;
    }
    void window.office
      .getSetupSnapshot()
      .then(async (snapshot) => {
        setSetup(snapshot);
        setSetupReady(await isSetupReady(snapshot));
      })
      .catch((error: unknown) => {
        setBootError(error instanceof Error ? error.message : String(error));
      });
  }, []);

  /** Tasks needs the flow list too, to say which flows a task is a step of. */
  useEffect(() => {
    if (!window.office) return;
    void window.office
      .listWorkflows()
      .then(setSavedFlows)
      .catch(() => setSavedFlows([]));
    void window.office
      .listWorkflowPresets(flowDomain, locale)
      .then(setFlowPresets)
      .catch(() => setFlowPresets([]));
  }, [flowDomain, locale]);

  useEffect(() => {
    if (!setupReady) return;
    if (shouldStartProductTour()) setTourOpen(true);
  }, [setupReady]);

  useEffect(() => {
    if (!window.office) return;
    const read = (): void => {
      void window.office
        .getRuntimeFallbackNotices()
        .then((notices) => setAlertCount(notices.length))
        .catch(() => undefined);
    };
    read();
    const timer = window.setInterval(read, 30_000);
    return () => window.clearInterval(timer);
  }, [tab]);

  useEffect(() => {
    if (!tourOpen) return;
    setSidebarCollapsed(false);
  }, [tourOpen]);

  function refreshFlows(): void {
    void window.office
      .listWorkflows()
      .then(setSavedFlows)
      .catch(() => setSavedFlows([]));
  }

  const [skillMessage, setSkillMessage] = useState<string | null>(null);
  const [skillError, setSkillError] = useState<string | null>(null);
  const [skillBusy, setSkillBusy] = useState(false);

  async function exportSelectedSkill(): Promise<void> {
    if (flowSelection.kind !== "saved") {
      setSkillError(t("skill.exportNeedSaved"));
      setSkillMessage(null);
      return;
    }
    setSkillBusy(true);
    setSkillError(null);
    setSkillMessage(null);
    try {
      const result = await window.office.exportSkill(flowSelection.workflow.id, {
        description: t("moduleHint.workflow"),
      });
      if (result.ok) {
        setSkillMessage(t("skill.exportDone", { path: result.path }));
      } else if (!("canceled" in result && result.canceled)) {
        setSkillError(t("skill.exportError", { error: result.error }));
      }
    } catch (error) {
      setSkillError(
        t("skill.exportError", {
          error: error instanceof Error ? error.message : String(error),
        }),
      );
    } finally {
      setSkillBusy(false);
    }
  }

  async function importSkillFile(): Promise<void> {
    setSkillBusy(true);
    setSkillError(null);
    setSkillMessage(null);
    try {
      const result = await window.office.importSkill({
        title: t("skill.confirmTitle"),
        messageTemplate: t("skill.confirmMessage"),
        detailTemplate: t("skill.confirmDetail"),
        cancel: t("skill.confirmCancel"),
        confirm: t("skill.confirmOk"),
      });
      if (result.ok) {
        setSkillMessage(t("skill.importDone", { title: result.workflowTitle }));
        refreshFlows();
        const list = await window.office.listWorkflows();
        const imported = list.find((item) => item.id === result.workflowId);
        if (imported) {
          setFlowSelection({ kind: "saved", workflow: imported });
          setFlowMode("run");
        }
      } else if (!("canceled" in result && result.canceled)) {
        setSkillError(t("skill.importError", { error: result.error }));
      }
    } catch (error) {
      setSkillError(
        t("skill.importError", {
          error: error instanceof Error ? error.message : String(error),
        }),
      );
    } finally {
      setSkillBusy(false);
    }
  }

  /**
   * A turn the console refused is the one moment the app knows credit is the
   * problem, so that is when the sheet opens. It reads the state back first,
   * because the console's own sentence is what the sheet quotes.
   */
  useEffect(
    () =>
      onOutOfCredit(() => {
        refreshCredit();
        setPayOpen(true);
      }),
    [refreshCredit],
  );

  if (bootError) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-100 p-8 text-gray-900">
        <div className="max-w-lg rounded border border-destructive-muted bg-white p-6 shadow-sm">
          <p className="text-lg font-semibold">Redrob Office failed to load</p>
          <p className="mt-2 text-sm text-destructive-ink">{bootError}</p>
        </div>
      </div>
    );
  }

  if (!setup || splashHold) {
    return <BrandSplash label={t("shell.loading")} />;
  }

  if (!setupReady) {
    const finishSetup = (): void => {
      void window.office.getSetupSnapshot().then(async (snapshot) => {
        setSetup(snapshot);
        setSetupReady(await isSetupReady(snapshot));
      });
    };
    return (
      <BetaAccessGate
        snapshot={setup}
        onComplete={finishSetup}
      />
    );
  }

  return (
    <div className="flex h-screen bg-background text-foreground">
      {payOpen ? (
        <PaySheet
          credit={credit}
          onClose={() => setPayOpen(false)}
          onCleared={setCredit}
        />
      ) : null}

      {addingTeammate ? (
        <AddTeammateDialog
          onClose={() => setAddingTeammate(false)}
          onCreated={(_member) => {
            void window.office?.listTeamMembers().then(() => {
              // team members updated
            });
          }}
        />
      ) : null}

      <ChatSessionsPanel
        tab={tab}
        onSelectTab={(selectedTab) => {
          if (selectedTab === "flows") {
            setFlowSelection({ kind: "new" });
            setFlowMode("edit");
          }
          setTab(selectedTab);
          if (
            selectedTab === "settings" ||
            selectedTab === "device" ||
            selectedTab === "flows" ||
            selectedTab === "documents"
          ) {
            clearResultIfIdle();
          }
        }}
        alertCount={alertCount}
        shortcutsOpen={shortcutsOpen}
        onOpenShortcuts={setShortcutsOpen}
        resolvedTheme={resolvedTheme}
        onToggleTheme={toggleTheme}
        rooms={chatState.rooms}
        dms={chatState.dms}
        activeId={chatState.activeId}
        busy={chatState.busy}
        ready={chatState.ready}
        collapsed={sidebarCollapsed}
        style={sidebarCollapsed ? undefined : sidebarPanels.style("pane")}
        onToggleCollapsed={() => setSidebarCollapsed((prev) => !prev)}
        onNewChat={() => {
          setTab("chat");
          chatNavBridge.navigateTo({ kind: "new" });
        }}
        onOpen={(row) => {
          setTab("chat");
          if (row.kind === "dm") {
            chatNavBridge.navigateTo({ kind: "dm", memberId: row.id });
          } else {
            chatNavBridge.navigateTo({ kind: "channel", channelId: row.id });
          }
        }}
        onRename={(channelId, name) => {
          void window.office?.floorUpdateChannel(channelId, { name });
        }}
        onTogglePin={(row, pinned) => {
          void (async () => {
            const sessions = await window.office?.listChatSessions().catch(() => []);
            if (!sessions) return;
            const target = sessions.find((s) =>
              row.kind === "dm"
                ? s.id === `dm-${row.id}` || s.id.includes(row.id)
                : s.id === row.id || s.id.includes(row.id),
            );
            if (target) {
              await window.office?.setChatSessionPinned(target.id, pinned);
            }
          })();
        }}
        onDelete={(channelId) => {
          void window.office?.floorDeleteChannel(channelId);
        }}
        onAddTeammate={() => setAddingTeammate(true)}
      />
      {!sidebarCollapsed ? (
        <PanelResizeHandle
          label={t("chat.historyResize")}
          onResizeStart={(event) => sidebarPanels.beginResize("pane", event)}
          onReset={() => sidebarPanels.reset("pane")}
        />
      ) : null}

      <section className="flex min-h-0 min-w-0 flex-1 overflow-hidden">
        {mountedTabs.has("chat") ? (
          <div
            className={
              tab === "chat"
                ? "flex min-h-0 w-full flex-1 overflow-hidden"
                : "hidden"
            }
            aria-hidden={tab !== "chat"}
          >
            <ChatPanel
              variant="page"
              hideSidebar
              onOpenSettings={(section) => {
                if (section) requestSettingsSection(section);
                setTab("settings");
                clearResultIfIdle();
              }}
            />
          </div>
        ) : null}
        {mountedTabs.has("work") ? (
          <div
            className={
              tab === "work"
                ? "flex min-h-0 w-full flex-1 overflow-hidden"
                : "hidden"
            }
            aria-hidden={tab !== "work"}
          >
            <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
              {flowWalk ? (
                <FlowWalkBar
                  walk={flowWalk}
                  done={flowDone[flowWalk.flow.key] ?? []}
                  activeTemplateId={selectedTemplate?.id ?? null}
                  onOpenStep={(index) => openFlowStep(flowWalk.flow, index)}
                  onAdvance={advanceFlowWalk}
                  onBackToFlow={() =>
                    showFlowRun(flowWalk.flow, flowWalk.index)
                  }
                  onExit={() => setFlowWalk(null)}
                />
              ) : (
                <FlowTaskChips
                  matches={taskFlowMatches}
                  onStart={(flow, stepIndex) =>
                    setFlowWalk({ flow, index: stepIndex })
                  }
                />
              )}
              <WorkDocTabStrip
                tabs={openDocs}
                activeId={activeDocId}
                onSelect={focusDoc}
                onClose={closeDoc}
              />

              <div className="flex min-h-0 min-w-0 flex-1 overflow-hidden">
                <div
                  className="surface flex min-h-0 flex-col overflow-hidden"
                  style={workPanels.style("form")}
                  data-tour="work-panel"
                >
                  {openDocs.length > 0 ? (
                    openDocs.map((doc) => {
                      const resolved = resolveWorkDoc(doc);
                      if (!resolved) return null;
                      const active = doc.id === activeDocId;
                      return (
                        <div
                          key={doc.id}
                          className={
                            active
                              ? "flex min-h-0 flex-1 flex-col overflow-hidden"
                              : "hidden"
                          }
                          aria-hidden={!active}
                        >
                          <div className="min-h-0 flex-1 overflow-auto p-5">
                            <TemplateView
                              template={resolved.template}
                              initialVariantId={doc.variantId}
                            />
                          </div>
                        </div>
                      );
                    })
                  ) : (
                    <div className="flex flex-1 items-center justify-center px-6 py-16 text-center">
                      <p className="text-sm text-gray-400">
                        {t("shell.noOpenTabs")}
                      </p>
                    </div>
                  )}
                </div>

                <PanelResizeHandle
                  label={t("shell.resizePanel")}
                  onResizeStart={(event) => workPanels.beginResize("form", event)}
                  onReset={() => workPanels.reset("form")}
                />

                <ResultPane />
              </div>
            </div>
          </div>
        ) : null}

        {mountedTabs.has("documents") ? (
          <div
            className={
              tab === "documents"
                ? "flex min-h-0 w-full flex-1 overflow-hidden"
                : "hidden"
            }
            aria-hidden={tab !== "documents"}
          >
            <DocumentsPanel
              openArtifactId={documentRequestId}
              onOpened={() => setDocumentRequestId(null)}
            />
          </div>
        ) : null}

        {mountedTabs.has("flows") ? (
          <div
            className={
              tab === "flows"
                ? "flex min-h-0 w-full flex-1 overflow-hidden"
                : "hidden"
            }
            aria-hidden={tab !== "flows"}
          >
            <aside
              className="pane flex flex-col overflow-hidden"
              style={flowPanels.style("rail")}
            >
              <div className="flex h-12 shrink-0 items-center border-b border-gray-200 px-4 dark:border-gray-800">
                <div className="flex w-full items-center justify-between gap-2">
                  <p className="truncate text-sm font-semibold text-gray-800 dark:text-gray-100">
                    {t("shell.flowsMine")}
                  </p>
                  <button
                    type="button"
                    className="shrink-0 rounded border border-gray-300 bg-white px-2.5 py-1 text-xs font-semibold text-gray-700 transition-colors hover:bg-gray-50 disabled:opacity-40 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-200 dark:hover:bg-gray-700"
                    disabled={skillBusy}
                    onClick={() => void importSkillFile()}
                  >
                    {t("skill.import")}
                  </button>
                </div>
              </div>
              {/* The picker and the gallery link are a toolbar, not part of the
                  header, so the header divider can stay on the shared 48px line.
                  It carries no rule of its own: a second line here is the step
                  the eye reads as a broken seam. */}
              <div className="shrink-0 space-y-2 px-4 py-3">
                <label className="block">
                  <span className="sr-only">{t("shell.flowDomain")}</span>
                  <select
                    value={flowDomain}
                    onChange={(event) => {
                      setFlowDomain(event.target.value as DomainId);
                      setFlowSelection({ kind: "new" });
                      setFlowMode("edit");
                    }}
                    className="w-full rounded border border-gray-200 bg-white px-2 py-1.5 text-xs font-medium text-gray-700 outline-none focus:border-gray-400 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-200"
                  >
                    {DOMAINS.map((domain) => (
                      <option key={domain} value={domain}>
                        {t(`workspace.${domain}`)}
                      </option>
                    ))}
                  </select>
                </label>
                <button
                  type="button"
                  className="flex w-full items-center justify-between gap-2 rounded px-2 py-1.5 text-left text-xs font-medium text-gray-600 transition-colors hover:bg-gray-50 hover:text-gray-900 dark:text-gray-300 dark:hover:bg-gray-800 dark:hover:text-white"
                  aria-label={`${t("skill.gallery")} · ${t("skill.galleryHint")}`}
                  onClick={() => {
                    void window.office.openExternal(WORKFLOW_GALLERY_URL);
                  }}
                >
                  <span className="flex min-w-0 items-center gap-1.5">
                    <WorkflowGalleryIcon className="h-3.5 w-3.5 shrink-0" />
                    <span className="truncate">{t("skill.gallery")}</span>
                  </span>
                  <ExternalLinkIcon className="h-3 w-3 shrink-0 text-gray-400" />
                </button>
              </div>
              <div className="min-h-0 flex-1 overflow-auto py-1">
                <button
                  type="button"
                  onClick={() => {
                    setFlowSelection({ kind: "new" });
                    setFlowMode("edit");
                    setFlowFocusIndex(undefined);
                  }}
                  className={`flex w-full flex-col gap-0.5 px-4 py-3 text-left transition-colors ${
                    flowSelection.kind === "new"
                      ? "bg-gray-100 dark:bg-gray-800"
                      : "hover:bg-gray-50 dark:hover:bg-gray-800/60"
                  }`}
                >
                  <span className="text-[0.9375rem] font-semibold text-brand-600 dark:text-blue-400">
                    + {t("shell.newFlow")}
                  </span>
                  <span className="text-xs text-gray-500 dark:text-gray-400">
                    {t("shell.newFlowHint")}
                  </span>
                </button>

                {flowPresets.length > 0 ? (
                  <div className="mt-2 border-t border-gray-200 px-4 pb-1 pt-3 dark:border-gray-800">
                    <p className="text-[0.6875rem] font-medium uppercase tracking-wide text-gray-400 dark:text-gray-500">
                      {t("shell.fromTemplate")}
                    </p>
                  </div>
                ) : null}
                {flowPresets.map((preset) => {
                  const selected =
                    flowSelection.kind === "preset" &&
                    flowSelection.draft.slug === preset.slug;
                  return (
                    <button
                      key={preset.slug ?? preset.title}
                      type="button"
                      onClick={() => {
                        setFlowSelection({ kind: "preset", draft: preset });
                        setFlowMode("run");
                        setFlowFocusIndex(undefined);
                      }}
                      className={`flex w-full flex-col gap-0.5 px-4 py-3 text-left transition-colors ${
                        selected ? "bg-gray-100 dark:bg-gray-800" : "hover:bg-gray-50 dark:hover:bg-gray-800/60"
                      }`}
                    >
                      <span className="text-[0.9375rem] font-semibold tracking-tight text-gray-900 dark:text-gray-100">
                        {preset.title}
                      </span>
                      <span className="line-clamp-2 text-xs leading-relaxed text-gray-500 dark:text-gray-400">
                        {preset.steps.map((step) => step.title).join(" → ")}
                      </span>
                    </button>
                  );
                })}

                {savedFlows.length > 0 ? (
                  <div className="mt-2 border-t border-gray-200 px-4 pb-1 pt-3 dark:border-gray-800">
                    <p className="text-[0.6875rem] font-medium uppercase tracking-wide text-gray-400 dark:text-gray-500">
                      {t("shell.savedFlows")}
                    </p>
                  </div>
                ) : null}
                {savedFlows.map((flow) => {
                  const selected =
                    flowSelection.kind === "saved" &&
                    flowSelection.workflow.id === flow.id;
                  return (
                    <button
                      key={flow.id}
                      type="button"
                      onClick={() => {
                        setFlowSelection({ kind: "saved", workflow: flow });
                        setFlowMode("run");
                        setFlowFocusIndex(undefined);
                      }}
                      className={`flex w-full flex-col gap-0.5 px-4 py-3 text-left transition-colors ${
                        selected ? "bg-gray-100 dark:bg-gray-800" : "hover:bg-gray-50 dark:hover:bg-gray-800/60"
                      }`}
                    >
                      <span className="text-[0.9375rem] font-semibold tracking-tight text-gray-900 dark:text-gray-100">
                        {flow.title}
                      </span>
                      <span className="line-clamp-2 text-xs leading-relaxed text-gray-500 dark:text-gray-400">
                        {flow.steps.map((step) => step.title).join(" → ")}
                      </span>
                    </button>
                  );
                })}
              </div>
            </aside>
            <PanelResizeHandle
              label={t("shell.resizePanel")}
              onResizeStart={(event) => flowPanels.beginResize("rail", event)}
              onReset={() => flowPanels.reset("rail")}
            />
            <div className="pane flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
              <div className="flex h-12 shrink-0 items-center border-b border-gray-200 px-6 dark:border-gray-800">
                <div className="flex w-full items-center justify-between gap-3">
                  <h2 className="truncate text-sm font-semibold text-gray-900 dark:text-white">
                    {flowSelection.kind === "new"
                      ? t("shell.newFlow")
                      : flowSelection.kind === "preset"
                        ? flowSelection.draft.title
                        : flowSelection.workflow.title}
                  </h2>
                  <div className="flex shrink-0 items-center gap-2">
                    {activeFlowDraft ? (
                      // One control with two halves, so it reads as a switch
                      // rather than two loose text buttons.
                      <div
                        role="tablist"
                        aria-label={t("shell.flows")}
                        className="flex gap-0.5 rounded bg-gray-100 p-0.5 dark:bg-gray-800"
                      >
                        {(
                          [
                            ["run", t("workflow.runMode")],
                            ["edit", t("workflow.editMode")],
                          ] as const
                        ).map(([mode, label]) => (
                          <button
                            key={mode}
                            type="button"
                            role="tab"
                            aria-selected={flowMode === mode}
                            className={`rounded-sm px-2.5 py-1 text-xs font-semibold transition-colors ${
                              flowMode === mode
                                ? "bg-white text-gray-900 shadow-sm dark:bg-gray-700 dark:text-white"
                                : "text-gray-600 hover:text-gray-900 dark:text-gray-300 dark:hover:text-white"
                            }`}
                            onClick={() => setFlowMode(mode)}
                          >
                            {label}
                          </button>
                        ))}
                      </div>
                    ) : null}
                    {flowSelection.kind === "saved" ? (
                      <button
                        type="button"
                        className="rounded border border-gray-300 bg-white px-2.5 py-1 text-xs font-semibold text-gray-700 transition-colors hover:bg-gray-50 disabled:opacity-40 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-200 dark:hover:bg-gray-700"
                        disabled={skillBusy}
                        onClick={() => void exportSelectedSkill()}
                      >
                        {t("skill.export")}
                      </button>
                    ) : null}
                  </div>
                </div>
              </div>
              <div className="min-h-0 flex-1 overflow-auto p-6">
                <p className="mb-5 text-xs leading-relaxed text-gray-500 dark:text-gray-400">
                  {t("workflow.body")}
                </p>
                {skillMessage ? (
                  <p className="mb-4 text-sm text-gray-600 dark:text-gray-300">{skillMessage}</p>
                ) : null}
                {skillError ? (
                  <p className="mb-4 rounded border border-destructive-muted bg-destructive-soft p-3 text-sm text-destructive-ink">
                    {skillError}
                  </p>
                ) : null}
                {flowMode === "run" && activeFlowDraft ? (
                  <WorkflowRunPanel
                    key={`${activeFlowDraft.workspaceId}/${activeFlowDraft.slug ?? activeFlowDraft.title}`}
                    workspaceId={flowDomain}
                    title={activeFlowDraft.title}
                    description={activeFlowDraft.description}
                    instructions={activeFlowDraft.instructions}
                    steps={activeFlowDraft.steps}
                    handDone={
                      activeFlowKey ? (flowDone[activeFlowKey] ?? []) : []
                    }
                    focusIndex={flowFocusIndex}
                    onEdit={() => setFlowMode("edit")}
                    onOpenArtifact={(artifactId) => {
                      setDocumentRequestId(artifactId);
                      setTab("documents");
                    }}
                    onOpenManual={(_step, index) => {
                      if (!activeFlowRef) return;
                      openFlowStep(activeFlowRef, index);
                    }}
                    onToggleHandDone={(index) => {
                      if (!activeFlowKey) return;
                      toggleFlowStepDone(activeFlowKey, index);
                    }}
                    onRunInChat={() => {
                      requestChatDraft(
                        t("workflow.chatPrompt", {
                          title: activeFlowDraft.title,
                        }),
                      );
                      setTab("chat");
                      clearResultIfIdle();
                    }}
                  />
                ) : (
                  <WorkflowPanel
                    workspaceId={flowDomain}
                    selection={flowSelection}
                    embedded
                    onSaved={(workflow) => {
                      refreshFlows();
                      setFlowSelection({ kind: "saved", workflow });
                      setFlowMode("run");
                    }}
                  />
                )}
              </div>
            </div>
          </div>
        ) : null}

        {mountedTabs.has("device") ? (
          <div
            className={
              tab === "device"
                ? "flex min-h-0 w-full flex-1 overflow-hidden"
                : "hidden"
            }
            aria-hidden={tab !== "device"}
          >
            <DevicePanel
              active={tab === "device"}
              onOpenSettings={() => {
                setTab("settings");
                clearResultIfIdle();
              }}
            />
          </div>
        ) : null}

        {mountedTabs.has("settings") ? (
          <div
            className={
              tab === "settings"
                ? "flex min-h-0 w-full flex-1 overflow-hidden"
                : "hidden"
            }
            aria-hidden={tab !== "settings"}
          >
            <SettingsPanel
              setup={setup}
              onOpenDevice={() => setTab("device")}
              onSetupChange={(snapshot) => {
                setSetup(snapshot);
                // Settings may change keys; never treat completedAt alone as ready.
                void isSetupReady(snapshot).then(setSetupReady);
              }}
              onReplayTour={() => {
                clearTourDone();
                setTourKey((key) => key + 1);
                setTourOpen(true);
              }}
            />
          </div>
        ) : null}
      </section>
      <ShortcutsMap open={shortcutsOpen} onOpenChange={setShortcutsOpen} />
      {tourOpen ? (
        <ProductTour
          key={tourKey}
          onTabChange={(next) => {
            setTab(next as typeof tab);
            if (next === "flows") {
              setFlowSelection({ kind: "new" });
              setFlowMode("edit");
            }
            if (next !== "work") clearResultIfIdle();
          }}
          onExpandSidebar={() => {
            setSidebarCollapsed(false);
            setSidebarHovered(false);
            setHoverPeekBlocked(false);
          }}
          onComplete={() => {
            setTourOpen(false);
            setTab("chat");
          }}
        />
      ) : null}
    </div>
  );
}
