import { useEffect, useMemo, useRef, useState, type ReactElement } from 'react'
import { Icon } from '@genoffice/ui'
import type { HomeApi, RecentEntry } from '../../shared/home-api'
import { useI18n } from './locale'
import './search-palette.css'

declare global {
  interface Window {
    aiOffice: HomeApi
  }
}

/** file-type icon color/letter, lightweight (the palette lists many rows) */
const EXT_COLOR: Record<string, string> = {
  docx: '#3276CD',
  xlsx: '#4FA16B',
  pptx: '#D33922',
  pdf: '#EF4444',
  md: '#8B5CF6',
  hwp: '#0E7C86',
}

function baseName(entry: RecentEntry): string {
  return entry.ext ? entry.name.slice(0, -(entry.ext.length + 1)) : entry.name
}

function parentDir(path: string): string {
  const i = Math.max(path.lastIndexOf('/'), path.lastIndexOf('\\'))
  if (i <= 0) return ''
  const dir = path.slice(0, i)
  const j = Math.max(dir.lastIndexOf('/'), dir.lastIndexOf('\\'))
  return j < 0 ? dir : dir.slice(j + 1)
}

export interface SearchPaletteProps {
  onClose: () => void
}

/**
 * Centered command-palette popup opened from the chrome search box: a search
 * field over the recent files, each openable with a click (or Enter on the
 * highlighted row). Esc or a backdrop click closes it. Keyboard: ArrowUp/Down
 * move the selection, Enter opens it.
 *
 * This is plain shell DOM, so it must paint over the whole window. Inside an
 * editor tab the active view is a native WebContentsView that sits ABOVE the
 * shell DOM and would hide this palette entirely. The TabBar therefore parks
 * that view off-screen via `tabs.setChromeOverlay(true)` before mounting the
 * palette and restores it with `setChromeOverlay(false)` on close (see
 * TabBar's openPalette/closePalette). This component owns none of that; its
 * `onClose` is what TabBar wires to the restore call, so always route close
 * through it rather than unmounting the palette directly.
 */
export function SearchPalette({ onClose }: SearchPaletteProps): ReactElement {
  const { t } = useI18n()
  const [query, setQuery] = useState('')
  const [all, setAll] = useState<RecentEntry[]>([])
  const [active, setActive] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)

  // load recents once on open; the palette filters locally
  useEffect(() => {
    let live = true
    void window.aiOffice.recents?.({ offset: 0, limit: 100 }).then((page) => {
      if (live) setAll(page.entries)
    })
    return () => {
      live = false
    }
  }, [])

  // focus the field on open
  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  const results = useMemo(() => {
    const q = query.trim().toLowerCase()
    const list = q ? all.filter((e) => e.name.toLowerCase().includes(q)) : all
    return list.slice(0, 50)
  }, [query, all])

  // keep the active row in range when the result set shrinks
  useEffect(() => {
    setActive((a) => Math.min(a, Math.max(0, results.length - 1)))
  }, [results.length])

  const open = (entry: RecentEntry) => {
    void window.aiOffice.openPath?.(entry.path)
    onClose()
  }

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      onClose()
      return
    }
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setActive((a) => Math.min(a + 1, results.length - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setActive((a) => Math.max(a - 1, 0))
    } else if (e.key === 'Enter') {
      e.preventDefault()
      const entry = results[active]
      if (entry) open(entry)
    }
  }

  return (
    <div className="palette-scrim" onClick={onClose}>
      <div
        className="palette"
        role="dialog"
        aria-modal="true"
        aria-label={t('paletteTitle')}
        onClick={(e) => e.stopPropagation()}
        onKeyDown={onKeyDown}
      >
        <div className="palette__field">
          <Icon name="search" size={18} />
          <input
            ref={inputRef}
            className="palette__input"
            type="text"
            placeholder={t('palettePlaceholder')}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
        <div className="palette__list" role="listbox">
          {results.length === 0 ? (
            <div className="palette__empty">{t('paletteEmpty')}</div>
          ) : (
            results.map((entry, i) => (
              <button
                key={entry.path}
                type="button"
                role="option"
                aria-selected={i === active}
                className={`palette__row${i === active ? ' active' : ''}`}
                onMouseEnter={() => setActive(i)}
                onClick={() => open(entry)}
              >
                <span
                  className="palette__badge"
                  style={{ background: EXT_COLOR[entry.ext] ?? '#98a2b3' }}
                  aria-hidden="true"
                >
                  {(entry.ext || '?').slice(0, 1).toUpperCase()}
                </span>
                <span className="palette__text">
                  <span className="palette__name">{baseName(entry)}</span>
                  <span className="palette__dir">{parentDir(entry.path)}</span>
                </span>
                <span className="palette__hint">{t('paletteOpen')}</span>
              </button>
            ))
          )}
        </div>
        <div className="palette__foot">
          <span>{t('paletteNav')}</span>
          <span>{t('paletteFootKeys')}</span>
        </div>
      </div>
    </div>
  )
}
