import { useCallback, useEffect, useState, type ReactNode } from "react";
import { LocaleSwitch, useI18n } from "@redrob/ui";
import type {
  AccountSnapshot,
  DeskProfileView,
  MemoryView,
  SetupSnapshot,
  StaffProfilePreset,
  AuditEntryView,
  DesktopControlStatusView,
  UpdateStatusEvent,
} from "../../shared/office-api";
import {
  MASKED_API_KEY,
  REDROB_CONSOLE_API_BASE,
  REDROB_CONSOLE_URL,
  isMaskedApiKey,
} from "../../shared/office-api";
import { DeviceConnectPanel, useDeviceConnect } from "./DeviceConnect";
import { PaySheet, useCreditState } from "./PaySheet";
import { PanelResizeHandle, usePanelWidths } from "./panel-widths";
import { AsrSetupCard } from "./AsrSetupCard";
import { McpSettingsCard } from "./McpSettingsCard";
import { ExternalLinkIcon } from "./icons";
import { useTheme } from "./theme";

const SECTION_IDS = [
  "general",
  "profile",
  "memory",
  "models",
  "mcp",
  "computer",
  "privacy",
] as const;

export type SettingsSection = (typeof SECTION_IDS)[number];

const SECTION_STORAGE_KEY = "redrob.settingsSection.v1";
const SETTINGS_SECTION_EVENT = "redrob:settings-section";

/**
 * Sections that are a gallery rather than a form.
 *
 * A column of labelled fields reads best at a narrow measure, but a grid of
 * cards squeezed into that measure wraps every card's title and button, so
 * those sections get the room the window already has.
 */
const WIDE_SECTIONS = new Set<SettingsSection>(["mcp"]);

function loadSection(): SettingsSection {
  try {
    const raw = sessionStorage.getItem(SECTION_STORAGE_KEY);
    if (raw && (SECTION_IDS as readonly string[]).includes(raw)) {
      return raw as SettingsSection;
    }
  } catch {
    // Private mode / quota — fall back to the first section.
  }
  return "general";
}

/** Open Settings on a specific section (works even if the panel is already mounted). */
export function requestSettingsSection(section: SettingsSection): void {
  if (!(SECTION_IDS as readonly string[]).includes(section)) return;
  try {
    sessionStorage.setItem(SECTION_STORAGE_KEY, section);
  } catch {
    // Private mode / quota — in-memory event still updates the panel.
  }
  window.dispatchEvent(
    new CustomEvent(SETTINGS_SECTION_EVENT, { detail: section }),
  );
}

const EMPTY_PROFILE: DeskProfileView = {
  displayName: "",
  jobTitle: "",
  signature: "",
  company: {
    name: "",
    about: "",
    benefits: "",
    workConditions: "",
    applicationProcess: "",
  },
};

const PANEL_SPECS = {
  rail: { default: 220, min: 160, max: 360 },
} as const;

const FIELD_CLASS = "w-full rounded border-0 bg-gray-100 px-3 py-2 text-sm text-gray-900 placeholder:text-gray-400 dark:bg-gray-800 dark:text-gray-100 dark:placeholder:text-gray-500";

/** One purpose per group: a heading, an optional single hint, then controls. */
function Group({
  title,
  hint,
  children,
}: {
  title: string;
  hint?: string;
  children: ReactNode;
}): JSX.Element {
  return (
    <section className="border-t border-gray-200 py-6 first:border-t-0 first:pt-0 last:pb-0 dark:border-gray-800">
      <h3 className="text-sm font-semibold text-gray-900 dark:text-white">{title}</h3>
      {hint ? (
        <p className="mt-1 text-xs leading-relaxed text-gray-500 dark:text-gray-400">{hint}</p>
      ) : null}
      <div className="mt-3 space-y-3">{children}</div>
    </section>
  );
}

function TextField({
  label,
  value,
  onChange,
  placeholder,
  multiline,
  minHeightClass = "min-h-24",
}: {
  label: string;
  value: string;
  onChange: (next: string) => void;
  placeholder?: string;
  multiline?: boolean;
  minHeightClass?: string;
}): JSX.Element {
  return (
    <label className="block space-y-1.5">
      <span className="text-sm font-medium text-gray-900 dark:text-gray-200">{label}</span>
      {multiline ? (
        <textarea
          className={`${FIELD_CLASS} ${minHeightClass}`}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          placeholder={placeholder}
        />
      ) : (
        <input
          className={FIELD_CLASS}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          placeholder={placeholder}
        />
      )}
    </label>
  );
}

/**
 * Shows a fixed-length mask for a key that is already stored, and never lets
 * the mask itself be submitted back as a secret.
 */
function ApiKeyField({
  label,
  placeholder,
  value,
  configured,
  onChange,
}: {
  label: string;
  placeholder: string;
  value: string;
  configured: boolean;
  onChange: (next: string) => void;
}): JSX.Element {
  const showMask = configured && value.length === 0;
  return (
    <label className="block space-y-1.5">
      <span className="text-sm font-medium text-gray-900">{label}</span>
      <input
        className={`${FIELD_CLASS} tracking-widest`}
        placeholder={placeholder}
        type={showMask ? "text" : "password"}
        autoComplete="off"
        spellCheck={false}
        value={showMask ? MASKED_API_KEY : value}
        onChange={(event) => {
          const next = event.target.value;
          if (showMask) {
            if (isMaskedApiKey(next) || next.length === 0) {
              onChange("");
              return;
            }
            onChange(next.replaceAll("*", ""));
            return;
          }
          onChange(isMaskedApiKey(next) ? "" : next);
        }}
      />
    </label>
  );
}

function Note({ text }: { text: string | null }): JSX.Element | null {
  if (!text) return null;
  return <p className="text-xs text-gray-600">{text}</p>;
}

