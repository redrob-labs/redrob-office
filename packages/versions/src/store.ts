import { createHash, randomUUID } from 'node:crypto'
import { copyFile, mkdir, readFile, readdir, rename, rm, stat, writeFile } from 'node:fs/promises'
import { basename, dirname, join } from 'node:path'
import { restoredCopyName, thin, type VersionIndex, type VersionInfo } from './model'

/** One folder per document, named by a hash of its path (a path never appears in a file name). */
export function docKey(path: string): string {
  return createHash('sha256').update(path.toLowerCase()).digest('hex').slice(0, 32)
}

const sha256 = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex')

async function writeJson(path: string, value: unknown): Promise<void> {
  await mkdir(dirname(path), { recursive: true })
  const tmp = `${path}.${process.pid}.${randomUUID()}.tmp`
  await writeFile(tmp, JSON.stringify(value, null, 2), 'utf8')
  await rename(tmp, path)
}

async function readJson(path: string): Promise<unknown> {
  try {
    return JSON.parse(await readFile(path, 'utf8')) as unknown
  } catch {
    return null
  }
}

function normalizeIndex(raw: unknown, path: string): VersionIndex {
  const out: VersionIndex = { version: 1, path, versions: [] }
  if (typeof raw !== 'object' || raw === null) return out
  const r = raw as Record<string, unknown>
  if (typeof r.path === 'string' && r.path) out.path = r.path
  if (!Array.isArray(r.versions)) return out
  for (const v of r.versions as unknown[]) {
    if (typeof v !== 'object' || v === null) continue
    const x = v as Record<string, unknown>
    if (typeof x.id !== 'string' || typeof x.at !== 'string' || typeof x.by !== 'string') continue
    if (typeof x.sha256 !== 'string' || !/^[a-f0-9]{64}$/.test(x.sha256) || typeof x.size !== 'number') continue
    out.versions.push({
      id: x.id,
      at: x.at,
      by: x.by,
      sha256: x.sha256,
      size: x.size,
      ...(typeof x.name === 'string' && x.name ? { name: x.name } : {}),
      ...(x.auto === true ? { auto: true } : {}),
    })
  }
  return out
}

export interface VersionStoreOptions {
  /** the folder that holds every document's history (userData/versions) */
  root: string
  now?: () => Date
}

/**
 * Version history on this computer. Each save records the bytes it wrote; the
 * same bytes twice are one version. Bytes are stored once per content hash.
 * Saves to the same document are serialised.
 */
export class VersionStore {
  private readonly root: string
  private readonly now: () => Date
  private chain = new Map<string, Promise<unknown>>()

  constructor(opts: VersionStoreOptions) {
    this.root = opts.root
    this.now = opts.now ?? (() => new Date())
  }

  private dir(path: string) {
    return join(this.root, docKey(path))
  }

  private serial<T>(path: string, fn: () => Promise<T>): Promise<T> {
    const key = docKey(path)
    const prev = this.chain.get(key) ?? Promise.resolve()
    const next = prev.catch(() => undefined).then(fn)
    this.chain.set(key, next)
    return next
  }

  async list(path: string): Promise<VersionInfo[]> {
    return (await this.index(path)).versions.slice().reverse()
  }

  private async index(path: string): Promise<VersionIndex> {
    return normalizeIndex(await readJson(join(this.dir(path), 'index.json')), path)
  }

  /** Records a save; returns the version (the existing one when the bytes did not change). */
  record(path: string, bytes: Uint8Array, opts: { by: string; auto?: boolean }): Promise<VersionInfo> {
    return this.serial(path, async () => {
      const dir = this.dir(path)
      const idx = await this.index(path)
      const hash = sha256(bytes)
      const last = idx.versions[idx.versions.length - 1]
      if (last && last.sha256 === hash) return last
      await mkdir(dir, { recursive: true })
      const blob = join(dir, `${hash}.bin`)
      try {
        await stat(blob)
      } catch {
        await writeFile(blob, bytes)
      }
      const v: VersionInfo = {
        id: randomUUID(),
        at: this.now().toISOString(),
        by: opts.by,
        sha256: hash,
        size: bytes.byteLength,
        ...(opts.auto ? { auto: true } : {}),
      }
      idx.versions = thin([...idx.versions, v], this.now())
      await writeJson(join(dir, 'index.json'), idx)
      await this.collect(dir, idx)
      return v
    })
  }

  /** Names a version (empty clears the name); named versions are never thinned. */
  name(path: string, id: string, name: string): Promise<VersionInfo | null> {
    return this.serial(path, async () => {
      const idx = await this.index(path)
      const v = idx.versions.find((x) => x.id === id)
      if (!v) return null
      const clean = name.replace(/\s+/g, ' ').trim().slice(0, 120)
      if (clean) v.name = clean
      else delete v.name
      await writeJson(join(this.dir(path), 'index.json'), idx)
      return v
    })
  }

  async read(path: string, id: string): Promise<Uint8Array | null> {
    const v = (await this.index(path)).versions.find((x) => x.id === id)
    if (!v) return null
    try {
      return await readFile(join(this.dir(path), `${v.sha256}.bin`))
    } catch {
      return null
    }
  }

  /**
   * Restores a version as a copy beside the document; the document itself is
   * untouched. The copy goes next to the path the history recorded, never a
   * folder a caller names. Returns the copy's path.
   */
  async restoreCopy(path: string, id: string): Promise<string | null> {
    const idx = await this.index(path)
    const v = idx.versions.find((x) => x.id === id)
    if (!v) return null
    const src = join(this.dir(path), `${v.sha256}.bin`)
    let target = join(dirname(idx.path), restoredCopyName(basename(idx.path), v.at))
    for (let n = 2; n < 100; n++) {
      try {
        await stat(target)
        const dot = target.lastIndexOf('.')
        target = dot > 0 ? `${target.slice(0, dot).replace(/ \(\d+\)$/, '')} (${n})${target.slice(dot)}` : `${target} (${n})`
      } catch {
        break
      }
    }
    await copyFile(src, target)
    return target
  }

  /** Deletes stored bytes no version refers to any more. */
  private async collect(dir: string, idx: VersionIndex): Promise<void> {
    const live = new Set(idx.versions.map((v) => `${v.sha256}.bin`))
    for (const f of await readdir(dir)) {
      if (f.endsWith('.bin') && !live.has(f)) await rm(join(dir, f), { force: true })
    }
  }

  // ---- last visits (catch-up) ----

  private visitsPath() {
    return join(this.root, 'visits.json')
  }

  /** When this computer last had the document open, or null on a first visit. */
  async lastVisit(path: string): Promise<string | null> {
    const raw = await readJson(this.visitsPath())
    const v = raw && typeof raw === 'object' ? (raw as Record<string, unknown>)[docKey(path)] : undefined
    return typeof v === 'string' ? v : null
  }

  /** Records a visit now; returns the previous one. */
  markVisit(path: string): Promise<string | null> {
    return this.serial('\u0000visits', async () => {
      const raw = await readJson(this.visitsPath())
      const map: Record<string, string> = raw && typeof raw === 'object' ? { ...(raw as Record<string, string>) } : {}
      const key = docKey(path)
      const prev = typeof map[key] === 'string' ? map[key]! : null
      map[key] = this.now().toISOString()
      await writeJson(this.visitsPath(), map)
      return prev
    })
  }
}
