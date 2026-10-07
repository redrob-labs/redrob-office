/**
 * Version history and catch-up, as plain data.
 *
 * A version is the bytes a save wrote, kept on this computer. Named versions
 * are kept for good; unnamed ones are thinned as they age (every version from
 * the last day, one a day for a month, one a week after that), so history
 * stays useful without growing forever.
 */

export interface VersionInfo {
  id: string
  /** ISO time of the save */
  at: string
  by: string
  /** set by "Name the current version" */
  name?: string
  /** sha256 of the bytes, hex */
  sha256: string
  size: number
  /** the save was an autosave */
  auto?: boolean
}

export interface VersionIndex {
  version: 1
  /** the document's path when the history began (restores go beside it) */
  path: string
  /** oldest first */
  versions: VersionInfo[]
}

const DAY = 86_400_000

/**
 * Which versions to keep: every named one, the newest, everything from the
 * last day, the newest per day for 30 days, the newest per week after that,
 * and never more than `max` unnamed ones.
 */
export function thin(versions: readonly VersionInfo[], now: Date, max = 200): VersionInfo[] {
  if (versions.length === 0) return []
  const newest = versions[versions.length - 1]!
  const keep = new Set<string>([newest.id])
  const buckets = new Map<string, VersionInfo>()
  for (const v of versions) {
    if (v.name) {
      keep.add(v.id)
      continue
    }
    const age = now.getTime() - Date.parse(v.at)
    if (!(age >= 0) || age < DAY) {
      keep.add(v.id)
      continue
    }
    const bucket = age < 30 * DAY ? `d${Math.floor(age / DAY)}` : `w${Math.floor(age / (7 * DAY))}`
    const prev = buckets.get(bucket)
    if (!prev || Date.parse(prev.at) < Date.parse(v.at)) buckets.set(bucket, v)
  }
  for (const v of buckets.values()) keep.add(v.id)
  let kept = versions.filter((v) => keep.has(v.id))
  const unnamed = kept.filter((v) => !v.name)
  if (unnamed.length > max) {
    const drop = new Set(unnamed.slice(0, unnamed.length - max).map((v) => v.id))
    drop.delete(newest.id)
    kept = kept.filter((v) => !drop.has(v.id))
  }
  return kept
}

/** "forecast (version 5 Oct 2026 09.14).docx": the name of a restored copy, beside the original. */
export function restoredCopyName(baseName: string, at: string): string {
  const dot = baseName.lastIndexOf('.')
  const stem = dot > 0 ? baseName.slice(0, dot) : baseName
  const ext = dot > 0 ? baseName.slice(dot) : ''
  const d = new Date(at)
  const stamp = Number.isNaN(d.getTime())
    ? 'earlier'
    : `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')} ${String(d.getUTCHours()).padStart(2, '0')}.${String(d.getUTCMinutes()).padStart(2, '0')}`
  return `${stem} (version ${stamp})${ext}`
}

// ---- catch-up: what changed since this person last had the file open ----

export interface CatchUpComment {
  id: string
  author: string
  date?: string | undefined
  text: string
  parentId?: string | undefined
}

export interface CatchUpRevision {
  kind: 'ins' | 'del'
  author: string
  date?: string | undefined
  /** where to go when "Show me" is pressed (an editor position or anchor id) */
  at: number
}

export type CatchUpItem =
  | { kind: 'comment'; author: string; text: string; commentId: string; reply: boolean }
  | { kind: 'suggestion'; author: string; count: number; at: number }
  | { kind: 'figures'; count: number }

/**
 * What changed since `since`, said once per thing: each new comment or reply
 * by someone else, each other person's tracked changes grouped per person,
 * and the linked figures waiting for this file. Dates that do not parse count
 * as new only when there is no previous visit.
 */
export function catchUpItems(input: {
  since: string | null
  me: string | null
  comments: readonly CatchUpComment[]
  revisions: readonly CatchUpRevision[]
  waitingFigures: number
}): CatchUpItem[] {
  const since = input.since ? Date.parse(input.since) : Number.NaN
  if (Number.isNaN(since)) return []
  const isNew = (date: string | undefined) => {
    const t = date ? Date.parse(date) : Number.NaN
    return !Number.isNaN(t) && t > since
  }
  const notMe = (author: string) => !input.me || author.trim() !== input.me.trim()
  const out: CatchUpItem[] = []
  for (const c of input.comments) {
    if (isNew(c.date) && notMe(c.author)) {
      out.push({ kind: 'comment', author: c.author, text: c.text, commentId: c.parentId ?? c.id, reply: !!c.parentId })
    }
  }
  const byAuthor = new Map<string, { count: number; at: number }>()
  for (const r of input.revisions) {
    if (!isNew(r.date) || !notMe(r.author)) continue
    const cur = byAuthor.get(r.author)
    if (cur) cur.count += 1
    else byAuthor.set(r.author, { count: 1, at: r.at })
  }
  for (const [author, v] of byAuthor) out.push({ kind: 'suggestion', author, count: v.count, at: v.at })
  if (input.waitingFigures > 0) out.push({ kind: 'figures', count: input.waitingFigures })
  return out
}