export function SettingsPanel({
  setup,
  onSetupChange,
  onReplayTour,
  onOpenDevice,
}: {
  setup: SetupSnapshot;
  onSetupChange: (snapshot: SetupSnapshot) => void;
  onReplayTour: () => void;
  /** Preferences live here; the resulting plan is read out on Device. */
  onOpenDevice?: () => void;
}): JSX.Element {
  const { t } = useI18n();
  const { themeMode, setThemeMode } = useTheme();
  const { style, beginResize, reset } = usePanelWidths("settings", PANEL_SPECS);
  const [section, setSection] = useState<SettingsSection>(loadSection);

  useEffect(() => {
    const onRequest = (event: Event): void => {
      const next = (event as CustomEvent<SettingsSection>).detail;
      if ((SECTION_IDS as readonly string[]).includes(next)) setSection(next);
    };
    window.addEventListener(SETTINGS_SECTION_EVENT, onRequest);
    return () => window.removeEventListener(SETTINGS_SECTION_EVENT, onRequest);
  }, []);

  const [account, setAccount] = useState<AccountSnapshot | null>(null);
  const [backupEmail, setBackupEmail] = useState("");
  const [backupMessage, setBackupMessage] = useState<string | null>(null);
  const [backupBusy, setBackupBusy] = useState(false);
  const [runtimeMessage, setRuntimeMessage] = useState<string | null>(null);
  const [redrobKey, setRedrobKey] = useState("");
  const [providersMessage, setProvidersMessage] = useState<string | null>(null);
  /**
   * Connecting writes the key in the main process, so this only reflects the
   * result: the snapshot it hands back is what the rest of Settings reads.
   */
  const onConnected = useCallback(
    (next: SetupSnapshot): void => {
      onSetupChange(next);
      setRedrobKey("");
      setProvidersMessage(null);
    },
    [onSetupChange],
  );
  const connect = useDeviceConnect(onConnected);
  const { credit, refresh: refreshCredit, set: setCredit } = useCreditState();
  const [payOpen, setPayOpen] = useState(false);
  const [telemetryOptIn, setTelemetryOptIn] = useState(true);
  const [telemetryPreview, setTelemetryPreview] = useState<unknown[] | null>(
    null,
  );
  const [logsError, setLogsError] = useState<string | null>(null);
  const [dataMessage, setDataMessage] = useState<string | null>(null);
  const [dataBusy, setDataBusy] = useState(false);
  const [appVersion, setAppVersion] = useState<string | null>(null);
  const [updateStatus, setUpdateStatus] = useState<UpdateStatusEvent | null>(
    null,
  );
  const [memories, setMemories] = useState<MemoryView[]>([]);
  const [allowedPaths, setAllowedPaths] = useState<string[]>([]);
  const [toolAudit, setToolAudit] = useState<AuditEntryView[]>([]);
  const [computerUseSettings, setComputerUseSettings] = useState<{
    profile: StaffProfilePreset;
    execSecurity: "deny" | "allowlist" | "full";
    execAsk: "always" | "once" | "off";
    sandboxMode: "off" | "workspace" | "strict";
    elevatedEnabled: boolean;
    readerPass: boolean;
    desktopControl: boolean;
    backgroundControl: boolean;
    browserTarget: "app" | "system";
  }>({
    profile: "full",
    execSecurity: "full",
    execAsk: "off",
    sandboxMode: "workspace",
    elevatedEnabled: false,
    readerPass: false,
    desktopControl: false,
    backgroundControl: false,
    browserTarget: "system",
  });
  const [desktopStatus, setDesktopStatus] =
    useState<DesktopControlStatusView | null>(null);
  const [memoryDraft, setMemoryDraft] = useState("");
  const [memoryImport, setMemoryImport] = useState("");
  const [editingMemoryId, setEditingMemoryId] = useState<string | null>(null);
  const [memoryNote, setMemoryNote] = useState<{
    scope: "edit" | "import";
    text: string;
  } | null>(null);
  const [memoryBusy, setMemoryBusy] = useState(false);
  const [profile, setProfile] = useState<DeskProfileView>(EMPTY_PROFILE);
  const [profileMessage, setProfileMessage] = useState<string | null>(null);
  const [profileBusy, setProfileBusy] = useState(false);
  const [companySiteUrl, setCompanySiteUrl] = useState("");
  const [companySiteBusy, setCompanySiteBusy] = useState(false);
  const [companySiteError, setCompanySiteError] = useState<string | null>(null);

  const memoryNoteFor = (scope: "edit" | "import"): string | null =>
    memoryNote?.scope === scope ? memoryNote.text : null;

  const refreshMemories = (): void => {
    void window.office
      .listMemories()
      .then(setMemories)
      .catch(() => setMemories([]));
  };

  useEffect(() => {
    void window.office
      .getAppVersion()
      .then(setAppVersion)
      .catch(() => setAppVersion(null));
    void window.office
      .getTelemetryOptIn()
      .then(setTelemetryOptIn)
      .catch(() => undefined);
    refreshMemories();
    void window.office
      .getAllowedPaths()
      .then(setAllowedPaths)
      .catch(() => setAllowedPaths([]));
    void window.office
      .listToolAudit(40)
      .then(setToolAudit)
      .catch(() => setToolAudit([]));
    void window.office
      .getDeskProfile()
      .then(setProfile)
      .catch(() => setProfile(EMPTY_PROFILE));
  }, []);

  useEffect(() => {
    void window.office
      .getUpdateStatus()
      .then(setUpdateStatus)
      .catch(() => undefined);
    return window.office.onUpdateStatus(setUpdateStatus);
  }, []);

  useEffect(() => {
    if (section !== "computer") return;
    void window.office
      .getAllowedPaths()
      .then(setAllowedPaths)
      .catch(() => setAllowedPaths([]));
    void window.office
      .getComputerUseSettings()
      .then((s) =>
        setComputerUseSettings({
          profile: s.profile,
          execSecurity: s.execSecurity,
          execAsk: s.execAsk,
          sandboxMode: s.sandboxMode,
          elevatedEnabled: s.elevatedEnabled,
          readerPass: s.readerPass,
          desktopControl: s.desktopControl,
          backgroundControl: s.backgroundControl,
          browserTarget: s.browserTarget,
        }),
      )
      .catch(() => undefined);
    void window.office
      .desktopControlStatus()
      .then(setDesktopStatus)
      .catch(() => undefined);
    void window.office
      .listToolAudit(40)
      .then(setToolAudit)
      .catch(() => setToolAudit([]));
  }, [section]);

  useEffect(() => {
    void window.office
      .getAccountSnapshot()
      .then((snapshot) => {
        setAccount(snapshot);
        if (snapshot.email) setBackupEmail(snapshot.email);
      })
      .catch(() => undefined);
  }, []);

  useEffect(() => {
    try {
      sessionStorage.setItem(SECTION_STORAGE_KEY, section);
    } catch {
      // Private mode / quota — the section still works in-memory.
    }
  }, [section]);

  const sections: Array<{
    id: SettingsSection;
    label: string;
    desc: string;
  }> = [
    {
      id: "general",
      label: t("settings.general"),
      desc: t("settings.generalDesc"),
    },
    {
      id: "profile",
      label: t("settings.profile"),
      desc: t("settings.profileBody"),
    },
    {
      id: "memory",
      label: t("settings.memory"),
      desc: t("settings.memoryBody"),
    },
    {
      id: "models",
      label: t("settings.inference"),
      desc: t("settings.modelsDesc"),
    },
    {
      id: "mcp",
      label: t("settings.mcp"),
      desc: t("settings.mcpDesc"),
    },
    {
      id: "computer",
      label: t("settings.computer"),
      desc: t("settings.computerDesc"),
    },
    {
      id: "privacy",
      label: t("settings.privacy"),
      desc: t("settings.privacyDesc"),
    },
  ];
  const active = sections.find((item) => item.id === section) ?? sections[0]!;

  return (
    <div className="flex min-h-0 w-full flex-1 overflow-hidden">
      {payOpen ? (
        <PaySheet
          credit={credit}
          onClose={() => setPayOpen(false)}
          onCleared={setCredit}
        />
      ) : null}
      <aside
        className="pane flex flex-col overflow-hidden"
        style={style("rail")}
      >
        {/* Every panel header in the app is 48px, so their dividers form one line. */}
        <div className="flex h-12 shrink-0 items-center border-b border-gray-200 px-4 dark:border-gray-800">
          <p className="text-sm font-semibold text-gray-800 dark:text-gray-200">
            {t("tabs.settings")}
          </p>
        </div>
        <ul
          className="min-h-0 flex-1 overflow-auto py-1"
          role="listbox"
          aria-label={t("settings.nav")}
        >
          {sections.map((item) => {
            const isActive = section === item.id;
            return (
              <li key={item.id}>
                <button
                  type="button"
                  role="option"
                  aria-selected={isActive}
                  onClick={() => setSection(item.id)}
                  className={`flex w-full px-4 py-2.5 text-left text-sm font-medium transition-colors ${
                    isActive
                      ? "bg-gray-100 text-gray-900 dark:bg-gray-800 dark:text-white"
                      : "text-gray-600 hover:bg-gray-50 dark:text-gray-400 dark:hover:bg-gray-800 dark:hover:text-gray-200"
                  }`}
                >
                  {item.label}
                </button>
              </li>
            );
          })}
        </ul>
      </aside>

      <PanelResizeHandle
        label={t("shell.resizePanel")}
        onResizeStart={(event) => beginResize("rail", event)}
        onReset={() => reset("rail")}
      />

      <div className="pane flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
        <div className="flex h-12 shrink-0 items-center border-b border-gray-200 px-6 dark:border-gray-800">
          <h2 className="truncate text-sm font-semibold text-gray-900 dark:text-white">
            {active.label}
          </h2>
        </div>
        <div className="min-h-0 flex-1 overflow-auto p-6">
          <div className={WIDE_SECTIONS.has(section) ? "max-w-6xl" : "max-w-xl"}>
            {/* The section's own blurb belongs with its content, not in a header
                whose divider has to line up with every other panel's. */}
            <p className="mb-5 max-w-xl text-xs leading-relaxed text-gray-500 dark:text-gray-400">
              {active.desc}
            </p>
            {section === "general" ? (
              <div>
                <Group
                  title={t("settings.appearanceTitle")}
                  hint={t("settings.appearanceBody")}
                >
                  <div className="flex flex-wrap gap-2">
                    {(
                      [
                        ["system", "settings.themeSystem"],
                        ["light", "settings.themeLight"],
                        ["dark", "settings.themeDark"],
                      ] as const
                    ).map(([mode, labelKey]) => (
                      <button
                        key={mode}
                        type="button"
                        aria-pressed={themeMode === mode}
                        className={`rounded px-3.5 py-2 text-xs font-medium transition-colors ${
                          themeMode === mode
                            ? "bg-gray-900 text-white shadow-sm dark:bg-brand-500"
                            : "bg-gray-100 text-gray-700 hover:bg-gray-200 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700 dark:hover:text-white"
                        }`}
                        onClick={() => setThemeMode(mode)}
                      >
                        {t(labelKey)}
                      </button>
                    ))}
                  </div>
                </Group>

                <Group
                  title={t("settings.languageCurrentTitle")}
                  hint={t("settings.languageCurrentHint")}
                >
                  <LocaleSwitch />
                  <p className="text-xs leading-relaxed text-gray-500">
                    {t("settings.languageScopeBody")}
                  </p>
                </Group>

                <Group title={t("settings.about")}>
                  {appVersion ? (
                    <p className="text-sm text-gray-700 dark:text-gray-300">
                      {t("settings.version", { version: appVersion })}
                    </p>
                  ) : null}
                  <div className="flex flex-wrap items-center gap-3">
                    <button
                      type="button"
                      className="btn-secondary"
                      disabled={
                        updateStatus?.kind === "checking" ||
                        updateStatus?.kind === "downloading"
                      }
                      onClick={() => {
                        setUpdateStatus({
                          kind: "checking",
                          version: appVersion ?? "",
                        });
                        void window.office
                          .checkForUpdates()
                          .then(setUpdateStatus)
                          .catch((error: unknown) =>
                            setUpdateStatus({
                              kind: "error",
                              version: appVersion ?? "",
                              message:
                                error instanceof Error
                                  ? error.message
                                  : String(error),
                            }),
                          );
                      }}
                    >
                      {updateStatus?.kind === "checking"
                        ? t("settings.updateChecking")
                        : t("settings.updateCheck")}
                    </button>
                    {updateStatus ? (
                      <p
                        className={`text-xs ${
                          updateStatus.kind === "error"
                            ? "text-destructive-ink"
                            : "text-gray-500 dark:text-gray-400"
                        }`}
                      >
                        {updateStatus.kind === "checking"
                          ? t("settings.updateChecking")
                          : updateStatus.kind === "current"
                            ? t("settings.updateCurrent")
                            : updateStatus.kind === "available"
                              ? t("settings.updateAvailable", {
                                  version: updateStatus.version,
                                })
                              : updateStatus.kind === "downloading"
                                ? t("settings.updateDownloading", {
                                    version: updateStatus.version,
                                    percent: updateStatus.percent,
                                  })
                                : updateStatus.kind === "downloaded"
                                  ? t("settings.updateReady", {
                                      version: updateStatus.version,
                                    })
                                  : t("settings.updateError")}
                      </p>
                    ) : null}
                    {updateStatus?.kind === "downloaded" ? (
                      <button
                        type="button"
                        className="btn-primary"
                        onClick={() => {
                          void window.office
                            .installUpdate()
                            .catch(() => undefined);
                        }}
                      >
                        {t("update.restart")}
                      </button>
                    ) : null}
                  </div>
                  <div>
                    <p className="text-sm font-medium text-gray-800 dark:text-gray-200">
                      {t("settings.license")}
                    </p>
                    <p className="mt-0.5 text-sm text-gray-500 dark:text-gray-400">
                      {t("settings.licenseApache")}
                    </p>
                  </div>
                  <p className="text-sm text-gray-500 dark:text-gray-400">
                    {t("settings.licenseCredit")}
                  </p>
                </Group>

                <Group
                  title={t("settings.tourTitle")}
                  hint={t("settings.tourBody")}
                >
                  <button
                    type="button"
                    className="btn-secondary"
                    onClick={onReplayTour}
                  >
                    {t("tour.replay")}
                  </button>
                </Group>
              </div>
            ) : null}

            {section === "profile" ? (
              <div>
                <Group title={t("settings.profilePersonal")}>
                  {(
                    [
                      [
                        "displayName",
                        "profileDisplayName",
                        "profileDisplayNameHint",
                        false,
                      ],
                      [
                        "jobTitle",
                        "profileJobTitle",
                        "profileJobTitleHint",
                        false,
                      ],
                      [
                        "signature",
                        "profileSignature",
                        "profileSignatureHint",
                        true,
                      ],
                    ] as const
                  ).map(([key, labelKey, hintKey, multiline]) => (
                    <TextField
                      key={key}
                      label={t(`settings.${labelKey}`)}
                      placeholder={t(`settings.${hintKey}`)}
                      value={profile[key]}
                      multiline={multiline}
                      minHeightClass="min-h-20"
                      onChange={(next) =>
                        setProfile((prev) => ({ ...prev, [key]: next }))
                      }
                    />
                  ))}
                </Group>

                <Group
                  title={t("settings.company")}
                  hint={t("settings.companyBody")}
                >
                  <div className="space-y-2 rounded bg-gray-50 p-3 ring-1 ring-inset ring-gray-200">
                    <p className="text-xs font-medium text-gray-700">
                      {t("settings.companyFromWeb")}
                    </p>
                    <p className="text-xs text-gray-500">
                      {t("settings.companyFromWebHint")}
                    </p>
                    <div className="flex flex-wrap gap-2">
                      <input
                        className={FIELD_CLASS}
                        value={companySiteUrl}
                        onChange={(event) =>
                          setCompanySiteUrl(event.target.value)
                        }
                        placeholder={t("settings.companyFromWebPlaceholder")}
                        disabled={companySiteBusy || profileBusy}
                      />
                      <button
                        type="button"
                        className="btn-secondary shrink-0 text-xs"
                        disabled={
                          companySiteBusy ||
                          profileBusy ||
                          !companySiteUrl.trim()
                        }
                        onClick={() => {
                          setCompanySiteBusy(true);
                          setCompanySiteError(null);
                          setProfileMessage(null);
                          void window.office
                            .fillCompanyFromWebsite(companySiteUrl.trim())
                            .then((filled) => {
                              setProfile((prev) => ({
                                ...prev,
                                company: filled.profile,
                              }));
                              setProfileMessage(
                                t("settings.companyFromWebDone", {
                                  title: filled.title || filled.sourceUrl,
                                }),
                              );
                              if (filled.blocked) {
                                setCompanySiteError(
                                  t("settings.companyFromWebChallenge"),
                                );
                              }
                            })
                            .catch((err: unknown) => {
                              setCompanySiteError(
                                err instanceof Error
                                  ? err.message
                                  : String(err),
                              );
                            })
                            .finally(() => setCompanySiteBusy(false));
                        }}
                      >
                        {companySiteBusy
                          ? t("settings.companyFromWebWorking")
                          : t("settings.companyFromWebRun")}
                      </button>
                    </div>
                    {companySiteError ? (
                      <p className="text-xs text-destructive-ink" role="alert">
                        {companySiteError}
                      </p>
                    ) : null}
                  </div>
                  {(
                    [
                      ["name", "companyName", "companyNameHint", false],
                      ["about", "companyAbout", "companyAboutHint", true],
                      [
                        "benefits",
                        "companyBenefits",
                        "companyBenefitsHint",
                        true,
                      ],
                      [
                        "workConditions",
                        "companyWorkConditions",
                        "companyWorkConditionsHint",
                        true,
                      ],
                      [
                        "applicationProcess",
                        "companyApplication",
                        "companyApplicationHint",
                        true,
                      ],
                    ] as const
                  ).map(([key, labelKey, hintKey, multiline]) => (
                    <TextField
                      key={key}
                      label={t(`settings.${labelKey}`)}
                      placeholder={t(`settings.${hintKey}`)}
                      value={profile.company[key]}
                      multiline={multiline}
                      onChange={(next) =>
                        setProfile((prev) => ({
                          ...prev,
                          company: { ...prev.company, [key]: next },
                        }))
                      }
                    />
                  ))}
                </Group>

                <div className="flex flex-wrap items-center gap-3 border-t border-gray-200 pt-6">
                  <button
                    type="button"
                    className="btn-primary"
                    disabled={profileBusy}
                    onClick={() => {
                      setProfileBusy(true);
                      setProfileMessage(null);
                      void window.office
                        .saveDeskProfile(profile)
                        .then((saved) => {
                          setProfile(saved);
                          setProfileMessage(t("settings.profileSaved"));
                        })
                        .catch((error: unknown) => {
                          setProfileMessage(
                            error instanceof Error
                              ? error.message
                              : t("settings.saveError"),
                          );
                        })
                        .finally(() => setProfileBusy(false));
                    }}
                  >
                    {t("settings.profileSave")}
                  </button>
                  {profileMessage ? (
                    <p className="text-sm text-gray-500">{profileMessage}</p>
                  ) : null}
                </div>
              </div>
            ) : null}

            {section === "memory" ? (
              <div>
                <Group
                  title={
                    editingMemoryId
                      ? t("settings.memoryEdit")
                      : t("settings.memoryAdd")
                  }
                >
                  <textarea
                    className={`${FIELD_CLASS} min-h-20`}
                    value={memoryDraft}
                    onChange={(event) => setMemoryDraft(event.target.value)}
                    placeholder={t("settings.memoryPlaceholder")}
                    aria-label={
                      editingMemoryId
                        ? t("settings.memoryEdit")
                        : t("settings.memoryAdd")
                    }
                  />
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      className="btn-primary"
                      disabled={memoryBusy || !memoryDraft.trim()}
                      onClick={() => {
                        setMemoryBusy(true);
                        setMemoryNote(null);
                        const body = memoryDraft;
                        const wasEditing = Boolean(editingMemoryId);
                        const request = editingMemoryId
                          ? window.office.updateMemory(editingMemoryId, body)
                          : window.office.addMemory(body);
                        void request
                          .then(() => {
                            setMemoryDraft("");
                            setEditingMemoryId(null);
                            setMemoryNote({
                              scope: "edit",
                              text: wasEditing
                                ? t("settings.memoryUpdated")
                                : t("settings.memoryAdded"),
                            });
                            refreshMemories();
                          })
                          .catch((error: unknown) => {
                            setMemoryNote({
                              scope: "edit",
                              text:
                                error instanceof Error
                                  ? error.message
                                  : t("settings.memoryError"),
                            });
                          })
                          .finally(() => setMemoryBusy(false));
                      }}
                    >
                      {editingMemoryId
                        ? t("settings.memorySave")
                        : t("settings.memoryAddAction")}
                    </button>
                    {editingMemoryId ? (
                      <button
                        type="button"
                        className="btn-secondary"
                        disabled={memoryBusy}
                        onClick={() => {
                          setEditingMemoryId(null);
                          setMemoryDraft("");
                        }}
                      >
                        {t("settings.memoryCancel")}
                      </button>
                    ) : null}
                  </div>
                  <Note text={memoryNoteFor("edit")} />
                </Group>

                <Group
                  title={t("settings.memoryImportTitle")}
                  hint={t("settings.memoryImportBody")}
                >
                  <textarea
                    className={`${FIELD_CLASS} min-h-28`}
                    value={memoryImport}
                    onChange={(event) => setMemoryImport(event.target.value)}
                    placeholder={t("settings.memoryImportPlaceholder")}
                    aria-label={t("settings.memoryImportTitle")}
                  />
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      className="btn-secondary"
                      disabled={memoryBusy}
                      onClick={() => {
                        setMemoryNote(null);
                        // The native dialog runs on main; don't flip memoryBusy
                        // until a file is actually picked so cancel feels instant.
                        void window.office
                          .importMemoriesFromFile()
                          .then((result) => {
                            if (!result) return;
                            setMemoryImport("");
                            setMemoryNote({
                              scope: "import",
                              text: t("settings.memoryImportFileResult", {
                                file: result.fileName,
                                imported: result.imported,
                                skipped: result.skipped,
                              }),
                            });
                            refreshMemories();
                          })
                          .catch((error: unknown) => {
                            setMemoryNote({
                              scope: "import",
                              text:
                                error instanceof Error
                                  ? error.message
                                  : t("settings.memoryError"),
                            });
                          });
                      }}
                    >
                      {t("settings.memoryImportFile")}
                    </button>
                    <button
                      type="button"
                      className="btn-secondary"
                      disabled={memoryBusy || !memoryImport.trim()}
                      onClick={() => {
                        setMemoryBusy(true);
                        setMemoryNote(null);
                        void window.office
                          .importMemories(memoryImport)
                          .then((result) => {
                            setMemoryImport("");
                            setMemoryNote({
                              scope: "import",
                              text: t("settings.memoryImportResult", {
                                imported: result.imported,
                                skipped: result.skipped,
                              }),
                            });
                            refreshMemories();
                          })
                          .catch((error: unknown) => {
                            setMemoryNote({
                              scope: "import",
                              text:
                                error instanceof Error
                                  ? error.message
                                  : t("settings.memoryError"),
                            });
                          })
                          .finally(() => setMemoryBusy(false));
                      }}
                    >
                      {t("settings.memoryImportAction")}
                    </button>
                  </div>
                  <Note text={memoryNoteFor("import")} />
                </Group>

                <Group
                  title={t("settings.memoryListTitle", {
                    count: memories.length,
                  })}
                >
                  {memories.length === 0 ? (
                    <p className="text-sm text-gray-500">
                      {t("settings.memoryEmpty")}
                    </p>
                  ) : (
                    <ul className="divide-y divide-gray-300">
                      {memories.map((item) => (
                        <li
                          key={item.id}
                          className="flex items-start justify-between gap-3 py-3 first:pt-0"
                        >
                          <div className="min-w-0">
                            <p className="text-sm text-gray-900">{item.body}</p>
                            <p className="mt-1 text-xs text-gray-500">
                              {item.source === "import"
                                ? t("settings.memorySourceImport")
                                : t("settings.memorySourceManual")}
                            </p>
                          </div>
                          <div className="flex shrink-0 gap-1">
                            <button
                              type="button"
                              className="btn-secondary px-2 py-1 text-xs"
                              disabled={memoryBusy}
                              onClick={() => {
                                setEditingMemoryId(item.id);
                                setMemoryDraft(item.body);
                                setMemoryNote(null);
                              }}
                            >
                              {t("settings.memoryEditAction")}
                            </button>
                            <button
                              type="button"
                              className="btn-secondary px-2 py-1 text-xs"
                              disabled={memoryBusy}
                              onClick={() => {
                                if (
                                  !window.confirm(
                                    t("settings.memoryDeleteConfirm"),
                                  )
                                ) {
                                  return;
                                }
                                setMemoryBusy(true);
                                void window.office
                                  .deleteMemory(item.id)
                                  .then(() => {
                                    if (editingMemoryId === item.id) {
                                      setEditingMemoryId(null);
                                      setMemoryDraft("");
                                    }
                                    refreshMemories();
                                  })
                                  .finally(() => setMemoryBusy(false));
                              }}
                            >
                              {t("settings.memoryDelete")}
                            </button>
                          </div>
                        </li>
                      ))}
                    </ul>
                  )}
                </Group>
              </div>
            ) : null}

            {section === "models" ? (
              <div>
                <Group
                  title={t("settings.gpuTitle")}
                  hint={t("settings.gpuBody")}
                >
                  <p className="text-xs text-gray-500">
                    {t("settings.modeRoles", {
                      mode: t("modeLocal"),
                      roles:
                        (setup.state.downloadedRoles ?? []).join(", ") ||
                        t("settings.none"),
                    })}
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {(
                      [
                        ["auto", "settings.gpuAuto"],
                        ["gpu", "settings.gpuGpu"],
                        ["cpu", "settings.gpuCpu"],
                      ] as const
                    ).map(([value, labelKey]) => (
                      <button
                        key={value}
                        type="button"
                        className={
                          setup.state.gpuPreference === value
                            ? "btn-primary"
                            : "btn-secondary"
                        }
                        onClick={() => {
                          setRuntimeMessage(t("settings.gpuSaving"));
                          void window.office
                            .saveGpuPreference(value)
                            .then((snapshot) => {
                              onSetupChange(snapshot);
                              setRuntimeMessage(t("settings.gpuSaved"));
                            })
                            .catch((error: unknown) => {
                              setRuntimeMessage(
                                error instanceof Error
                                  ? error.message
                                  : t("settings.saveError"),
                              );
                              void window.office
                                .getSetupSnapshot()
                                .then(onSetupChange);
                            });
                        }}
                      >
                        {t(labelKey)}
                      </button>
                    ))}
                  </div>
                  <Note text={runtimeMessage} />
                  {onOpenDevice ? (
                    <button
                      type="button"
                      className="text-xs font-semibold text-brand-600 underline underline-offset-2"
                      onClick={onOpenDevice}
                    >
                      {t("settings.openDevice")}
                    </button>
                  ) : null}
                </Group>

                <Group title={t("asrSetup.title")} hint={t("asrSetup.hint")}>
                  <AsrSetupCard active={section === "models"} compact />
                </Group>

                <Group
                  title={t("settings.redrobKeyTitle")}
                  hint={t("settings.redrobKeyBody")}
                >
                  <DeviceConnectPanel state={connect} />
                  <form
                    className="mt-4 space-y-3"
                    onSubmit={(event) => {
                      event.preventDefault();
                      setProvidersMessage(null);
                      void window.office
                        .saveLlmSettings({
                          inferenceRoute: "openai",
                          llmProviders: {
                            openai: {
                              apiKey: redrobKey,
                              baseUrl: REDROB_CONSOLE_API_BASE,
                            },
                          },
                        })
                        .then((snapshot) => {
                          onSetupChange(snapshot);
                          setProvidersMessage(t("settings.providersSaved"));
                          setRedrobKey("");
                        })
                        .catch((error: unknown) => {
                          setProvidersMessage(
                            error instanceof Error
                              ? error.message
                              : t("settings.saveError"),
                          );
                        });
                    }}
                  >
                    <ApiKeyField
                      label={t("settings.redrobKeyLabel")}
                      placeholder={t("settings.redrobKeyPlaceholder")}
                      value={redrobKey}
                      configured={Boolean(
                        setup.state.llmProviders?.openai?.apiKey,
                      )}
                      onChange={setRedrobKey}
                    />
                    <div className="flex flex-wrap items-center gap-2">
                      <button className="btn-secondary" type="submit">
                        {t("settings.saveProviders")}
                      </button>
                      <button
                        type="button"
                        className="btn-secondary inline-flex items-center gap-1.5"
                        onClick={() => {
                          void window.office.openExternal(REDROB_CONSOLE_URL);
                        }}
                      >
                        <ExternalLinkIcon className="h-3.5 w-3.5" />
                        {t("settings.redrobKeyOpenConsole")}
                      </button>
                    </div>
                    <Note text={providersMessage} />
                  </form>
                </Group>

                <Group
                  title={t("paySheet.settingsTitle")}
                  hint={t("paySheet.settingsBody")}
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      className="btn-primary"
                      onClick={() => {
                        refreshCredit();
                        setPayOpen(true);
                      }}
                    >
                      {t("paySheet.settingsOpen")}
                    </button>
                  </div>
                  {credit?.blocked ? (
                    <Note text={t("paySheet.settingsBlocked")} />
                  ) : null}
                </Group>
              </div>
            ) : null}

            {section === "mcp" ? (
              <div>
                <McpSettingsCard />
              </div>
            ) : null}

            {section === "computer" ? (
              <div>
                <Group
                  title={t("settings.computerPathsTitle")}
                  hint={t("settings.computerPathsBody")}
                >
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      className="btn-primary"
                      onClick={() => {
                        void window.office.pickAllowedFolder().then((path) => {
                          if (!path) return;
                          void window.office
                            .getAllowedPaths()
                            .then(setAllowedPaths);
                        });
                      }}
                    >
                      {t("settings.computerAddFolder")}
                    </button>
                    <button
                      type="button"
                      className="btn-secondary"
                      onClick={() => {
                        void window.office
                          .listToolAudit(40)
                          .then(setToolAudit)
                          .catch(() => setToolAudit([]));
                        void window.office
                          .getAllowedPaths()
                          .then(setAllowedPaths)
                          .catch(() => setAllowedPaths([]));
                      }}
                    >
                      {t("settings.computerAuditRefresh")}
                    </button>
                  </div>
                  {allowedPaths.length === 0 ? (
                    <p className="mt-3 text-sm text-gray-500">
                      {t("settings.computerPathsEmpty")}
                    </p>
                  ) : (
                    <ul className="mt-3 space-y-2">
                      {allowedPaths.map((path) => (
                        <li
                          key={path}
                          className="flex items-start justify-between gap-3 rounded border border-gray-200 bg-white px-3 py-2"
                        >
                          <code className="break-all text-xs text-gray-800">
                            {path}
                          </code>
                          <button
                            type="button"
                            className="shrink-0 text-xs font-medium text-destructive-ink hover:underline"
                            onClick={() => {
                              void window.office
                                .removeAllowedPath(path)
                                .then(setAllowedPaths)
                                .catch(() => undefined);
                            }}
                          >
                            {t("settings.computerRemove")}
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                </Group>
                <Group
                  title={t("settings.computerPolicyTitle")}
                  hint={t("settings.computerPolicyBody")}
                >
                  <div className="grid gap-3 sm:grid-cols-2">
                    <label className="block text-sm text-gray-700">
                      <span className="mb-1 block font-medium">
                        {t("settings.computerProfile")}
                      </span>
                      <select
                        className="w-full rounded border border-gray-200 bg-white px-3 py-2 text-sm"
                        value={computerUseSettings.profile}
                        onChange={(e) => {
                          const profile = e.target
                            .value as typeof computerUseSettings.profile;
                          setComputerUseSettings((prev) => ({
                            ...prev,
                            profile,
                          }));
                          void window.office
                            .updateComputerUseSettings({ profile })
                            .then((s) =>
                              setComputerUseSettings({
                                profile: s.profile,
                                execSecurity: s.execSecurity,
                                execAsk: s.execAsk,
                                sandboxMode: s.sandboxMode,
                                elevatedEnabled: s.elevatedEnabled,
                                readerPass: s.readerPass,
                                desktopControl: s.desktopControl,
                                backgroundControl: s.backgroundControl,
                                browserTarget: s.browserTarget,
                              }),
                            )
                            .catch(() => undefined);
                        }}
                      >
                        <option value="author">
                          {t("settings.computerProfileAuthor")}
                        </option>
                        <option value="readonly">
                          {t("settings.computerProfileReadonly")}
                        </option>
                        <option value="minimal">
                          {t("settings.computerProfileMinimal")}
                        </option>
                        <option value="full">
                          {t("settings.computerProfileFull")}
                        </option>
                      </select>
                    </label>
                    <label className="block text-sm text-gray-700">
                      <span className="mb-1 block font-medium">
                        {t("settings.computerExecSecurity")}
                      </span>
                      <select
                        className="w-full rounded border border-gray-200 bg-white px-3 py-2 text-sm"
                        value={computerUseSettings.execSecurity}
                        onChange={(e) => {
                          const execSecurity = e.target
                            .value as typeof computerUseSettings.execSecurity;
                          setComputerUseSettings((prev) => ({
                            ...prev,
                            execSecurity,
                          }));
                          void window.office
                            .updateComputerUseSettings({ execSecurity })
                            .catch(() => undefined);
                        }}
                      >
                        <option value="deny">
                          {t("settings.computerExecDeny")}
                        </option>
                        <option value="allowlist">
                          {t("settings.computerExecAllowlist")}
                        </option>
                        <option value="full">
                          {t("settings.computerExecFull")}
                        </option>
                      </select>
                    </label>
                    <label className="block text-sm text-gray-700">
                      <span className="mb-1 block font-medium">
                        {t("settings.computerExecAsk")}
                      </span>
                      <select
                        className="w-full rounded border border-gray-200 bg-white px-3 py-2 text-sm"
                        value={computerUseSettings.execAsk}
                        onChange={(e) => {
                          const execAsk = e.target
                            .value as typeof computerUseSettings.execAsk;
                          setComputerUseSettings((prev) => ({
                            ...prev,
                            execAsk,
                          }));
                          void window.office
                            .updateComputerUseSettings({ execAsk })
                            .catch(() => undefined);
                        }}
                      >
                        <option value="always">
                          {t("settings.computerExecAskAlways")}
                        </option>
                        <option value="once">
                          {t("settings.computerExecAskOnce")}
                        </option>
                        <option value="off">
                          {t("settings.computerExecAskOff")}
                        </option>
                      </select>
                    </label>
                    <label className="flex items-center gap-2 text-sm text-gray-700">
                      <input
                        type="checkbox"
                        checked={computerUseSettings.elevatedEnabled}
                        onChange={(e) => {
                          const elevatedEnabled = e.target.checked;
                          setComputerUseSettings((prev) => ({
                            ...prev,
                            elevatedEnabled,
                          }));
                          void window.office
                            .updateComputerUseSettings({ elevatedEnabled })
                            .catch(() => undefined);
                        }}
                      />
                      {t("settings.computerElevated")}
                    </label>
                    <label className="flex items-center gap-2 text-sm text-gray-700">
                      <input
                        type="checkbox"
                        checked={computerUseSettings.readerPass}
                        onChange={(e) => {
                          const readerPass = e.target.checked;
                          setComputerUseSettings((prev) => ({
                            ...prev,
                            readerPass,
                          }));
                          void window.office
                            .updateComputerUseSettings({ readerPass })
                            .catch(() => undefined);
                        }}
                      />
                      {t("settings.computerReaderPass")}
                    </label>

                    {/*
                      Kept apart from the settings above with a rule and a
                      colour, because it is a different kind of permission: the
                      others widen what a task may do to files, and this one
                      hands it the pointer and keyboard of the whole machine.
                    */}
                    <div className="mt-1 rounded border border-warning-muted bg-warning-soft p-3 sm:col-span-2">
                      <label className="flex items-start gap-2 text-sm text-gray-800 dark:text-gray-200">
                        <input
                          type="checkbox"
                          className="mt-0.5"
                          checked={computerUseSettings.desktopControl}
                          disabled={
                            desktopStatus?.state === "unsupported" ||
                            desktopStatus?.state === "stopped"
                          }
                          onChange={(e) => {
                            const desktopControl = e.target.checked;
                            setComputerUseSettings((prev) => ({
                              ...prev,
                              desktopControl,
                            }));
                            void window.office
                              .updateComputerUseSettings({ desktopControl })
                              .then(() => window.office.desktopControlStatus())
                              .then(setDesktopStatus)
                              .catch(() => undefined);
                          }}
                        />
                        <span>
                          <span className="block font-medium">
                            {t("settings.desktopControl")}
                          </span>
                          <span className="block text-xs text-gray-600 dark:text-gray-400">
                            {t("settings.desktopControlHint")}
                          </span>
                        </span>
                      </label>

                      {desktopStatus && desktopStatus.state !== "ready" ? (
                        <p className="mt-2 text-xs text-warning-ink">
                          {desktopStatus.reason}
                        </p>
                      ) : null}

                      <p className="mt-2 text-xs text-gray-600 dark:text-gray-400">
                        {t("settings.desktopControlStop", {
                          keys: (desktopStatus?.accelerator ?? "").replace(
                            "CommandOrControl",
                            "Ctrl",
                          ),
                        })}
                      </p>

                      <div className="mt-2 flex gap-2">
                        <button
                          type="button"
                          className="rounded bg-destructive px-3 py-1.5 text-xs font-medium text-destructive-foreground disabled:opacity-40"
                          disabled={desktopStatus?.state === "stopped"}
                          onClick={() => {
                            void window.office
                              .desktopStopNow()
                              .then(() => window.office.desktopControlStatus())
                              .then((status) => {
                                setDesktopStatus(status);
                                setComputerUseSettings((prev) => ({
                                  ...prev,
                                  desktopControl: false,
                                }));
                              })
                              .catch(() => undefined);
                          }}
                        >
                          {t("settings.desktopStopNow")}
                        </button>
                        {desktopStatus?.state === "stopped" ? (
                          <button
                            type="button"
                            className="btn-secondary px-3 py-1.5 text-xs"
                            onClick={() => {
                              void window.office
                                .desktopResume()
                                .then(() =>
                                  window.office.desktopControlStatus(),
                                )
                                .then(setDesktopStatus)
                                .catch(() => undefined);
                            }}
                          >
                            {t("settings.desktopResume")}
                          </button>
                        ) : null}
                      </div>

                      {/*
                        Whose turn it is at the keyboard. Everything above is
                        about what a run may reach; this is about whether it
                        may interrupt the person while it does.
                      */}
                      <label className="mt-3 flex items-start gap-2 border-t border-warning-muted pt-3 text-sm text-gray-800 dark:text-gray-200">
                        <input
                          type="checkbox"
                          className="mt-0.5"
                          checked={computerUseSettings.backgroundControl}
                          onChange={(e) => {
                            const backgroundControl = e.target.checked;
                            setComputerUseSettings((prev) => ({
                              ...prev,
                              backgroundControl,
                            }));
                            void window.office
                              .updateComputerUseSettings({ backgroundControl })
                              .catch(() => undefined);
                          }}
                        />
                        <span>
                          <span className="block font-medium">
                            {t("settings.backgroundControl")}
                          </span>
                          <span className="block text-xs text-gray-600 dark:text-gray-400">
                            {t("settings.backgroundControlHint")}
                          </span>
                        </span>
                      </label>
                    </div>
                  </div>
                </Group>
                <Group
                  title={t("settings.computerAuditTitle")}
                  hint={t("settings.computerAuditBody")}
                >
                  {toolAudit.length === 0 ? (
                    <p className="text-sm text-gray-500">
                      {t("settings.computerAuditEmpty")}
                    </p>
                  ) : (
                    <ul className="max-h-80 space-y-2 overflow-auto">
                      {toolAudit.map((row, index) => (
                        <li
                          key={`${row.eventTime}-${row.toolName ?? row.event}-${index}`}
                          className="rounded border border-gray-200 bg-gray-50 px-3 py-2 text-xs text-gray-700"
                        >
                          <div className="flex flex-wrap items-center gap-2 font-medium text-gray-900">
                            <span>{row.toolName ?? row.event}</span>
                            <span
                              className={
                                row.kind === "error"
                                  ? "text-destructive-ink"
                                  : "text-success-ink"
                              }
                            >
                              {row.kind === "error"
                                ? t("settings.computerAuditFail")
                                : t("settings.computerAuditOk")}
                            </span>
                            <span className="text-gray-500">
                              {new Date(row.eventTime).toLocaleString()}
                            </span>
                          </div>
                          <p className="mt-1">{row.resultSummary}</p>
                          <p className="mt-1 text-gray-500">
                            {row.argsSummary}
                          </p>
                        </li>
                      ))}
                    </ul>
                  )}
                </Group>
              </div>
            ) : null}

            {section === "privacy" ? (
              <div>
                <Group
                  title={t("settings.backup")}
                  hint={t("settings.backupBody")}
                >
                  {account?.signedIn ? (
                    <>
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <p className="text-sm text-gray-800">
                          {t("settings.backupSignedInAs", {
                            email: account.email ?? "",
                          })}
                        </p>
                        <button
                          type="button"
                          className="btn-secondary"
                          onClick={() => {
                            void window.office
                              .signOutAccount()
                              .then((snapshot) => {
                                setAccount(snapshot);
                                setBackupMessage(null);
                              })
                              .catch((error: unknown) => {
                                setBackupMessage(
                                  error instanceof Error
                                    ? error.message
                                    : t("settings.backupError"),
                                );
                              });
                          }}
                        >
                          {t("settings.backupSignOut")}
                        </button>
                      </div>
                      <label className="flex items-start gap-3 text-sm">
                        <input
                          type="checkbox"
                          className="mt-1"
                          checked={account.backupEnabled}
                          onChange={(event) => {
                            const enabled = event.target.checked;
                            void window.office
                              .setBackupOptIn(enabled)
                              .then(setAccount)
                              .catch((error: unknown) => {
                                setBackupMessage(
                                  error instanceof Error
                                    ? error.message
                                    : t("settings.backupError"),
                                );
                              });
                          }}
                        />
                        <span>
                          <span className="font-medium text-gray-800">
                            {t("settings.backupEnable")}
                          </span>
                          <span className="mt-0.5 block text-xs text-gray-500">
                            {t("settings.backupEnableHint")}
                          </span>
                        </span>
                      </label>
                      <div className="flex flex-wrap gap-2">
                        <button
                          type="button"
                          className="btn-primary"
                          disabled={backupBusy}
                          onClick={() => {
                            setBackupBusy(true);
                            setBackupMessage(t("settings.backupBusy"));
                            void window.office
                              .createLocalBackup()
                              .then((result) => {
                                if (result.ok) {
                                  setBackupMessage(
                                    t("settings.backupCreateDone", {
                                      path: result.path,
                                    }),
                                  );
                                } else if (
                                  "canceled" in result &&
                                  result.canceled
                                ) {
                                  setBackupMessage(
                                    t("settings.backupCanceled"),
                                  );
                                } else {
                                  setBackupMessage(
                                    "error" in result
                                      ? result.error
                                      : t("settings.backupError"),
                                  );
                                }
                              })
                              .catch((error: unknown) => {
                                setBackupMessage(
                                  error instanceof Error
                                    ? error.message
                                    : t("settings.backupError"),
                                );
                              })
                              .finally(() => setBackupBusy(false));
                          }}
                        >
                          {t("settings.backupCreate")}
                        </button>
                        <button
                          type="button"
                          className="btn-secondary"
                          disabled={backupBusy}
                          onClick={() => {
                            setBackupBusy(true);
                            setBackupMessage(t("settings.backupBusy"));
                            void window.office
                              .restoreLocalBackup({
                                title: t("settings.backupRestoreDialogTitle"),
                                message: t(
                                  "settings.backupRestoreDialogMessage",
                                ),
                                detail: t("settings.backupRestoreDialogDetail"),
                                cancel: t("settings.backupRestoreDialogCancel"),
                                confirm: t(
                                  "settings.backupRestoreDialogConfirm",
                                ),
                              })
                              .then((result) => {
                                if (result.ok) {
                                  setBackupMessage(
                                    t("settings.backupRestoreDone"),
                                  );
                                } else if (
                                  "canceled" in result &&
                                  result.canceled
                                ) {
                                  setBackupMessage(
                                    t("settings.backupCanceled"),
                                  );
                                } else {
                                  setBackupMessage(
                                    "error" in result
                                      ? result.error
                                      : t("settings.backupError"),
                                  );
                                }
                              })
                              .catch((error: unknown) => {
                                setBackupMessage(
                                  error instanceof Error
                                    ? error.message
                                    : t("settings.backupError"),
                                );
                              })
                              .finally(() => setBackupBusy(false));
                          }}
                        >
                          {t("settings.backupRestore")}
                        </button>
                      </div>
                      <p className="text-xs leading-relaxed text-gray-500">
                        {t("settings.backupCreateHint")}
                      </p>
                      <p className="text-xs leading-relaxed text-gray-500">
                        {t("settings.backupRestoreHint")}
                      </p>
                    </>
                  ) : (
                    <form
                      className="space-y-3"
                      onSubmit={(event) => {
                        event.preventDefault();
                        void window.office
                          .signInForBackup(backupEmail)
                          .then((snapshot) => {
                            setAccount(snapshot);
                            setBackupMessage(null);
                          })
                          .catch((error: unknown) => {
                            setBackupMessage(
                              error instanceof Error
                                ? error.message
                                : t("settings.backupError"),
                            );
                          });
                      }}
                    >
                      <label className="block space-y-1.5">
                        <span className="text-sm font-medium text-gray-900">
                          {t("settings.backupEmail")}
                        </span>
                        <input
                          className={FIELD_CLASS}
                          type="email"
                          autoComplete="email"
                          required
                          value={backupEmail}
                          onChange={(event) =>
                            setBackupEmail(event.target.value)
                          }
                          placeholder={t("settings.backupEmailHint")}
                        />
                      </label>
                      <button className="btn-primary" type="submit">
                        {t("settings.backupSignIn")}
                      </button>
                    </form>
                  )}
                  <Note text={backupMessage} />
                </Group>

                <Group
                  title={t("settings.telemetry")}
                  hint={t("settings.telemetryBody")}
                >
                  <label className="flex items-start gap-3 text-sm">
                    <input
                      type="checkbox"
                      className="mt-1"
                      checked={telemetryOptIn}
                      onChange={(event) => {
                        const optedIn = event.target.checked;
                        setTelemetryOptIn(optedIn);
                        void window.office
                          .setTelemetryOptIn(optedIn)
                          .then(setTelemetryOptIn)
                          .catch(() => undefined);
                      }}
                    />
                    <span>
                      <span className="font-medium text-gray-800">
                        {t("settings.telemetryOptIn")}
                      </span>
                      <span className="mt-0.5 block text-xs text-gray-500">
                        {t("settings.telemetryOptInHint")}
                      </span>
                    </span>
                  </label>
                  <button
                    type="button"
                    className="btn-secondary"
                    onClick={() => {
                      if (telemetryPreview) {
                        setTelemetryPreview(null);
                        return;
                      }
                      void window.office
                        .getTelemetryPreview(5)
                        .then((events) => setTelemetryPreview(events))
                        .catch(() => setTelemetryPreview([]));
                    }}
                  >
                    {telemetryPreview
                      ? t("settings.telemetryPreviewHide")
                      : t("settings.telemetryPreview")}
                  </button>
                  {telemetryPreview ? (
                    telemetryPreview.length === 0 ? (
                      <p className="text-xs text-gray-500">
                        {t("settings.telemetryPreviewEmpty")}
                      </p>
                    ) : (
                      <>
                        <p className="text-xs text-gray-500">
                          {t("settings.telemetryPreviewCount", {
                            count: telemetryPreview.length,
                          })}
                        </p>
                        <pre className="max-h-64 overflow-auto rounded bg-gray-50 p-3 text-[0.6875rem] leading-relaxed text-gray-700 ring-1 ring-inset ring-gray-300">
                          {JSON.stringify(telemetryPreview, null, 2)}
                        </pre>
                      </>
                    )
                  ) : null}
                </Group>

                <Group
                  title={t("settings.logsTitle")}
                  hint={t("settings.logsBody")}
                >
                  <button
                    type="button"
                    className="btn-secondary"
                    onClick={() => {
                      setLogsError(null);
                      void window.office
                        .revealLogsFolder()
                        .catch((error: unknown) => {
                          setLogsError(
                            error instanceof Error
                              ? error.message
                              : String(error),
                          );
                        });
                    }}
                  >
                    {t("settings.openLogs")}
                  </button>
                  {logsError ? (
                    <p className="text-xs text-destructive-ink">{logsError}</p>
                  ) : null}
                </Group>

                <Group
                  title={t("settings.dataTitle")}
                  hint={t("settings.dataBody")}
                >
                  <button
                    type="button"
                    className="btn-secondary"
                    disabled={dataBusy}
                    onClick={() => {
                      setDataBusy(true);
                      setDataMessage(t("settings.dataClearBusy"));
                      void window.office
                        .wipeLocalData({
                          title: t("settings.dataClearDialogTitle"),
                          message: t("settings.dataClearDialogMessage"),
                          detail: t("settings.dataClearDialogDetail"),
                          cancel: t("settings.dataClearDialogCancel"),
                          confirm: t("settings.dataClearDialogConfirm"),
                        })
                        .then((result) => {
                          if (result.ok) {
                            setDataMessage(
                              t("settings.dataCleared", {
                                documents: result.documents,
                                fields: result.fields,
                                chats: result.chats ?? 0,
                                floorMessages: result.floorMessages ?? 0,
                                artifacts: result.artifacts ?? 0,
                              }),
                            );
                            return;
                          }
                          if ("canceled" in result && result.canceled) {
                            setDataMessage(t("settings.dataClearCanceled"));
                            return;
                          }
                          setDataMessage(
                            "error" in result
                              ? result.error
                              : t("settings.dataClearError"),
                          );
                        })
                        .catch((error: unknown) => {
                          setDataMessage(
                            error instanceof Error
                              ? error.message
                              : t("settings.dataClearError"),
                          );
                        })
                        .finally(() => setDataBusy(false));
                    }}
                  >
                    {dataBusy
                      ? t("settings.dataClearBusy")
                      : t("settings.dataClear")}
                  </button>
                  <Note text={dataMessage} />
                </Group>
              </div>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}
