import { useCallback, useEffect, useState } from 'react'
import type { FactsCommand, FactsState } from '@genoffice/facts'
import type { DesktopApi } from '../../shared/ipc'

export interface DocFactsHook {
  /** Null outside the suite, or until the shell answers. */
  state: FactsState | null
  /** True when this window can reach the shell's index at all. */
  available: boolean
  command: (cmd: FactsCommand) => Promise<FactsState>
}

/** The shell's linked-figure index, kept current by its broadcasts. */
export function useDocFacts(desktop: Pick<DesktopApi, 'getFacts' | 'factsCommand' | 'onFactsChanged'> | undefined): DocFactsHook {
  const [state, setState] = useState<FactsState | null>(null)
  const available = !!desktop?.getFacts && !!desktop.factsCommand
  useEffect(() => {
    if (!desktop?.getFacts) return
    let live = true
    desktop
      .getFacts()
      .then((s) => {
        if (live && s) setState(s)
      })
      .catch(() => undefined)
    const off = desktop.onFactsChanged?.((s) => setState(s))
    return () => {
      live = false
      off?.()
    }
  }, [desktop])
  const command = useCallback(
    async (cmd: FactsCommand) => {
      if (!desktop?.factsCommand) throw new Error('Linked figures are not available here.')
      const s = await desktop.factsCommand(cmd)
      setState(s)
      return s
    },
    [desktop],
  )
  return { state, available, command }
}
