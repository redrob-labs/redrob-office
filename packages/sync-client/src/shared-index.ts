import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import { dirname } from 'node:path'
import { isRole, type Role } from './client'

/** Which local file is which shared file, and what this person may do with it. */
export interface SharedLink {
  fileId: string
  role: Role
  /** the last version this computer has (uploaded or downloaded) */
  version: number
}

const key = (path: string) => path.toLowerCase()

/** The index as a JSON file in userData; writes are atomic, and an unreadable file starts empty. */
export class SharedIndex {
  private map: Record<string, SharedLink & { path: string }> | null = null
  constructor(private readonly file: string) {}

  private async load() {
    if (this.map) return this.map
    try {
      const raw = JSON.parse(await readFile(this.file, 'utf8')) as Record<string, unknown>
      const out: Record<string, SharedLink & { path: string }> = {}
      for (const [k, v] of Object.entries(raw)) {
        const x = v as Record<string, unknown>
        if (typeof x?.path === 'string' && typeof x.fileId === 'string' && isRole(x.role) && typeof x.version === 'number') {
          out[k] = { path: x.path, fileId: x.fileId, role: x.role, version: x.version }
        }
      }
      this.map = out
    } catch {
      this.map = {}
    }
    return this.map
  }

  private async save() {
    await mkdir(dirname(this.file), { recursive: true })
    const tmp = `${this.file}.${process.pid}.tmp`
    await writeFile(tmp, JSON.stringify(this.map, null, 2), 'utf8')
    await rename(tmp, this.file)
  }

  async get(path: string): Promise<SharedLink | null> {
    const m = await this.load()
    const v = m[key(path)]
    return v ? { fileId: v.fileId, role: v.role, version: v.version } : null
  }

  async pathOf(fileId: string): Promise<string | null> {
    const m = await this.load()
    return Object.values(m).find((v) => v.fileId === fileId)?.path ?? null
  }

  async set(path: string, link: SharedLink): Promise<void> {
    const m = await this.load()
    m[key(path)] = { path, ...link }
    await this.save()
  }

  async remove(path: string): Promise<void> {
    const m = await this.load()
    delete m[key(path)]
    await this.save()
  }
}
