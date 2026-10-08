// The fonts 한컴오피스 keeps for itself (spec task 1.3, E8; R2.5).
//
// 한컴오피스 installs many of the faces Hangul documents ask for (HY견명조,
// 한양신명조, 휴먼명조…) into its own folder rather than the system's, so
// the browser cannot see them. When the person has 한컴오피스, the editor may
// draw with them: the renderer asks for a face by name, and main answers with
// the bytes of a file it found in those folders. Nothing is copied or
// bundled; the bytes are read from the person's own installation each time.
//
// Only files found by the scan are ever read, so the request cannot name a
// path. Folders: 한컴오피스's install folders for this platform, plus
// REDROB_HANGUL_FONT_DIRS (separated like PATH).
import { open, readdir, readFile, stat } from 'node:fs/promises'
import { delimiter, join } from 'node:path'

const FONT_FILE = /\.(ttf|otf|ttc)$/i
const MAX_FONT_BYTES = 64 * 1024 * 1024
const MAX_FILES = 4000
const MAX_DEPTH = 6

export interface FontFile {
  path: string
  size: number
}

/** Where 한컴오피스 keeps fonts on this platform. */
export function hancomFontRoots(platform: NodeJS.Platform, env: NodeJS.ProcessEnv): string[] {
  const extra = (env.REDROB_HANGUL_FONT_DIRS ?? '').split(delimiter).filter(Boolean)
  if (platform === 'win32') {
    const pf = [env.ProgramFiles, env['ProgramFiles(x86)'], env.ProgramW6432].filter((x): x is string => !!x)
    return [...new Set([...pf.map((p) => join(p, 'Hnc')), join(env.SystemDrive ?? 'C:', '\\', 'HNC'), ...extra])]
  }
  if (platform === 'darwin') return ['/Applications', ...extra]
  return ['/opt/hnc', '/opt/hancom', ...extra]
}

/** Folder names worth entering under a root (on macOS, only 한컴 apps under /Applications). */
function enter(root: string, depth: number, name: string): boolean {
  if (root === '/Applications' && depth === 0) return /hancom|hwp|한컴|한글/i.test(name)
  return !name.startsWith('.')
}

/** Read the family names (name ids 1 and 16) of the first face in a font file. */
export async function familyNames(path: string): Promise<string[]> {
  const fh = await open(path, 'r')
  try {
    const read = async (pos: number, len: number) => {
      const b = Buffer.alloc(len)
      const { bytesRead } = await fh.read(b, 0, len, pos)
      return b.subarray(0, bytesRead)
    }
    let base = 0
    const head = await read(0, 12)
    if (head.length < 12) return []
    // A collection: the first face's table directory (FontFace loads the first face).
    if (head.toString('latin1', 0, 4) === 'ttcf') {
      const first = await read(12, 4)
      if (first.length < 4) return []
      base = first.readUInt32BE(0)
    }
    const dir = await read(base, 12)
    if (dir.length < 12) return []
    const numTables = dir.readUInt16BE(4)
    if (numTables > 200) return []
    const records = await read(base + 12, numTables * 16)
    let nameOff = -1
    let nameLen = 0
    for (let i = 0; i + 16 <= records.length; i += 16) {
      if (records.toString('latin1', i, i + 4) === 'name') {
        nameOff = records.readUInt32BE(i + 8)
        nameLen = records.readUInt32BE(i + 12)
      }
    }
    if (nameOff < 0 || nameLen < 6 || nameLen > 1024 * 1024) return []
    const t = await read(nameOff, nameLen)
    const count = t.readUInt16BE(2)
    const strings = t.readUInt16BE(4)
    const out = new Set<string>()
    for (let i = 0; i < count && 6 + i * 12 + 12 <= t.length; i++) {
      const r = 6 + i * 12
      const platform = t.readUInt16BE(r)
      const encoding = t.readUInt16BE(r + 2)
      const nameId = t.readUInt16BE(r + 6)
      const len = t.readUInt16BE(r + 8)
      const off = strings + t.readUInt16BE(r + 10)
      if ((nameId !== 1 && nameId !== 16) || off + len > t.length) continue
      const raw = t.subarray(off, off + len)
      let s = ''
      if (platform === 0 || platform === 3) s = new TextDecoder('utf-16be').decode(raw)
      else if (platform === 1 && encoding === 0) s = raw.toString('latin1')
      else if (platform === 1 && encoding === 3) s = safeDecode('euc-kr', raw)
      s = s.replace(/\0/g, '').trim()
      if (s) out.add(s)
    }
    return [...out]
  } finally {
    await fh.close()
  }
}

function safeDecode(label: string, raw: Uint8Array): string {
  try {
    return new TextDecoder(label).decode(raw)
  } catch {
    return ''
  }
}

/** Face name → file, for every font file under the roots. */
export async function scanFonts(roots: readonly string[]): Promise<Map<string, FontFile>> {
  const index = new Map<string, FontFile>()
  let files = 0
  const walk = async (root: string, dir: string, depth: number): Promise<void> => {
    if (depth > MAX_DEPTH || files >= MAX_FILES) return
    let entries: import('node:fs').Dirent[]
    try {
      entries = await readdir(dir, { withFileTypes: true })
    } catch {
      return
    }
    for (const e of entries) {
      if (files >= MAX_FILES) return
      const p = join(dir, e.name)
      if (e.isDirectory()) {
        if (enter(root, depth, e.name)) await walk(root, p, depth + 1)
      } else if (e.isFile() && FONT_FILE.test(e.name)) {
        files++
        try {
          const { size } = await stat(p)
          if (size > MAX_FONT_BYTES) continue
          for (const n of await familyNames(p)) if (!index.has(n.toLowerCase())) index.set(n.toLowerCase(), { path: p, size })
        } catch {
          /* unreadable or not a font */
        }
      }
    }
  }
  for (const r of roots) await walk(r, r, 0)
  return index
}

/** The renderer's font provider: bytes for a face found in 한컴오피스's folders, or null. */
export function hancomFontSource(roots: () => readonly string[]): (face: unknown) => Promise<Uint8Array | null> {
  let index: Promise<Map<string, FontFile>> | null = null
  return async (face) => {
    if (typeof face !== 'string' || !face || face.length > 200) return null
    index ??= scanFonts(roots())
    const hit = (await index).get(face.toLowerCase())
    if (!hit) return null
    try {
      return new Uint8Array(await readFile(hit.path))
    } catch {
      return null
    }
  }
}
