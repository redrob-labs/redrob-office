// UI-ONLY BUILD: in the desktop app the renderer reached the Electron main
// process through preload bridges exposed as window.aiOffice / aiOfficeTabs /
// aiOfficeWindow / aiOfficeProject. Those bridges and the main process behind
// them are removed here, so this module installs inert, type-correct stand-ins
// on window before the app mounts. The shell therefore renders its full chrome
// (home screen, tab strip, settings) against empty, local, in-memory state:
// no recents, logged-out account, default theme/prefs, and every action that
// would have crossed into the backend is a no-op. Import this FIRST in main.tsx.
import type { HomeApi, ProjectHomeApi, UiLanguage, UiTheme, RecentPage } from '../../shared/home-api'
import type { TabsApi, TabSummary } from '../../shared/tabs-api'
import type { WindowApi, WindowState, WindowPlatform } from '../../shared/window-api'
import { DEFAULT_OFFICE_PREFS, type OfficePrefs } from '@genoffice/electron-utils/office-prefs'
import { defaultAiSettings } from '@genoffice/ai-provider'

const noop = (): void => {}
const unsub = (): (() => void) => noop
const emptyPage = (): RecentPage => ({ entries: [], total: 0, totalAll: 0 })
let prefs: OfficePrefs = { ...DEFAULT_OFFICE_PREFS }

const platform: WindowPlatform =
  navigator.platform.toLowerCase().includes('mac')
    ? 'darwin'
    : navigator.platform.toLowerCase().includes('win')
      ? 'win32'
      : 'linux'

const home: HomeApi = {
  recents: async () => emptyPage(),
  starred: async () => emptyPage(),
  statPaths: async () => [],
  toggleStar: async () => {},
  openPath: async () => {},
  browse: async () => {},
  newDoc: async () => {},
  newSheet: async () => {},
  newSlide: async () => {},
  newMarkdown: async () => {},
  newPdf: async () => {},
  newHangul: async () => {},
  ask: async () => {},
  removeRecent: async () => {},
  revealPath: async () => {},
  renameFile: async () => ({ ok: false, error: 'unavailable in UI-only build' }),
  duplicateFile: async () => {},
  deleteFiles: async () => {},
  openTrash: async () => {},
  getLanguage: async () => 'en' as UiLanguage,
  setLanguage: async () => {},
  getUpdateChannel: async () => 'stable',
  setUpdateChannel: async () => {},
  accountStatus: async () => ({ loggedIn: false }),
  accountLogin: async () => false,
  onAccountLogin: () => unsub(),
  openLoginUrl: async () => {},
  accountLogout: async () => {},
  getAppVersion: async () => '0.1.0-ui',
  hangulAi: async () => true,
  onboardingSeen: async () => true,
  setOnboardingSeen: async () => true,
  getTheme: async () => 'system' as UiTheme,
  setTheme: async () => {},
  getOfficePrefs: async () => ({ ...prefs }),
  setOfficePrefs: async (patch) => {
    prefs = { ...prefs, ...patch }
    return { ...prefs }
  },
  onOfficePrefsChanged: () => unsub(),
  takeLaunch: async () => false,
  getAnalyticsEnabled: async () => false,
  setAnalyticsEnabled: async (enabled) => enabled,
  getDefaultSaveDir: async () => '',
  pickDefaultSaveDir: async () => null,
  onThemeChanged: () => unsub(),
  openGenTeam: async () => {},
  openCreditUsage: async () => {},
  openGitHubRepo: async () => {},
  githubStars: async () => null,
  starPromptShouldShow: async () => ({ show: false, docOpens: 0 }),
  starPromptAction: async () => {},
  cloudProjectsCached: async () => null,
  cloudProjectsSync: async () => null,
  openCloudProject: async () => {},
  getAiSettings: async () => defaultAiSettings(),
  setAiSettings: async () => {},
  getAiProviders: () => [],
  getModelGuide: async () => null,
  testAiSettings: async () => {
    throw new Error('AI is unavailable in the UI-only build')
  },
  startRedrobConnect: async () => ({
    id: 'ui-stub',
    userCode: '',
    verificationUri: '',
    verificationUriComplete: '',
    expiresIn: 0,
  }),
  awaitRedrobConnect: async () => ({ status: 'unreachable' }),
  cancelRedrobConnect: async () => {},
}

const project: ProjectHomeApi = {
  listProjects: async () => [],
  listFiles: async () => [],
  createProject: async (name) => ({
    id: 'ui-stub',
    name,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    fileCount: 0,
    lastActiveAt: new Date().toISOString(),
    isDefault: false,
  }),
  renameProject: async () => {},
  deleteProject: async () => {},
  moveFile: async () => {},
  getTimeline: async () => [],
}

const tabs: TabsApi = {
  list: async () => [{ id: 'home', kind: 'home', title: 'Home', closable: false, active: true } as TabSummary],
  activate: async () => {},
  close: async () => {},
  showMenu: async () => {},
  showNewMenu: async () => {},
  reorder: async () => {},
  onChanged: () => unsub(),
  notifyChromePressed: noop,
  onChromePressed: () => unsub(),
}

const win: WindowApi = {
  platform,
  minimize: async () => {},
  toggleMaximize: async () => {},
  close: async () => {},
  state: async (): Promise<WindowState> => ({ maximized: false }),
  onStateChanged: () => unsub(),
  showAppMenu: async () => {},
  focusSearch: async () => {},
}

export function installUiStubs(): void {
  const w = window as unknown as Record<string, unknown>
  if (!w.aiOffice) w.aiOffice = home
  if (!w.aiOfficeTabs) w.aiOfficeTabs = tabs
  if (!w.aiOfficeWindow) w.aiOfficeWindow = win
  if (!w.aiOfficeProject) w.aiOfficeProject = project
}

installUiStubs()
