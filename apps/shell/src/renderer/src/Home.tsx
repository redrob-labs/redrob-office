import { useCallback, useEffect, useRef, useState } from 'react'
import type { ReactElement } from 'react'
import logoLockup from './assets/redrob-logo.svg'
import logoLockupOnDark from './assets/redrob-logo-on-dark.svg'
import iconDocx from './assets/file-docx.svg'
import iconXlsx from './assets/file-xlsx.svg'
import iconPptx from './assets/file-pptx.svg'
import iconPdf from './assets/file-pdf.svg'
import iconMd from './assets/file-md.svg'
import iconHwp from './assets/file-hwp.svg'
import type {
  HomeApi,
  ProjectHomeApi,
  ProjectSummaryEntry,
  RecentEntry,
} from '../../shared/home-api'
import {
  Button,
  Dialog,
  EmptyState,
  Icon,
  IconButton,
  Tabs,
  useDismissablePopover,
} from '@genoffice/ui'
import { fileCountKey, visiblePageCount } from './counts'
import { displayParentDir } from './recent-location'
import { useI18n } from './locale'
import type { I18n, StringKey } from './locale'
import { SettingsModal } from './SettingsModal'
import { HomeHero } from './home/HomeHero'
import './home/home-hero.css'
import { HomeFoot } from './home/HomeFoot'
import { UpdatesView } from './home/UpdatesView'
import { TimelineSection } from './home/TimelineSection'
import { useFacts } from './home/useFacts'
import { waitingFiles } from '@genoffice/facts'
import type { FactsApi } from '../../shared/facts-api'
import type { IdentityApi } from '@genoffice/identity'
import type { ShareApi } from '@genoffice/sync-client'
import { SharedView } from './home/SharedView'
import { useJoinLink } from './home/JoinLink'
import type { StartKind } from './home/formats'

declare global {
  interface Window {
    aiOffice: HomeApi
    aiOfficeProject?: ProjectHomeApi
    aiOfficeFacts?: FactsApi
    aiOfficeIdentity?: IdentityApi
    aiOfficeShare?: ShareApi
  }
}

/** page size of the home list; scrolling to the bottom auto-loads the next page */
const PAGE_SIZE = 50


const FILE_ICONS: Record<string, string> = {
  docx: iconDocx,
  xlsx: iconXlsx,
  xlsm: iconXlsx,
  pptx: iconPptx,
  pdf: iconPdf,
  md: iconMd,
  markdown: iconMd,
  hwp: iconHwp,
  hwpx: iconHwp,
}

/* Formats the open-local card advertises. Too long for the card at any window
   width, so it ellipsizes and a hover ScreenTip carries the full list. Keep in
   sync with the main-process open-dialog filter (OPEN_DIALOG_EXTENSIONS) — one
   spelling per format, since the card ellipsizes and a second spelling of the
   same thing costs width for nothing. The dialog also accepts .markdown, .doc,
   .ppt and .hwpx. */
const OPEN_LOCAL_EXTENSIONS = '.docx / .xlsx / .xlsm / .xls / .csv / .pptx / .pdf / .md / .hwp'

function FileBadge({ ext, size }: { ext: string; size: number }) {
  const icon = FILE_ICONS[ext]
  if (icon) {
    return <img src={icon} width={size} height={size} alt="" aria-hidden="true" />
  }
  const label = ext ? ext[0].toUpperCase() : '?'
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden="true">
      <rect width="32" height="32" rx="7.5" fill="#98a2b3" />
      <text
        x="16"
        y="16.5"
        textAnchor="middle"
        dominantBaseline="central"
        fill="#fff"
        fontSize={17}
        fontWeight="700"
        fontFamily="system-ui, -apple-system, 'Segoe UI', sans-serif"
      >
        {label}
      </text>
    </svg>
  )
}

function formatModified(mtimeMs: number, i18n: I18n): string {
  const date = new Date(mtimeMs)
  const now = new Date()
  const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime()
  const days = Math.round((startOfDay(now) - startOfDay(date)) / 86400000)
  if (days <= 0) {
    return `${i18n.t('today')} · ${date.toLocaleTimeString(i18n.dateLocale, { hour: '2-digit', minute: '2-digit' })}`
  }
  if (days === 1) return i18n.t('yesterday')
  return date.toLocaleDateString(i18n.dateLocale, { month: 'short', day: 'numeric' })
}

function formatSize(bytes: number): string {
  if (bytes >= 1048576) return `${(bytes / 1048576).toFixed(1)} MB`
  return `${Math.max(1, Math.round(bytes / 1024))} KB`
}

function fileName(path: string): string {
  return path.split(/[\\/]/).pop() ?? path
}

function baseName(entry: RecentEntry): string {
  return entry.ext ? entry.name.slice(0, -(entry.ext.length + 1)) : entry.name
}

// ── Project hooks ─────────────────────────────────────────

/** whether we are inside the shell (aiOfficeProject API available) */
function hasProjectApi(): boolean {
  return typeof window.aiOfficeProject !== 'undefined'
}

const FILTERS: { key: string; label: StringKey }[] = [
  { key: 'all', label: 'filterAll' },
  { key: 'docx', label: 'filterDocs' },
  { key: 'xlsx', label: 'filterSheets' },
  { key: 'pptx', label: 'filterSlides' },
  { key: 'pdf', label: 'filterPdf' },
  { key: 'md', label: 'filterMd' },
]

/** Check glyph marking the selected sort option; invisible on the others so labels stay aligned */
function SortCheck({ visible }: { visible: boolean }): ReactElement {
  return (
    <Icon
      name="check"
      size={12}
      className="cloud-sort-check"
      style={visible ? undefined : { visibility: 'hidden' }}
    />
  )
}

// ── Project sidebar component ────────────────────────────

interface ProjectPanelProps {
  projects: ProjectSummaryEntry[]
  selectedId: string | null
  onSelect: (id: string | null) => void
  onRefresh: () => void
}

