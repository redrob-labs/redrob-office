import { useCallback, useEffect, useState } from 'react'

/** The preload surface of @genoffice/facts' factsBridge, structurally (no facts dependency here). */
export interface FactsIndexApi<S, C> {
  getFacts?: () => Promise<S | null>
  factsCommand?: (cmd: C) => Promise<S>
  onFactsChanged?: (handler: (state: S) => void) => () => void
}

export interface FactsIndex<S, C> {
  /** null outside the suite, or until the shell answers */
  state: S | null
  /** this window can reach the shell's index at all */
  available: boolean
  command: (cmd: C) => Promise<S>
}

/** The shell's linked-figure index, kept current by its broadcasts. */
export function useFactsIndex<S, C>(api: FactsIndexApi<S, C> | undefined): FactsIndex<S, C> {
  const [state, setState] = useState<S | null>(null)
  const available = !!api?.getFacts && !!api.factsCommand
  useEffect(() => {
    if (!api?.getFacts) return
    let live = true
    api
      .getFacts()
      .then((s) => {
        if (live && s) setState(s)
      })
      .catch(() => undefined)
    const off = api.onFactsChanged?.((s) => setState(s))
    return () => {
      live = false
      off?.()
    }
  }, [api])
  const command = useCallback(
    async (cmd: C) => {
      if (!api?.factsCommand) throw new Error('Linked figures are not available here.')
      const s = await api.factsCommand(cmd)
      setState(s)
      return s
    },
    [api],
  )
  return { state, available, command }
}
