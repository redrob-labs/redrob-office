/**
 * Finished, labeled sessions waiting to be sent, in `userData/insights-outbox.json`.
 *
 * Labels and counts only (what @redrob-labs/work-labeller's `labelSession` returns); a person can open the
 * file and read everything that will leave the machine. Bounded, oldest out, so a machine that is never
 * online does not grow it forever. Writes are queued and atomic (`.partial`, then rename).
 */
import { existsSync } from 'node:fs'
import { readFile, rename, writeFile } from 'node:fs/promises'

import type { LabeledSession } from '@redrob-labs/work-labeller'

export const OUTBOX_LIMIT = 2000

export type OutboxEntry = { session: LabeledSession; queuedAt: number }

export class FileOutbox {
  private queue: Promise<unknown> = Promise.resolve()

  constructor(
    private readonly path: string,
    private readonly limit = OUTBOX_LIMIT,
  ) {}

  private async read(): Promise<OutboxEntry[]> {
    if (!existsSync(this.path)) return []
    try {
      const parsed: unknown = JSON.parse(await readFile(this.path, 'utf8'))
      return Array.isArray(parsed) ? (parsed as OutboxEntry[]) : []
    } catch {
      // A corrupt file loses its queue, never the app.
      return []
    }
  }

  private async write(entries: OutboxEntry[]): Promise<void> {
    await writeFile(`${this.path}.partial`, JSON.stringify(entries), 'utf8')
    await rename(`${this.path}.partial`, this.path)
  }

  private serial<T>(work: () => Promise<T>): Promise<T> {
    const next = this.queue.then(work, work)
    this.queue = next.catch(() => undefined)
    return next
  }

  list(): Promise<OutboxEntry[]> {
    return this.serial(() => this.read())
  }

  /** Adds or replaces (same external id) a session; the oldest go once over the limit. */
  add(session: LabeledSession, now = Date.now()): Promise<void> {
    return this.serial(async () => {
      const entries = (await this.read()).filter((e) => e.session.externalId !== session.externalId)
      entries.push({ session, queuedAt: now })
      await this.write(entries.slice(-this.limit))
    })
  }

  remove(externalIds: readonly string[]): Promise<void> {
    const gone = new Set(externalIds)
    return this.serial(async () => this.write((await this.read()).filter((e) => !gone.has(e.session.externalId))))
  }
}