function ProjectPanel({ projects, selectedId, onSelect, onRefresh }: ProjectPanelProps) {
  const { t } = useI18n()
  const [creating, setCreating] = useState(false)
  const [newName, setNewName] = useState('')
  // open menu id + fixed-position anchor (viewport coords), so the popup can
  // escape the scrollable project list without the list losing overflow-y
  const [projMenu, setProjMenu] = useState<{ id: string; top: number; right: number } | null>(null)
  const [renaming, setRenaming] = useState<{ id: string; value: string } | null>(null)
  const newInputRef = useRef<HTMLInputElement>(null)
  // wrap (… button + popup) of the row whose menu is open — the dismissal guard root
  const projMenuWrapRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (creating && newInputRef.current) newInputRef.current.focus()
  }, [creating])

  // unified dismissal: outside press, window blur, chrome press (tab strip / window drag)
  useDismissablePopover(projMenu !== null, () => setProjMenu(null), {
    inside: () => [projMenuWrapRef.current],
  })

  // also close on any scroll (the fixed-position popup would otherwise detach
  // from its row while the list scrolls)
  useEffect(() => {
    if (!projMenu) return
    const close = () => setProjMenu(null)
    window.addEventListener('scroll', close, true)
    return () => window.removeEventListener('scroll', close, true)
  }, [projMenu])

  const commitCreate = async () => {
    const name = newName.trim()
    setCreating(false)
    setNewName('')
    if (!name) return
    try {
      await window.aiOfficeProject?.createProject(name)
    } catch (error) {
      window.alert(error instanceof Error ? error.message : String(error))
      return
    }
    onRefresh()
  }

  const commitRename = async () => {
    if (!renaming) return
    const name = renaming.value.trim()
    const id = renaming.id
    setRenaming(null)
    if (!name) return
    try {
      await window.aiOfficeProject?.renameProject(id, name)
    } catch (error) {
      window.alert(error instanceof Error ? error.message : String(error))
      return
    }
    onRefresh()
  }

  // in-app confirm dialog (same style as the delete-files modal), not window.confirm
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null)

  const doDelete = (id: string) => {
    setProjMenu(null)
    setConfirmDeleteId(id)
  }

  const confirmDeleteNow = async () => {
    const id = confirmDeleteId
    setConfirmDeleteId(null)
    if (!id) return
    try {
      await window.aiOfficeProject?.deleteProject(id)
    } catch (error) {
      window.alert(error instanceof Error ? error.message : String(error))
      return
    }
    if (selectedId === id) onSelect(null)
    onRefresh()
  }

  useEffect(() => {
    if (!confirmDeleteId) return
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setConfirmDeleteId(null)
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [confirmDeleteId])

  return (
    <div className="proj-panel">
      <div className="proj-panel-head">
        <span className="proj-panel-title">{t('projects')}</span>
        <IconButton
          className="proj-add-btn"
          size="sm"
          label={t('newProject')}
          onClick={() => setCreating(true)}
        >
          <Icon name="plus" size={14} />
        </IconButton>
      </div>

      {creating && (
        <div className="proj-new-row">
          <input
            ref={newInputRef}
            className="proj-rename-input"
            placeholder={t('projectName')}
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onBlur={() => void commitCreate()}
            onKeyDown={(e) => {
              // IME (e.g. pinyin): Enter/Escape during composition only affects
              // the composition, it must not commit or cancel the field
              if (e.nativeEvent.isComposing) return
              if (e.key === 'Enter') void commitCreate()
              if (e.key === 'Escape') {
                setCreating(false)
                setNewName('')
              }
            }}
          />
        </div>
      )}

      <ul className="proj-list">
        {projects.map((proj) => {
          const isActive = selectedId === proj.id
          const isRenaming = renaming?.id === proj.id
          return (
            <li key={proj.id} className={`proj-item${isActive ? ' active' : ''}`}>
              <div
                className="proj-item-main"
                role="button"
                tabIndex={0}
                onClick={() => onSelect(isActive ? null : proj.id)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') onSelect(isActive ? null : proj.id)
                }}
              >
                <span className="proj-item-icon" aria-hidden="true">
                  <Icon name="folder" size={16} />
                </span>
                {isRenaming ? (
                  <input
                    className="proj-rename-input inline"
                    value={renaming.value}
                    autoFocus
                    onFocus={(e) => e.target.select()}
                    onClick={(e) => e.stopPropagation()}
                    onChange={(e) => setRenaming({ id: proj.id, value: e.target.value })}
                    onBlur={() => void commitRename()}
                    onKeyDown={(e) => {
                      e.stopPropagation()
                      if (e.nativeEvent.isComposing) return
                      if (e.key === 'Enter') void commitRename()
                      if (e.key === 'Escape') setRenaming(null)
                    }}
                  />
                ) : (
                  <span className="proj-item-name">
                    {proj.isDefault ? t('defaultProject') : proj.name}
                  </span>
                )}
                <span className="proj-item-meta">
                  <span className="proj-item-count">{proj.fileCount}</span>
                </span>
              </div>

              {!proj.isDefault && (
                <div
                  className="proj-menu-wrap"
                  ref={projMenu?.id === proj.id ? projMenuWrapRef : undefined}
                >
                  <IconButton
                    className="proj-more-btn"
                    size="sm"
                    label={t('projMoreActions', { name: proj.name })}
                    aria-expanded={projMenu?.id === proj.id}
                    onClick={(e) => {
                      e.stopPropagation()
                      if (projMenu?.id === proj.id) {
                        setProjMenu(null)
                        return
                      }
                      const rect = e.currentTarget.getBoundingClientRect()
                      setProjMenu({
                        id: proj.id,
                        top: rect.bottom + 4,
                        right: window.innerWidth - rect.right,
                      })
                    }}
                  >
                    <Icon name="more" size={14} />
                  </IconButton>
                  {projMenu?.id === proj.id && (
                    <div
                      className="proj-menu rr-menu__list"
                      role="menu"
                      style={{ top: projMenu.top, right: projMenu.right }}
                    >
                      <button
                        role="menuitem"
                        className="rr-menu__item"
                        onClick={(e) => {
                          e.stopPropagation()
                          setProjMenu(null)
                          setRenaming({ id: proj.id, value: proj.name })
                        }}
                      >
                        {t('rename')}
                      </button>
                      <div className="row-menu-divider rr-menu__sep" role="separator" />
                      <button
                        role="menuitem"
                        className="rr-menu__item rr-menu__item--danger"
                        onClick={(e) => {
                          e.stopPropagation()
                          doDelete(proj.id)
                        }}
                      >
                        {t('deleteProject')}
                      </button>
                    </div>
                  )}
                </div>
              )}
            </li>
          )
        })}
      </ul>

      {confirmDeleteId &&
        (() => {
          // locale string is "title?\nbody" — split it across the dialog
          const [confirmTitle, ...confirmBody] = t('deleteProjectConfirm').split('\n')
          return (
            <Dialog
              title={confirmTitle}
              closeLabel={t('cancel')}
              onClose={() => setConfirmDeleteId(null)}
              footer={
                <>
                  <Button
                    variant="secondary"
                    size="sm"
                    autoFocus
                    onClick={() => setConfirmDeleteId(null)}
                  >
                    {t('cancel')}
                  </Button>
                  <Button variant="danger" size="sm" onClick={() => void confirmDeleteNow()}>
                    {t('delete')}
                  </Button>
                </>
              }
            >
              <p>{confirmBody.join('\n')}</p>
            </Dialog>
          )
        })()}
    </div>
  )
}

