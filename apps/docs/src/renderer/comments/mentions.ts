/**
 * @mentions in comments. Typing "@" opens a list of people that filters as you
 * type; picking one writes "@Name " into the text. "@Redrob" is a person too:
 * a comment that mentions it is answered by Redrob in the same thread.
 * Pure functions, so the rules are testable without a DOM.
 */

export const REDROB_MENTION = 'Redrob'

/** Mention copy; English is the master and the only selectable language. */
export const MENTION_STRINGS = {
  list: 'People to mention',
  redrobHint: 'answers in this thread',
  tip: 'Type @ to mention someone. @Redrob answers here.',
  asked: 'Redrob is answering the comment.',
} as const

export interface MentionPerson {
  name: string
  /** Redrob answers in the thread rather than being notified */
  redrob?: boolean
}

export interface MentionQuery {
  /** index of the "@" */
  start: number
  /** what was typed after it, up to the caret */
  query: string
}

/**
 * The mention being typed at `caret`, or null. An "@" counts only at the
 * start or after whitespace or an opening bracket, so an e-mail address does
 * not open the list; the query ends at the caret and may hold one space
 * ("@Jae Ga") so two-word names can be typed out.
 */
export function mentionQuery(text: string, caret: number): MentionQuery | null {
  const before = text.slice(0, caret)
  const at = before.lastIndexOf('@')
  if (at < 0) return null
  const prev = at === 0 ? '' : before[at - 1]!
  if (prev && !/[\s([{"']/.test(prev)) return null
  const query = before.slice(at + 1)
  if (query.length > 40 || /\n/.test(query) || (query.match(/ /g) ?? []).length > 1 || /^\s/.test(query)) return null
  return { start: at, query }
}

/** People whose name starts with the query (or any word of it does), Redrob first. */
export function filterPeople(people: readonly MentionPerson[], query: string, limit = 6): MentionPerson[] {
  const q = query.trim().toLowerCase()
  const match = (p: MentionPerson) => {
    const n = p.name.toLowerCase()
    return !q || n.startsWith(q) || n.split(/\s+/).some((w) => w.startsWith(q))
  }
  return people
    .filter(match)
    .sort((a, b) => Number(!!b.redrob) - Number(!!a.redrob) || a.name.localeCompare(b.name))
    .slice(0, limit)
}

/** The text with the typed mention replaced by "@Name ", and where the caret goes. */
export function applyMention(text: string, q: MentionQuery, caret: number, name: string): { text: string; caret: number } {
  const inserted = `@${name} `
  const next = text.slice(0, q.start) + inserted + text.slice(caret).replace(/^ /, '')
  return { text: next, caret: q.start + inserted.length }
}

/** The people a comment mentions, by exact "@Name" with a word boundary after it. */
export function mentionsIn(text: string, people: readonly MentionPerson[]): MentionPerson[] {
  // longest names first, so "@Jae Gardner" is not also read as "@Jae"
  const sorted = [...people].sort((a, b) => b.name.length - a.name.length)
  const found: MentionPerson[] = []
  let rest = text
  for (const p of sorted) {
    const re = new RegExp(`(^|[\\s([{"'])@${p.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?![\\p{L}\\p{N}_])`, 'u')
    if (re.test(rest)) {
      found.push(p)
      rest = rest.replace(re, '$1')
    }
  }
  return found
}

export function mentionsRedrob(text: string): boolean {
  return mentionsIn(text, [{ name: REDROB_MENTION, redrob: true }]).length > 0
}

/**
 * Everyone who can be mentioned in this document: Redrob, the people the
 * file lists, the authors of its comments, and this computer's person.
 */
export function mentionPeople(
  listed: readonly { author: string }[],
  commentAuthors: readonly string[],
  me: string | null,
): MentionPerson[] {
  const names = new Set<string>()
  const out: MentionPerson[] = [{ name: REDROB_MENTION, redrob: true }]
  for (const n of [...listed.map((p) => p.author), ...commentAuthors, ...(me ? [me] : [])]) {
    const name = n.trim()
    if (!name || name === REDROB_MENTION || names.has(name)) continue
    names.add(name)
    out.push({ name })
  }
  return out
}

/** The distinct people who wrote comments, for word/people.xml (Redrob answers are not people). */
export function commentPeople(comments: readonly { author: string }[]): Array<{ author: string }> {
  const seen = new Set<string>()
  const out: Array<{ author: string }> = []
  for (const c of comments) {
    const a = c.author.trim()
    // Redrob's own answers ("AI Assistant" in files written before the rename) are not people
    if (!a || seen.has(a) || a === REDROB_AUTHOR || a === 'AI Assistant') continue
    seen.add(a)
    out.push({ author: a })
  }
  return out
}

/** The author name Redrob's own comment replies carry. */
export const REDROB_AUTHOR = 'Redrob'

/** The request the Redrob panel runs for a comment that mentions it. */
export function redrobCommentPrompt(commentId: string, text: string): string {
  const body = text.replace(/\s+/g, ' ').trim().slice(0, 600)
  return (
    `A comment in this document mentions @Redrob (comment id ${commentId}): "${body}". ` +
    `Answer it in its thread with reply_comment, parentId ${commentId}. ` +
    'Do not change the document and do not resolve the comment.'
  )
}
