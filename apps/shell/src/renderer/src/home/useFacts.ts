import { useCallback, useEffect, useState } from 'react'
import { emptyFactsState, type FactsState } from '@genoffice/facts'
import type { FactsApi, FactsCommand } from '../../../shared/facts-api'

export interface FactsHook {
  /** Null until the first read finishes. */
  state: FactsState | null
  /** The first read failed; `retry` reads again. */
  loadFailed: boolean
  retry: () => void
  /** Rejects when the main process refused or could not save the command. */
  command: (cmd: FactsCommand) => Promise<FactsState>
}

/** The linked-figure state, kept current by the main process's broadcasts. */
export function useFacts(api: FactsApi | undefined = window.aiOfficeFacts): FactsHook {
  const [state, setState] = useState<FactsState | null>(api ? null : emptyFactsState())
  const [loadFailed, setLoadFailed] = useState(false)
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    if (!api) return
    let live = true
    api
      .get()
      .then((s) => {
        if (!live) return
        setState(s)
        setLoadFailed(false)
      })
      .catch(() => {
        if (live) setLoadFailed(true)
      })
    const off = api.onChanged((s) => {
      setState(s)
      setLoadFailed(false)
    })
    return () => {
      live = false
      off()
    }
  }, [api, attempt])

  const command = useCallback(
    async (cmd: FactsCommand) => {
      if (!api) throw new Error('Linked figures are not available.')
      const s = await api.command(cmd)
      setState(s)
      return s
    },
    [api],
  )

  const retry = useCallback(() => setAttempt((n) => n + 1), [])
  return { state, loadFailed, retry, command }
}
