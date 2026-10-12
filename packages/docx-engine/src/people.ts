/**
 * word/people.xml: the people who wrote comments and tracked changes, as Word
 * records them (w15:person with an optional w15:presenceInfo). Reading keeps
 * each person's identity; writing adds people the document does not list yet
 * and leaves every existing entry byte-identical.
 */
import type { PersonInfo } from './types'
import { escapeXmlAttr } from './xml-utils'

export type { PersonInfo }

export const PEOPLE_PART = 'word/people.xml'
export const PEOPLE_REL_TYPE = 'http://schemas.microsoft.com/office/2011/relationships/people'
export const PEOPLE_CONTENT_TYPE = 'application/vnd.openxmlformats-officedocument.wordprocessingml.people+xml'

const decode = (s: string) =>
  s
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')

/** The people a people.xml lists, in file order; malformed entries are skipped. */
export function parsePeopleXml(xml: string): PersonInfo[] {
  const out: PersonInfo[] = []
  for (const m of xml.match(/<w15:person\b[^>]*?(?:\/>|>[\s\S]*?<\/w15:person>)/g) ?? []) {
    const author = /w15:author="([^"]*)"/.exec(m)?.[1]
    if (author === undefined || author === '') continue
    const presence = /<w15:presenceInfo\b[^>]*\/?>/.exec(m)?.[0]
    const providerId = presence ? /w15:providerId="([^"]*)"/.exec(presence)?.[1] : undefined
    const userId = presence ? /w15:userId="([^"]*)"/.exec(presence)?.[1] : undefined
    out.push({
      author: decode(author),
      ...(providerId ? { providerId: decode(providerId) } : {}),
      ...(userId ? { userId: decode(userId) } : {}),
    })
  }
  return out
}

function personXml(p: PersonInfo): string {
  const presence =
    p.providerId && p.userId
      ? `<w15:presenceInfo w15:providerId="${escapeXmlAttr(p.providerId)}" w15:userId="${escapeXmlAttr(p.userId)}"/>`
      : ''
  return presence
    ? `<w15:person w15:author="${escapeXmlAttr(p.author)}">${presence}</w15:person>`
    : `<w15:person w15:author="${escapeXmlAttr(p.author)}"/>`
}

/**
 * people.xml with `people` added. Existing entries are kept exactly as they
 * were; a person already listed by author name is not added twice. Returns
 * null when nothing would change, so an unchanged file stays byte-identical.
 */
export function buildPeopleXml(people: readonly PersonInfo[], originalXml: string | null): string | null {
  const existing = new Set((originalXml ? parsePeopleXml(originalXml) : []).map((p) => p.author))
  const fresh: PersonInfo[] = []
  for (const p of people) {
    if (!p.author || existing.has(p.author)) continue
    existing.add(p.author)
    fresh.push(p)
  }
  if (fresh.length === 0) return null
  const added = fresh.map(personXml).join('')
  if (originalXml && /<\/w15:people>/.test(originalXml)) return originalXml.replace(/<\/w15:people>/, `${added}</w15:people>`)
  if (originalXml && /<w15:people\b[^>]*\/>/.test(originalXml)) {
    return originalXml.replace(/<w15:people\b([^>]*)\/>/, `<w15:people$1>${added}</w15:people>`)
  }
  return (
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n' +
    '<w15:people xmlns:mc="http://schemas.openxmlformats.org/markup-compatibility/2006"' +
    ' xmlns:w15="http://schemas.microsoft.com/office/word/2012/wordml" mc:Ignorable="w15">' +
    `${added}</w15:people>`
  )
}
