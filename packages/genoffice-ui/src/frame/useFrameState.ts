import { useCallback, useEffect, useState } from 'react'
import { PANEL_DEFAULT, clampPanelWidth } from './layout'
import type { ToolbarChoice } from './parts'

/** the slice of an editor's preload the frame state follows (structural, so apps keep their own types) */
export interface FramePrefsSource {
  getOfficePrefs?: (() => Promise<{ toolbar: ToolbarChoice } | null>) | undefined
  setOfficePrefs?: ((patch: { toolbar: ToolbarChoice }) => Promise<unknown>) | undefined
  onOfficePrefsChanged?: ((handler: (prefs: { toolbar: ToolbarChoice }) => void) => () => void) | undefined
}

export interface FrameState {
  toolbar: ToolbarChoice
  setToolbar: (t: ToolbarChoice) => void
  panelWidth: number
  setPanelWidth: (w: number) => void
  online: boolean
}

function loadWidth(key: string): number {
  try {
    const saved = Number(localStorage.getItem(key))
    return Number.isFinite(saved) && saved > 0 ? clampPanelWidth(saved) : PANEL_DEFAULT
  } catch {
    return PANEL_DEFAULT
  }
}

/**
 * The state every editor keeps for its EditorFrame: the toolbar choice (from
 * Settings, followed live, stored through the shell), the Redrob panel width
 * (kept per editor in localStorage) and whether the computer is online.
 */
export function useFrameState(api: FramePrefsSource | undefined, panelWidthKey: string): FrameState {
  const [toolbar, setToolbarState] = useState<ToolbarChoice>('simple')
  const [panelWidth, setPanelWidthState] = useState(() => loadWidth(panelWidthKey))
  const [online, setOnline] = useState(() => (typeof navigator === 'undefined' ? true : navigator.onLine))

  useEffect(() => {
    let live = true
    void api
      ?.getOfficePrefs?.()
      .then((p) => {
        if (live && p) setToolbarState(p.toolbar)
      })
      .catch(() => {})
    const off = api?.onOfficePrefsChanged?.((p) => setToolbarState(p.toolbar))
    const up = () => setOnline(true)
    const down = () => setOnline(false)
    window.addEventListener('online', up)
    window.addEventListener('offline', down)
    return () => {
      live = false
      off?.()
      window.removeEventListener('online', up)
      window.removeEventListener('offline', down)
    }
  }, [api])

  const setToolbar = useCallback(
    (t: ToolbarChoice) => {
      setToolbarState(t)
      // outside the suite there is no shell to store it: the choice lasts this window
      void api?.setOfficePrefs?.({ toolbar: t })?.catch(() => {})
    },
    [api],
  )

  const setPanelWidth = useCallback(
    (w: number) => {
      const next = clampPanelWidth(w)
      setPanelWidthState(next)
      try {
        localStorage.setItem(panelWidthKey, String(next))
      } catch {
        /* private storage: the width lasts this window */
      }
    },
    [panelWidthKey],
  )

  return { toolbar, setToolbar, panelWidth, setPanelWidth, online }
}
