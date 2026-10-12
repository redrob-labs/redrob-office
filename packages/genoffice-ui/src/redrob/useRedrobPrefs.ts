import { useEffect, useState } from 'react'
import type { CrossCheckLevel, RedrobMode } from './RedrobParts'

interface Prefs {
  composerMode: RedrobMode
  memory: boolean
  factCheck: CrossCheckLevel
  challenge: CrossCheckLevel
}

/** the slice of an editor preload the Redrob panel follows (structural) */
export interface RedrobPrefsSource {
  getOfficePrefs?: (() => Promise<Prefs | null>) | undefined
  onOfficePrefsChanged?: ((handler: (prefs: Prefs) => void) => () => void) | undefined
}

/**
 * The Redrob panel's view of Settings: Plan or Run's default (the panel can
 * change it per message), Memory and the Cross-check levels for the status
 * line. Defaults stand until the shell answers; outside the suite they stay.
 */
export function useRedrobPrefs(api: RedrobPrefsSource | undefined) {
  const [mode, setMode] = useState<RedrobMode>('run')
  const [memory, setMemory] = useState(true)
  const [factCheck, setFactCheck] = useState<CrossCheckLevel>('auto')
  const [challenge, setChallenge] = useState<CrossCheckLevel>('auto')
  useEffect(() => {
    let live = true
    const take = (p: Prefs) => {
      setMemory(p.memory)
      setFactCheck(p.factCheck)
      setChallenge(p.challenge)
    }
    void api
      ?.getOfficePrefs?.()
      .then((p) => {
        if (!live || !p) return
        setMode(p.composerMode)
        take(p)
      })
      .catch(() => {})
    const off = api?.onOfficePrefsChanged?.(take)
    return () => {
      live = false
      off?.()
    }
  }, [api])
  return { mode, setMode, memory, factCheck, challenge }
}
