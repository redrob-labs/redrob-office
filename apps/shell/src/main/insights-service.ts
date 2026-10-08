/*
 * Runs Office's insights in the shell's main process: takes the editors' facts over IPC, labels each
 * session when it goes quiet, and sends the outbox to the Redrob Console every ten minutes or so with
 * the Console key the editors already use. See insights.ts for what is recorded and why.
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { app, ipcMain, net } from 'electron'
import { REDROB_CONSOLE_API_BASE, REDROB_ENGINE_ID } from '@genoffice/ai-provider'
import { addFact, finishQuiet, Outbox, parseRecord, syncOnce, type SessionTally } from './insights'

export const INSIGHTS_FACT_CHANNEL = 'insights:fact'

const CHECK_MS = 60_000
const FIRST_SYNC_MS = 60_000
const SYNC_MS = 10 * 60_000
const SYNC_JITTER_MS = 2 * 60_000

/** The Console key from the slot the editors read (redrob-connect writes it there). */
function consoleKey(): string | null {
  try {
    const settings = JSON.parse(readFileSync(join(app.getPath('userData'), 'ai-settings.json'), 'utf8'))
    const key = settings?.providers?.[REDROB_ENGINE_ID]?.apiKey
    return typeof key === 'string' && key.trim() ? key : null
  } catch {
    return null
  }
}

export function startInsights(): void {
  const tallies = new Map<string, SessionTally>()
  const outbox = new Outbox(join(app.getPath('userData'), 'insights-outbox.json'))
  let syncing = false

  ipcMain.on(INSIGHTS_FACT_CHANNEL, (_event, raw: unknown) => {
    const fact = parseRecord(raw)
    if (fact) addFact(tallies, fact)
  })

  const settle = (all = false) => {
    try {
      outbox.add(finishQuiet(tallies, Date.now(), all))
    } catch {
      // A full disk costs these sessions, never the person's work.
    }
  }

  const sync = async () => {
    if (syncing) return
    syncing = true
    try {
      await syncOnce({
        outbox,
        apiKey: consoleKey(),
        base: REDROB_CONSOLE_API_BASE,
        fetch: (url, init) => net.fetch(url, init),
      })
    } catch {
      // Tried again next time.
    } finally {
      syncing = false
    }
  }

  setInterval(() => settle(), CHECK_MS).unref()
  const scheduleSync = (delay: number) => {
    setTimeout(() => {
      void sync().finally(() => scheduleSync(SYNC_MS + (Math.random() * 2 - 1) * SYNC_JITTER_MS))
    }, delay).unref()
  }
  scheduleSync(FIRST_SYNC_MS)

  // Sessions still open at quit are finished as they stand, and sent on the next launch.
  app.on('before-quit', () => settle(true))
}