// ── Account entry (bottom-left) ──────────────────────────
// Entry point to Settings at the foot of the sidebar.
function AccountEntry() {
  const { t } = useI18n()
  const [settingsOpen, setSettingsOpen] = useState(false)
  return (
    <div className="account-entry">
      {settingsOpen && <SettingsModal onClose={() => setSettingsOpen(false)} />}
      <button
        className="account-btn"
        onClick={() => setSettingsOpen(true)}
        aria-haspopup="dialog"
        aria-expanded={settingsOpen}
        data-tip={t('settings')}
        aria-label={t('settings')}
      >
        <span className="account-avatar">
          <Icon name="settings" size={15} />
        </span>
        <span className="account-text">
          <span className="account-name">{t('settings')}</span>
        </span>
        <Icon name="chevronRight" size={14} className="account-chevron" />
      </button>
    </div>
  )
}

// ── Drop-to-open overlay ────────────────────────────────

/**
 * Full-window affordance while OS files hover over Home. Purely visual — the
 * actual open is owned by the preload drop bridge (installDropOpenBridge), so
 * this overlay stays pointer-events:none and never handles events itself.
 * Visibility tracks a dragenter/dragleave depth counter: `dragover` stops
 * being delivered while the cursor is stationary (macOS), so a debounce would
 * hide the overlay mid-drag. Enter fires before the matching leave when
 * moving between elements, so the depth never dips to zero inside the window.
 */
function DropToOpenOverlay(): ReactElement | null {
  const [visible, setVisible] = useState(false)
  useEffect(() => {
    let depth = 0
    const hasFiles = (ev: DragEvent): boolean => ev.dataTransfer?.types.includes('Files') ?? false
    // NB: the preload drop bridge also listens here and cancels file drags, so
    // defaultPrevented can't discriminate anything at this layer — only zones
    // that stopPropagation (none on Home) would keep us out entirely.
    const onDragEnter = (ev: DragEvent) => {
      if (!hasFiles(ev)) return
      depth += 1
      setVisible(true)
    }
    const onDragLeave = (ev: DragEvent) => {
      if (!hasFiles(ev)) return
      depth = Math.max(0, depth - 1)
      if (depth === 0) setVisible(false)
    }
    // drop/blur reset the depth outright: leaving the window mid-drag can eat
    // a dragleave, and a stuck overlay would be worse than a re-shown one
    const onHide = () => {
      depth = 0
      setVisible(false)
    }
    window.addEventListener('dragenter', onDragEnter)
    window.addEventListener('dragleave', onDragLeave)
    window.addEventListener('drop', onHide)
    window.addEventListener('blur', onHide)
    return () => {
      window.removeEventListener('dragenter', onDragEnter)
      window.removeEventListener('dragleave', onDragLeave)
      window.removeEventListener('drop', onHide)
      window.removeEventListener('blur', onHide)
    }
  }, [])
  const { t } = useI18n()
  if (!visible) return null
  return (
    <div className="home-drop-overlay" aria-hidden="true">
      <div className="home-drop-card">
        <Icon name="download" size={40} />
        <h2>{t('dropToOpenTitle')}</h2>
        <p>{OPEN_LOCAL_EXTENSIONS}</p>
      </div>
    </div>
  )
}

// ── Main component ──────────────────────────────────────

