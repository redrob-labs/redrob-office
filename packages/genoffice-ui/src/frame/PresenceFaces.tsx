import { useEffect, useRef, useState, type ReactElement } from 'react'

export interface PresencePerson {
  /** stable per person (the account id); picks the colour */
  key: string
  name: string
  /** where they are, e.g. near "Payment terms" */
  where?: string | undefined
}

export interface PresenceFacesStrings {
  /** group label, e.g. "People in this file" */
  label: string
  /** one face's accessible name; {name} and {where} */
  person: string
  /** one face's accessible name without a place; {name} */
  personHere: string
  /** the overflow chip; {n} */
  more: string
  /** said to a screen reader when someone opens the file; {name} */
  joined?: string | undefined
  /** said when they leave; {name} */
  left?: string | undefined
}

/** One or two letters for a face. */
export function initialsOf(name: string): string {
  const parts = name.trim().split(/[\s._@-]+/).filter(Boolean)
  if (parts.length === 0) return '?'
  const first = [...parts[0]!][0] ?? '?'
  const second = parts.length > 1 ? ([...parts[parts.length - 1]!][0] ?? '') : ''
  return (first + second).toUpperCase()
}

/** A seat 1..6 from the key, so a person keeps their colour across views. */
export function seatOf(key: string): number {
  let h = 0
  for (let i = 0; i < key.length; i++) h = (h * 31 + key.charCodeAt(i)) >>> 0
  return (h % 6) + 1
}

const fill = (s: string, v: Record<string, string>) => Object.entries(v).reduce((o, [k, x]) => o.split(`{${k}}`).join(x), s)

/**
 * The faces of the other people in a shared file, for EditorFrame's faces
 * slot. Each face names the person and where they are; past `max` the rest
 * collapse into a "+n" chip that lists them.
 */
export function PresenceFaces({
  people,
  strings,
  max = 4,
}: {
  people: readonly PresencePerson[]
  strings: PresenceFacesStrings
  max?: number
}): ReactElement {
  // who came and went, said once to a screen reader (the live region is
  // always rendered, so it is in place before the first person arrives)
  const before = useRef<Map<string, string> | null>(null)
  const [said, setSaid] = useState('')
  const keys = people.map((p) => `${p.key}\u0000${p.name}`).join('\u0001')
  useEffect(() => {
    const now = new Map(people.map((p) => [p.key, p.name]))
    const was = before.current
    before.current = now
    if (!was || (!strings.joined && !strings.left)) return
    const lines: string[] = []
    for (const [k, name] of now) if (!was.has(k) && strings.joined) lines.push(fill(strings.joined, { name }))
    for (const [k, name] of was) if (!now.has(k) && strings.left) lines.push(fill(strings.left, { name }))
    if (lines.length) setSaid(lines.join('. '))
    // keyed on who is here, not on where they are
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [keys])

  const shown = people.length > max ? people.slice(0, max - 1) : people
  const rest = people.slice(shown.length)
  const nameOf = (p: PresencePerson) =>
    p.where ? fill(strings.person, { name: p.name, where: p.where }) : fill(strings.personHere, { name: p.name })
  return (
    <div className="go-faces-wrap">
      <span className="go-face__sr" role="status" aria-live="polite">
        {said}
      </span>
      {people.length > 0 && (
        <ul className="go-faces" aria-label={strings.label}>
          {shown.map((p) => (
            <li key={p.key} className={`go-face go-face--${seatOf(p.key)}`} title={nameOf(p)}>
              <span aria-hidden="true">{initialsOf(p.name)}</span>
              <span className="go-face__sr">{nameOf(p)}</span>
            </li>
          ))}
          {rest.length > 0 && (
            <li className="go-face go-face--more" title={rest.map(nameOf).join('\n')}>
              <span aria-hidden="true">{fill(strings.more, { n: String(rest.length) })}</span>
              <span className="go-face__sr">{rest.map(nameOf).join(', ')}</span>
            </li>
          )}
        </ul>
      )}
    </div>
  )
}
