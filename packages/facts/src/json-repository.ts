import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import { dirname } from 'node:path'
import { emptyFactsState, type FactsState } from './model'
import { normalizeFactsState } from './normalize'
import type { FactsRepository } from './repository'

/**
 * The facts index as one JSON file. Writes go to a temporary file first and
 * are renamed into place, so a crash mid-write leaves the previous index. A
 * file that does not parse is moved aside (never deleted) and the store starts
 * empty, so a person can still recover it by hand.
 */
export class JsonFileFactsRepository implements FactsRepository {
  constructor(private readonly path: string) {}

  async load(): Promise<FactsState> {
    let text: string
    try {
      text = await readFile(this.path, 'utf8')
    } catch (err) {
      if ((err as { code?: unknown }).code === 'ENOENT') return emptyFactsState()
      throw err
    }
    let raw: unknown
    try {
      raw = JSON.parse(text)
    } catch {
      await rename(this.path, `${this.path}.corrupt-${Date.now()}`).catch(() => undefined)
      return emptyFactsState()
    }
    return normalizeFactsState(raw)
  }

  async save(state: FactsState): Promise<void> {
    await mkdir(dirname(this.path), { recursive: true })
    const tmp = `${this.path}.${process.pid}.tmp`
    await writeFile(tmp, JSON.stringify(state, null, 2), 'utf8')
    await rename(tmp, this.path)
  }
}