export function Home() {
  const i18n = useI18n()
  const { t, lang } = i18n
  // ── Paged list state (rows loaded for the current view + filter) ──
  const [entries, setEntries] = useState<RecentEntry[]>([])
  /** total count under the current view + filter (not just the loaded rows) */
  const [listTotal, setListTotal] = useState(0)
  /** sidebar Recent / Starred counts under the active type filter */
  const [navCounts, setNavCounts] = useState({ recent: 0, starred: 0 })
  const [loadingMore, setLoadingMore] = useState(false)
  const [view, setView] = useState<'recent' | 'starred'>('recent')
  // Updates and Shared with you take over the content area like a selected project
  const [pane, setPane] = useState<'updates' | 'shared' | null>(null)
  const updatesMode = pane === 'updates'
  const sharedMode = pane === 'shared'
  const setUpdatesMode = (on: boolean) => setPane(on ? 'updates' : null)
  // files waiting in Updates, from the linked-figure store in the main process
  const facts = useFacts()
  // invite links: clicked outside the app or pasted in Shared; joined only after the person confirms
  const joinLink = useJoinLink()
  const updatesWaiting = facts.state ? waitingFiles(facts.state).length : 0
  const [filter, setFilter] = useState('all')
  // modified-column sort (WPS-style header popover), shared by the global and project tables
  const [fileSort, setFileSort] = useState<'recent' | 'oldest'>('recent')
  const [fileSortMenuOpen, setFileSortMenuOpen] = useState(false)
  const fileSortRef = useRef<HTMLDivElement>(null)
  const [rowMenu, setRowMenu] = useState<string | null>(null)
  // actions cell (… button + menu) of the row whose menu is open — the dismissal guard root
  const rowMenuWrapRef = useRef<HTMLSpanElement>(null)
  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set())
  const [renaming, setRenaming] = useState<{ path: string; value: string } | null>(null)
  const [confirmDelete, setConfirmDelete] = useState<string[] | null>(null)
  // unavailable recent entry (missing flag) the user clicked — offer list removal
  const [confirmMissing, setConfirmMissing] = useState<RecentEntry | null>(null)
  // the greeting carries no account name: there is no account here
  const accountName = ''
  // Recent's name search; sent to main debounced so typing doesn't page on every key
  const [query, setQuery] = useState('')
  const [debouncedQuery, setDebouncedQuery] = useState('')
  useEffect(() => {
    const id = window.setTimeout(() => setDebouncedQuery(query.trim()), 150)
    return () => window.clearTimeout(id)
  }, [query])

  // ── Project state ──
  const [projects, setProjects] = useState<ProjectSummaryEntry[]>([])
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null)

  const projectMode = hasProjectApi()

  // ── Paged loading ──
  // stale responses are dropped via a request sequence number (when views/filters switch quickly)
  const requestSeq = useRef(0)
  const entriesLen = useRef(0)
  entriesLen.current = entries.length

  /** reload the list; keepCount keeps the loaded row count (refresh), otherwise back to page one */
  const reload = (keepCount: boolean) => {
    const seq = ++requestSeq.current
    const ext = filter === 'all' ? undefined : filter
    const q = debouncedQuery || undefined
    const limit = keepCount ? Math.max(entriesLen.current, PAGE_SIZE) : PAGE_SIZE
    const primary = view === 'recent' ? window.aiOffice.recents : window.aiOffice.starred
    const secondary = view === 'recent' ? window.aiOffice.starred : window.aiOffice.recents
    void primary({ offset: 0, limit, ext, q }).then((page) => {
      if (seq !== requestSeq.current) return
      setEntries(page.entries)
      setListTotal(page.total)
      // the sidebar counts the list, not what the search narrowed it to
      if (q) return
      setNavCounts((prev) =>
        view === 'recent'
          ? { ...prev, recent: visiblePageCount(page) }
          : { ...prev, starred: visiblePageCount(page) },
      )
    })
    // The other view fetches only its count under the same active filter.
    void secondary({ offset: 0, limit: 0, ext }).then((page) => {
      if (seq !== requestSeq.current) return
      setNavCounts((prev) =>
        view === 'recent'
          ? { ...prev, starred: visiblePageCount(page) }
          : { ...prev, recent: visiblePageCount(page) },
      )
    })
    if (projectMode) {
      void window.aiOfficeProject!.listProjects().then(setProjects)
    }
  }
  const reloadRef = useRef(reload)
  reloadRef.current = reload

  // refresh signal for project-view data (re-pull file stats after file changes)
  const [projectTick, setProjectTick] = useState(0)

  const refresh = () => {
    reloadRef.current(true)
    setProjectTick((n) => n + 1)
  }

  useEffect(() => {
    reloadRef.current(false)
  }, [view, filter, debouncedQuery])

  useEffect(() => {
    const onFocus = () => {
      reloadRef.current(true)
      setProjectTick((n) => n + 1)
    }
    window.addEventListener('focus', onFocus)
    return () => window.removeEventListener('focus', onFocus)
  }, [])

  const hasMore = entries.length < listTotal

  // unified dismissal: outside press, window blur, chrome press (tab strip / window drag)
  useDismissablePopover(fileSortMenuOpen, () => setFileSortMenuOpen(false), {
    inside: () => [fileSortRef.current],
  })

  const loadMore = () => {
    if (loadingMore || !hasMore) return
    setLoadingMore(true)
    const seq = requestSeq.current
    const ext = filter === 'all' ? undefined : filter
    const api = view === 'recent' ? window.aiOffice.recents : window.aiOffice.starred
    const q = debouncedQuery || undefined
    void api({ offset: entriesLen.current, limit: PAGE_SIZE, ext, q }).then((page) => {
      setLoadingMore(false)
      if (seq !== requestSeq.current) return
      setEntries((prev) => [...prev, ...page.entries])
      setListTotal(page.total)
    })
  }
  const loadMoreRef = useRef(loadMore)
  loadMoreRef.current = loadMore

  // oldest-first over a partially loaded list would miss the tail pages —
  // keep pulling until the list is complete (backend caps recents at 100)
  useEffect(() => {
    if (fileSort === 'oldest' && hasMore) loadMoreRef.current()
  }, [fileSort, hasMore, entries.length])

  // Load the next page once the bottom sentinel enters the viewport (240px early);
  // depending on entries.length rebuilds the observer after each page — observe fires an immediate
  // callback, so while the sentinel stays in view we keep loading until full or exhausted
  const sentinelRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const el = sentinelRef.current
    if (!el) return
    const observer = new IntersectionObserver(
      (records) => {
        if (records.some((r) => r.isIntersecting)) loadMoreRef.current()
      },
      { rootMargin: '240px' },
    )
    observer.observe(el)
    return () => observer.disconnect()
  }, [hasMore, entries.length])

  // unified dismissal: outside press, window blur, chrome press (tab strip / window drag)
  useDismissablePopover(rowMenu !== null, () => setRowMenu(null), {
    inside: () => [rowMenuWrapRef.current],
  })

  // Escape closes the row menu and the delete-confirm dialog
  useEffect(() => {
    if (rowMenu === null && confirmDelete === null && confirmMissing === null) return
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setRowMenu(null)
        setConfirmDelete(null)
        setConfirmMissing(null)
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [rowMenu, confirmDelete, confirmMissing])

  // ── Project files state ────────────────────────────────

  const [projectFileEntries, setProjectFileEntries] = useState<RecentEntry[]>([])
  const [moveFileMenu, setMoveFileMenu] = useState<string | null>(null)
  // submenu opens rightward by default; flips left when the window edge is too close
  const [moveMenuFlip, setMoveMenuFlip] = useState(false)
  // hover-open/close delays: avoid flashing the submenu while the pointer passes
  // through, and keep it open while crossing the 4px gap into it
  const moveMenuTimers = useRef<{ open: number | null; close: number | null }>({
    open: null,
    close: null,
  })
  // wrap (trigger + submenu) of the row whose move submenu is open — the dismissal guard root
  const moveMenuWrapRef = useRef<HTMLDivElement>(null)

  const openMoveMenu = (path: string) => {
    setMoveMenuFlip(false)
    setMoveFileMenu(path)
  }

  // ref runs pre-paint, so measuring the real width (long project names exceed
  // the min-width) and flipping never flashes; once flipped the check no longer hits
  const measureSubmenu = (el: HTMLDivElement | null) => {
    if (el && el.getBoundingClientRect().right > document.documentElement.clientWidth - 8) {
      setMoveMenuFlip(true)
    }
  }

  const clearMoveMenuTimer = (kind: 'open' | 'close') => {
    const timers = moveMenuTimers.current
    if (timers[kind] !== null) {
      window.clearTimeout(timers[kind])
      timers[kind] = null
    }
  }
  const [bulkMoveMenu, setBulkMoveMenu] = useState(false)
  // selection-bar wrap (trigger + menu) of the bulk move menu — the dismissal guard root
  const bulkMoveWrapRef = useRef<HTMLSpanElement>(null)

  useEffect(() => {
    if (!projectMode || !selectedProjectId) {
      setProjectFileEntries([])
      return
    }
    let active = true
    const api = window.aiOfficeProject!
    void api.listFiles(selectedProjectId).then(async (paths) => {
      const stats = await window.aiOffice.statPaths(paths)
      if (!active) return
      setProjectFileEntries(stats.sort((a, b) => b.mtimeMs - a.mtimeMs))
    })
    return () => {
      active = false
    }
  }, [projectMode, selectedProjectId, projectTick])

  // the submenu lives inside the row menu: when that closes, drop the stale
  // submenu state and any pending hover timers so it doesn't reopen expanded
  useEffect(() => {
    if (rowMenu === null) {
      clearMoveMenuTimer('open')
      clearMoveMenuTimer('close')
      setMoveFileMenu(null)
    }
  }, [rowMenu])

  // move-file submenu: unified dismissal (outside press, window blur, chrome press)
  useDismissablePopover(moveFileMenu !== null, () => setMoveFileMenu(null), {
    inside: () => [moveMenuWrapRef.current],
  })

  // bulk move-to-project menu in the selection bar: unified dismissal, plus Escape
  useDismissablePopover(bulkMoveMenu, () => setBulkMoveMenu(false), {
    inside: () => [bulkMoveWrapRef.current],
  })
  useEffect(() => {
    if (!bulkMoveMenu) return
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setBulkMoveMenu(false)
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [bulkMoveMenu])

  // WPS-style sortable "modified" column header, shared by both file tables
  const renderModifiedHeader = () => (
    <div className="cloud-col-sort" ref={fileSortRef}>
      <button
        className="cloud-col-sort-btn"
        aria-haspopup="menu"
        aria-expanded={fileSortMenuOpen}
        onClick={() => setFileSortMenuOpen((o) => !o)}
      >
        {t('colModified')}
        <Icon
          name="arrowDown"
          size={12}
          style={fileSort === 'oldest' ? { transform: 'rotate(180deg)' } : undefined}
        />
      </button>
      {fileSortMenuOpen && (
        <div className="cloud-sort-menu rr-menu__list" role="menu">
          {(['recent', 'oldest'] as const).map((key) => (
            <button
              key={key}
              className={`rr-menu__item${fileSort === key ? ' active' : ''}`}
              role="menuitemradio"
              aria-checked={fileSort === key}
              onClick={() => {
                setFileSort(key)
                setFileSortMenuOpen(false)
              }}
            >
              <SortCheck visible={fileSort === key} />
              {t(key === 'recent' ? 'cloudSortRecent' : 'cloudSortOldest')}
            </button>
          ))}
        </div>
      )}
    </div>
  )

  // ── Plain view (no project selected): filtering runs in the main process; entries is the visible list ──
  const selectedPaths = entries.filter((e) => selected.has(e.path)).map((e) => e.path)
  const allSelected = entries.length > 0 && selectedPaths.length === entries.length

  // project view shares the same `selected` set (keyed by path)
  const projSelectedPaths = projectFileEntries
    .filter((e) => selected.has(e.path))
    .map((e) => e.path)
  const projAllSelected =
    projectFileEntries.length > 0 && projSelectedPaths.length === projectFileEntries.length

  const changeView = (next: 'recent' | 'starred') => {
    setView(next)
    setSelected(new Set())
    setRowMenu(null)
  }

  const changeFilter = (key: string) => {
    setFilter(key)
    setSelected(new Set())
    setRowMenu(null)
  }

  const toggleSelect = (path: string, on: boolean) => {
    setSelected((prev) => {
      const next = new Set(prev)
      if (on) next.add(path)
      else next.delete(path)
      return next
    })
  }

  const toggleSelectAll = () => {
    setSelected(allSelected ? new Set() : new Set(entries.map((e) => e.path)))
  }

  const toggleSelectAllProject = () => {
    setSelected(projAllSelected ? new Set() : new Set(projectFileEntries.map((e) => e.path)))
  }

  const toggleStar = (path: string) => {
    void window.aiOffice.toggleStar(path).then(refresh)
  }

  const removeRecent = (paths: string[]) => {
    setRowMenu(null)
    setSelected(new Set())
    void window.aiOffice.removeRecent(paths).then(refresh)
  }

  const deleteFiles = (paths: string[]) => {
    setRowMenu(null)
    setConfirmDelete(paths)
  }

  const confirmDeleteNow = () => {
    const paths = confirmDelete ?? []
    setConfirmDelete(null)
    setSelected(new Set())
    void window.aiOffice.deleteFiles(paths).then(refresh)
  }

  const duplicateFile = (path: string) => {
    setRowMenu(null)
    void window.aiOffice.duplicateFile(path).then(refresh)
  }

  const startRename = (entry: RecentEntry) => {
    setRowMenu(null)
    setRenaming({ path: entry.path, value: baseName(entry) })
  }

  const commitRename = (entry: RecentEntry) => {
    const value = renaming?.value.trim() ?? ''
    setRenaming(null)
    if (!value || value === baseName(entry)) return
    const newName = entry.ext ? `${value}.${entry.ext}` : value
    void window.aiOffice.renameFile(entry.path, newName).then((result) => {
      if (!result.ok) window.alert(result.error ?? t('renameFailed'))
      refresh()
    })
  }

  const moveFileTo = async (filePath: string, targetProjectId: string) => {
    setMoveFileMenu(null)
    setRowMenu(null)
    try {
      await window.aiOfficeProject?.moveFile(filePath, targetProjectId)
    } catch (error) {
      window.alert(error instanceof Error ? error.message : String(error))
      return
    }
    refresh()
    if (selectedProjectId) {
      setProjectFileEntries((prev) => prev.filter((e) => e.path !== filePath))
    }
  }

  const moveFilesTo = async (paths: string[], targetProjectId: string) => {
    setBulkMoveMenu(false)
    setSelected(new Set())
    // drop moved rows immediately (same as moveFileTo) so they cannot be
    // re-selected or re-moved while the sequential IPC loop is in flight
    const moved = new Set(paths)
    setProjectFileEntries((prev) => prev.filter((e) => !moved.has(e.path)))
    try {
      for (const path of paths) {
        await window.aiOfficeProject?.moveFile(path, targetProjectId)
      }
    } catch (error) {
      window.alert(error instanceof Error ? error.message : String(error))
    } finally {
      // A bulk move can fail after earlier paths succeeded; reload to restore
      // unmoved rows while keeping successfully moved rows out of this project.
      refresh()
    }
  }

  // ── New file (passes projectId when a project is selected) ──
  const handleNewDoc = () => {
    void window.aiOffice.newDoc(selectedProjectId ? { projectId: selectedProjectId } : undefined)
  }

  const handleNewSheet = () => {
    void window.aiOffice.newSheet(selectedProjectId ? { projectId: selectedProjectId } : undefined)
  }

  const handleNewSlide = () => {
    void window.aiOffice.newSlide(selectedProjectId ? { projectId: selectedProjectId } : undefined)
  }

  const handleNewMarkdown = () => {
    void window.aiOffice.newMarkdown(
      selectedProjectId ? { projectId: selectedProjectId } : undefined,
    )
  }

  const handleNewPdf = () => {
    void window.aiOffice.newPdf(selectedProjectId ? { projectId: selectedProjectId } : undefined)
  }

  const handleNewHangul = () => {
    void window.aiOffice.newHangul(selectedProjectId ? { projectId: selectedProjectId } : undefined)
  }

  /** Home's "Or start blank" row */
  const startBlank = (kind: StartKind) => {
    const start: Record<StartKind, () => void> = {
      docx: handleNewDoc,
      xlsx: handleNewSheet,
      pptx: handleNewSlide,
      hwp: handleNewHangul,
      md: handleNewMarkdown,
      pdf: handleNewPdf,
    }
    start[kind]()
  }

  const NEW_ITEMS = [
    { ext: 'docx', title: t('newDoc'), sub: '.docx', action: handleNewDoc },
    { ext: 'xlsx', title: t('newSheet'), sub: '.xlsx', action: handleNewSheet },
    { ext: 'pptx', title: t('newSlide'), sub: '.pptx', action: handleNewSlide },
    { ext: 'md', title: t('newMarkdown'), sub: '.md', action: handleNewMarkdown },
    { ext: 'pdf', title: t('newPdf'), sub: '.pdf', action: handleNewPdf },
    { ext: 'hwp', title: t('newHangul'), sub: '.hwp', action: handleNewHangul, ai: false },
  ]

  function renderQuickCards() {
    return (
      <div className="quick-cards">
        {NEW_ITEMS.map((item) => (
          <button
            key={item.ext}
            className="quick-card"
            onClick={() => void item.action()}
            title={item.title}
            aria-label={item.title}
          >
            <FileBadge ext={item.ext} size={30} />
            {(item as { ai?: boolean }).ai === false ? null : (
              <span className="ai-chip ai-chip-corner" aria-hidden="true">
                AI
              </span>
            )}
            <span className="quick-text">
              <span className="quick-title-row">
                <span className="quick-title">{item.title}</span>
              </span>
              <span className="quick-sub">{item.sub}</span>
            </span>
          </button>
        ))}
        <button
          className="quick-card"
          onClick={() => void window.aiOffice.browse()}
          title={t('openLocal')}
          aria-label={t('openLocal')}
          data-tip={OPEN_LOCAL_EXTENSIONS}
        >
          <span className="quick-folder">
            <Icon name="folder" size={18} />
          </span>
          <span className="quick-text">
            <span className="quick-title-row">
              <span className="quick-title">{t('openLocal')}</span>
            </span>
            <span className="quick-sub">{OPEN_LOCAL_EXTENSIONS}</span>
          </span>
        </button>
      </div>
    )
  }

  // ── File row rendering (shared by the plain view and the project files view) ──

  function renderFileRow(entry: RecentEntry, context: 'global' | 'project') {
    const isRenaming = renaming?.path === entry.path
    const otherProjects = projects.filter(
      (p) => p.id !== (context === 'project' ? selectedProjectId : undefined),
    )
    return (
      <li className="recent-row" key={entry.path}>
        <div
          className={`recent-item${entry.missing ? ' missing' : ''}`}
          role="button"
          tabIndex={0}
          onClick={() => {
            if (isRenaming) return
            if (entry.missing) setConfirmMissing(entry)
            else void window.aiOffice.openPath(entry.path)
          }}
          onKeyDown={(event) => {
            if (event.key === 'Enter' && event.target === event.currentTarget) {
              if (entry.missing) setConfirmMissing(entry)
              else void window.aiOffice.openPath(entry.path)
            }
          }}
        >
          <span className="col-check" onClick={(event) => event.stopPropagation()}>
            <input
              type="checkbox"
              className="row-check"
              checked={selected.has(entry.path)}
              onChange={(event) => toggleSelect(entry.path, event.target.checked)}
              aria-label={t('selectFile', { name: entry.name })}
            />
          </span>
          <span className="recent-icon">
            <FileBadge ext={entry.ext} size={24} />
          </span>
          {isRenaming ? (
            <input
              className="rename-input"
              value={renaming.value}
              autoFocus
              onFocus={(event) => event.target.select()}
              onClick={(event) => event.stopPropagation()}
              onChange={(event) => setRenaming({ path: entry.path, value: event.target.value })}
              onBlur={() => commitRename(entry)}
              onKeyDown={(event) => {
                event.stopPropagation()
                if (event.nativeEvent.isComposing) return
                if (event.key === 'Enter') commitRename(entry)
                if (event.key === 'Escape') setRenaming(null)
              }}
            />
          ) : (
            <span className="recent-name">{entry.name}</span>
          )}
          <span className="recent-path" title={entry.path}>
            {displayParentDir(entry.path)}
          </span>
          <span className="recent-time">
            {entry.missing ? '—' : formatModified(entry.mtimeMs, i18n)}
          </span>
          <span className="recent-size">{entry.missing ? '—' : formatSize(entry.sizeBytes)}</span>
          <IconButton
            className={`star-btn${entry.starred ? ' starred' : ''}`}
            size="sm"
            label={entry.starred ? t('unstar') : t('star')}
            onClick={(event) => {
              event.stopPropagation()
              toggleStar(entry.path)
            }}
          >
            <Icon name="star" size={15} />
          </IconButton>
          <span
            className="recent-actions"
            ref={rowMenu === entry.path ? rowMenuWrapRef : undefined}
            onClick={(event) => event.stopPropagation()}
          >
            <IconButton
              className="more-btn"
              size="sm"
              label={t('moreActions')}
              aria-expanded={rowMenu === entry.path}
              onClick={() => setRowMenu(rowMenu === entry.path ? null : entry.path)}
            >
              <Icon name="more" size={16} />
            </IconButton>
            {rowMenu === entry.path && (
              <div className="row-menu rr-menu__list" role="menu">
                <button
                  role="menuitem"
                  className="rr-menu__item"
                  onClick={() => {
                    setRowMenu(null)
                    void window.aiOffice.openPath(entry.path)
                  }}
                >
                  {t('open')}
                </button>
                <button
                  role="menuitem"
                  className="rr-menu__item"
                  onClick={() => {
                    setRowMenu(null)
                    void window.aiOffice.revealPath(entry.path)
                  }}
                >
                  {t('revealInFolder')}
                </button>
                <button
                  role="menuitem"
                  className="rr-menu__item"
                  onClick={() => {
                    setRowMenu(null)
                    void navigator.clipboard.writeText(entry.path)
                  }}
                >
                  {t('copyPath')}
                </button>
                {projectMode && otherProjects.length > 0 && (
                  <>
                    <div className="row-menu-divider rr-menu__sep" role="separator" />
                    <div
                      className="move-menu-wrap"
                      ref={moveFileMenu === entry.path ? moveMenuWrapRef : undefined}
                      onMouseEnter={() => {
                        clearMoveMenuTimer('close')
                        if (moveFileMenu === entry.path) return
                        clearMoveMenuTimer('open')
                        moveMenuTimers.current.open = window.setTimeout(
                          () => openMoveMenu(entry.path),
                          160,
                        )
                      }}
                      onMouseLeave={() => {
                        clearMoveMenuTimer('open')
                        clearMoveMenuTimer('close')
                        moveMenuTimers.current.close = window.setTimeout(
                          () => setMoveFileMenu(null),
                          140,
                        )
                      }}
                    >
                      <button
                        role="menuitem"
                        className="rr-menu__item submenu-trigger"
                        onClick={(e) => {
                          e.stopPropagation()
                          clearMoveMenuTimer('open')
                          clearMoveMenuTimer('close')
                          if (moveFileMenu === entry.path) setMoveFileMenu(null)
                          else openMoveMenu(entry.path)
                        }}
                      >
                        {t('moveToProject')}
                        <Icon name="chevronRight" size={12} style={{ marginLeft: 'auto' }} />
                      </button>
                      {moveFileMenu === entry.path && (
                        <div
                          className={`submenu rr-menu__list${moveMenuFlip ? ' submenu-left' : ''}`}
                          role="menu"
                          ref={measureSubmenu}
                        >
                          {otherProjects.map((p) => (
                            <button
                              key={p.id}
                              role="menuitem"
                              className="rr-menu__item"
                              onClick={() => void moveFileTo(entry.path, p.id)}
                            >
                              {p.isDefault ? t('defaultProject') : p.name}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  </>
                )}
                <div className="row-menu-divider rr-menu__sep" role="separator" />
                <button
                  role="menuitem"
                  className="rr-menu__item"
                  onClick={() => startRename(entry)}
                >
                  {t('rename')}
                </button>
                <button
                  role="menuitem"
                  className="rr-menu__item"
                  onClick={() => duplicateFile(entry.path)}
                >
                  {t('duplicate')}
                </button>
                {context === 'global' && selectedPaths.length === 0 && (
                  <>
                    <div className="row-menu-divider rr-menu__sep" role="separator" />
                    <button
                      role="menuitem"
                      className="rr-menu__item"
                      onClick={() => removeRecent([entry.path])}
                    >
                      {t('removeFromList')}
                    </button>
                    <button
                      role="menuitem"
                      className="rr-menu__item rr-menu__item--danger"
                      onClick={() => deleteFiles([entry.path])}
                    >
                      {t('deleteFiles')}
                    </button>
                  </>
                )}
              </div>
            )}
          </span>
        </div>
      </li>
    )
  }

  // ── Project files view ────────────────────────────────

  function renderProjectContent() {
    const proj = projects.find((p) => p.id === selectedProjectId)
    if (!proj) return null
    const otherProjects = projects.filter((p) => p.id !== proj.id)

    return (
      <main className="content">
        <section className="quick-start" aria-label={t('secQuickStart')}>
          <div className="section-head">
            <span className="section-label">{t('secQuickStart')}</span>
          </div>
          {renderQuickCards()}
        </section>

        <section className="recents" aria-label={t('secProjectFiles')}>
          <div className="recents-toolbar">
            <div className="recents-heading">
              <span className="section-label">{t('secProjectFiles')}</span>
              <span className="file-count">
                {t(fileCountKey(projectFileEntries.length), { n: projectFileEntries.length })}
              </span>
            </div>
            {projSelectedPaths.length > 0 && (
              <div className="selection-bar">
                <span className="selection-count">
                  {t('selectedCount', { n: projSelectedPaths.length })}
                </span>
                {otherProjects.length > 0 && (
                  <span className="selection-move-wrap" ref={bulkMoveWrapRef}>
                    <button
                      className="selection-action"
                      aria-expanded={bulkMoveMenu}
                      onClick={() => setBulkMoveMenu((open) => !open)}
                    >
                      {t('moveToProject')}
                    </button>
                    {bulkMoveMenu && (
                      <div className="selection-move-menu rr-menu__list" role="menu">
                        {otherProjects.map((p) => (
                          <button
                            key={p.id}
                            role="menuitem"
                            className="rr-menu__item"
                            onClick={() => void moveFilesTo(projSelectedPaths, p.id)}
                          >
                            {p.isDefault ? t('defaultProject') : p.name}
                          </button>
                        ))}
                      </div>
                    )}
                  </span>
                )}
                <button
                  className="selection-action danger"
                  onClick={() => deleteFiles(projSelectedPaths)}
                >
                  {t('deleteFiles')}
                </button>
                <button className="selection-action" onClick={() => setSelected(new Set())}>
                  {t('cancel')}
                </button>
              </div>
            )}
          </div>

          {projectFileEntries.length === 0 ? (
            <EmptyState
              compact
              className="proj-empty"
              icon={<Icon name="file" size={22} />}
              title={<>{t('projEmptyHint')}</>}
            />
          ) : (
            <div className="recent-table">
              <div className="recent-columns">
                <span className="col-check">
                  <input
                    type="checkbox"
                    checked={projAllSelected}
                    onChange={toggleSelectAllProject}
                    aria-label={t('selectAll')}
                  />
                </span>
                <span className="col-name">{t('colName')}</span>
                <span>{t('colLocation')}</span>
                {renderModifiedHeader()}
                <span className="col-size">{t('colSize')}</span>
                <span />
                <span />
              </div>
              <ul className="recent-list">
                {(fileSort === 'oldest'
                  ? [...projectFileEntries].reverse()
                  : projectFileEntries
                ).map((entry) => renderFileRow(entry, 'project'))}
              </ul>
            </div>
          )}
        </section>

        <TimelineSection
          projectId={proj.id}
          tick={projectTick}
          openPath={(path) => void window.aiOffice.openPath(path)}
        />
      </main>
    )
  }

  // ── Plain view ────────────────────────────────────────

  function renderGlobalContent() {
    return (
      <main className="content">
        {view === 'recent' && (
          <HomeHero
            name={accountName || undefined}
            onAsk={(prompt) => void window.aiOffice.ask(prompt)}
            onStart={startBlank}
            onOpenFile={() => void window.aiOffice.browse()}
          />
        )}

        <section
          className="recents"
          aria-label={view === 'recent' ? t('secRecent') : t('secStarred')}
        >
          <div className="recents-bar">
            <h2 className="recents-title">
              {view === 'recent' ? t('secRecent') : t('secStarred')}
              <span className="recents-count">{listTotal}</span>
            </h2>
            <label className="recents-search">
              <Icon name="search" size={15} />
              <input
                type="search"
                value={query}
                placeholder={t('searchFiles')}
                aria-label={t('searchFiles')}
                onChange={(e) => setQuery(e.target.value)}
              />
            </label>
          </div>
          <div className="recents-toolbar">
            {selectedPaths.length > 0 ? (
              <div className="selection-bar">
                <span className="selection-count">
                  {t('selectedCount', { n: selectedPaths.length })}
                </span>
                <button className="selection-action" onClick={() => removeRecent(selectedPaths)}>
                  {t('removeFromList')}
                </button>
                <button
                  className="selection-action danger"
                  onClick={() => deleteFiles(selectedPaths)}
                >
                  {t('deleteFiles')}
                </button>
                <button className="selection-action" onClick={() => setSelected(new Set())}>
                  {t('cancel')}
                </button>
              </div>
            ) : (
              <Tabs
                className="filter-pills"
                variant="pill"
                label={t('filterAria')}
                value={filter}
                items={FILTERS.map((f) => ({ id: f.key, label: t(f.label) }))}
                onChange={changeFilter}
              />
            )}
          </div>

          {entries.length === 0 ? (
            <EmptyState
              compact
              className="proj-empty"
              icon={<Icon name="file" size={22} />}
              title={
                <>
                  {view === 'starred'
                    ? t('emptyStarred')
                    : navCounts.recent === 0
                      ? t('emptyRecent')
                      : t('emptyFiltered')}
                </>
              }
            />
          ) : (
            <div className={`recent-table${selectedPaths.length > 0 ? ' has-selection' : ''}`}>
              <div className="recent-columns">
                <span className="col-check">
                  <input
                    type="checkbox"
                    checked={allSelected}
                    onChange={toggleSelectAll}
                    aria-label={t('selectAll')}
                  />
                </span>
                <span className="col-name">{t('colName')}</span>
                <span>{t('colLocation')}</span>
                {renderModifiedHeader()}
                <span className="col-size">{t('colSize')}</span>
                <span />
                <span />
              </div>
              <ul className="recent-list">
                {(fileSort === 'oldest' ? [...entries].reverse() : entries).map((entry) =>
                  renderFileRow(entry, 'global'),
                )}
              </ul>
              {hasMore && (
                <div ref={sentinelRef} className="load-more" aria-hidden="true">
                  <span className="load-more-spinner" />
                </div>
              )}
            </div>
          )}
        </section>
      </main>
    )
  }

  return (
    <div className="home">
      <aside className="sidebar">
        <div className="sidebar-logo">
          {/* Two theme variants of the Redrob wordmark: the light one has dark
              text, the dark one has light text (the gradient mark is identical).
              CSS shows one per theme so the colored gradient is never inverted. */}
          <img className="logo-lockup logo-lockup-light" src={logoLockup} alt="Redrob" />
          <img className="logo-lockup logo-lockup-dark" src={logoLockupOnDark} alt="Redrob" />
        </div>

        <nav className="sidebar-nav">
          <button
            className={`nav-item${view === 'recent' && !selectedProjectId && !pane ? ' active' : ''}`}
            aria-current={
              view === 'recent' && !selectedProjectId && !pane
                ? 'page'
                : undefined
            }
            onClick={() => {
              changeView('recent')
              setSelectedProjectId(null)
              setUpdatesMode(false)
            }}
          >
            <Icon name="home" size={16} />
            <span className="nav-label">{t('navHome')}</span>
            <span className="nav-count">{navCounts.recent}</span>
          </button>
          <button
            className={`nav-item${updatesMode && !selectedProjectId ? ' active' : ''}`}
            aria-current={updatesMode && !selectedProjectId ? 'page' : undefined}
            onClick={() => {
              setUpdatesMode(true)
              setSelectedProjectId(null)
              setSelected(new Set())
              setRowMenu(null)
            }}
          >
            <Icon name="refresh" size={16} />
            <span className="nav-label">{t('navUpdates')}</span>
            {updatesWaiting > 0 && <span className="nav-count">{updatesWaiting}</span>}
          </button>
          <button
            className={`nav-item${view === 'starred' && !selectedProjectId && !pane ? ' active' : ''}`}
            aria-current={
              view === 'starred' && !selectedProjectId && !pane
                ? 'page'
                : undefined
            }
            onClick={() => {
              changeView('starred')
              setSelectedProjectId(null)
              setUpdatesMode(false)
            }}
          >
            <Icon name="star" size={16} />
            <span className="nav-label">{t('navStarred')}</span>
            <span className="nav-count">{navCounts.starred}</span>
          </button>
          <button
            className={`nav-item${sharedMode && !selectedProjectId ? ' active' : ''}`}
            aria-current={sharedMode && !selectedProjectId ? 'page' : undefined}
            onClick={() => {
              setPane('shared')
              setSelectedProjectId(null)
              setSelected(new Set())
              setRowMenu(null)
            }}
          >
            <Icon name="users" size={16} />
            <span className="nav-label">{t('navShared')}</span>
          </button>
          {/* deleted files go to the OS trash (shell.trashItem); restoring happens there */}
          <button
            className="nav-item"
            title={t('navTrashTip')}
            onClick={() => void window.aiOffice.openTrash()}
          >
            <Icon name="trash" size={16} />
            <span className="nav-label">{t('navTrash')}</span>
          </button>
        </nav>

        {/* project sidebar */}
        {projectMode && (
          <>
            <div className="sidebar-divider" />
            <ProjectPanel
              projects={projects}
              selectedId={selectedProjectId}
              onSelect={(id) => {
                setSelectedProjectId(id)
                setUpdatesMode(false)
                // reset list-selection state on any project switch (paths are
                // shared between the plain view and project views)
                setSelected(new Set())
                setRowMenu(null)
              }}
              onRefresh={refresh}
            />
          </>
        )}

        <HomeFoot />
        <AccountEntry />
      </aside>

      {selectedProjectId ? (
        renderProjectContent()
      ) : updatesMode ? (
        <UpdatesView facts={facts} openPath={(path) => void window.aiOffice.openPath(path)} />
      ) : sharedMode ? (
        <SharedView onJoinLink={joinLink.openBlank} />
      ) : (
        renderGlobalContent()
      )}

      {joinLink.dialog}

      {confirmDelete && (
        <Dialog
          title={t('deleteModalTitle')}
          closeLabel={t('cancel')}
          onClose={() => setConfirmDelete(null)}
          footer={
            <>
              <Button
                variant="secondary"
                size="sm"
                autoFocus
                onClick={() => setConfirmDelete(null)}
              >
                {t('cancel')}
              </Button>
              <Button variant="danger" size="sm" onClick={confirmDeleteNow}>
                {t('delete')}
              </Button>
            </>
          }
        >
          <p>
            {confirmDelete.length === 1
              ? t('deleteConfirmOne', { name: fileName(confirmDelete[0]) })
              : t('deleteConfirmMany', { n: confirmDelete.length })}
          </p>
          {confirmDelete.length > 1 && (
            <ul className="go-dialog__list">
              {confirmDelete.slice(0, 6).map((p) => (
                <li key={p}>{fileName(p)}</li>
              ))}
              {confirmDelete.length > 6 && (
                <li>{t('deleteMoreCount', { n: confirmDelete.length })}</li>
              )}
            </ul>
          )}
        </Dialog>
      )}

      {confirmMissing && (
        <Dialog
          title={t('missingFileTitle')}
          closeLabel={t('cancel')}
          onClose={() => setConfirmMissing(null)}
          footer={
            <>
              <Button
                variant="secondary"
                size="sm"
                autoFocus
                onClick={() => setConfirmMissing(null)}
              >
                {t('cancel')}
              </Button>
              <Button
                variant="danger"
                size="sm"
                onClick={() => {
                  // main drops the star of an unavailable entry with the row
                  removeRecent([confirmMissing.path])
                  setConfirmMissing(null)
                }}
              >
                {t('removeFromList')}
              </Button>
            </>
          }
        >
          <p>{t('missingFileBody', { name: confirmMissing.name })}</p>
        </Dialog>
      )}

      <DropToOpenOverlay />
    </div>
  )
}
