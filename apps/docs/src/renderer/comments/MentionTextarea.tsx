import { useId, useMemo, useRef, useState, type KeyboardEvent, type ReactElement, type Ref } from 'react'
import { applyMention, filterPeople, mentionQuery, type MentionPerson, type MentionQuery } from './mentions'

export interface MentionTextareaProps {
  value: string
  onChange: (value: string) => void
  people: readonly MentionPerson[]
  /** Ctrl/Cmd+Enter */
  onSubmit: () => void
  onEscape?: () => void
  placeholder?: string
  className?: string
  autoFocus?: boolean
  textareaRef?: Ref<HTMLTextAreaElement>
  /** accessible name of the people list */
  listLabel: string
  /** what Redrob does when picked, shown beside its name */
  redrobHint: string
}

/**
 * A comment textarea with an @mention list: an ARIA combobox whose listbox
 * filters people as the person types after "@". Arrow keys move, Enter or Tab
 * picks, Escape closes the list (a second Escape reaches the caller).
 */
export function MentionTextarea(props: MentionTextareaProps): ReactElement {
  const { value, onChange, people, onSubmit, onEscape, placeholder, className, autoFocus, textareaRef, listLabel, redrobHint } = props
  const listId = useId()
  const [caret, setCaret] = useState(0)
  const [active, setActive] = useState(0)
  const [closedAt, setClosedAt] = useState<number | null>(null)
  const own = useRef<HTMLTextAreaElement | null>(null)

  const q: MentionQuery | null = useMemo(() => {
    const m = mentionQuery(value, caret)
    return m && m.start !== closedAt ? m : null
  }, [value, caret, closedAt])
  const options = useMemo(() => (q ? filterPeople(people, q.query) : []), [q, people])
  const open = options.length > 0
  const current = Math.min(active, Math.max(0, options.length - 1))

  const pick = (p: MentionPerson) => {
    if (!q) return
    const next = applyMention(value, q, caret, p.name)
    onChange(next.text)
    setActive(0)
    requestAnimationFrame(() => {
      const el = own.current
      if (!el) return
      el.focus()
      el.setSelectionRange(next.caret, next.caret)
      setCaret(next.caret)
    })
  }

  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (open) {
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault()
        const d = e.key === 'ArrowDown' ? 1 : -1
        setActive((current + d + options.length) % options.length)
        return
      }
      if ((e.key === 'Enter' && !e.metaKey && !e.ctrlKey) || e.key === 'Tab') {
        e.preventDefault()
        pick(options[current]!)
        return
      }
      if (e.key === 'Escape') {
        e.preventDefault()
        e.stopPropagation()
        setClosedAt(q?.start ?? null)
        return
      }
    }
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
      e.preventDefault()
      onSubmit()
    } else if (e.key === 'Escape' && onEscape) {
      onEscape()
    }
  }

  const setRefs = (el: HTMLTextAreaElement | null) => {
    own.current = el
    if (typeof textareaRef === 'function') textareaRef(el)
    else if (textareaRef && typeof textareaRef === 'object') (textareaRef as { current: HTMLTextAreaElement | null }).current = el
  }

  return (
    <div className="comment-mention">
      <textarea
        ref={setRefs}
        className={className}
        value={value}
        placeholder={placeholder}
        autoFocus={autoFocus}
        role="combobox"
        aria-autocomplete="list"
        aria-expanded={open}
        aria-controls={listId}
        {...(open ? { 'aria-activedescendant': `${listId}-${current}` } : {})}
        onChange={(e) => {
          onChange(e.target.value)
          setCaret(e.target.selectionStart ?? e.target.value.length)
          setClosedAt(null)
        }}
        onSelect={(e) => setCaret(e.currentTarget.selectionStart ?? 0)}
        onKeyDown={onKeyDown}
      />
      <ul id={listId} role="listbox" aria-label={listLabel} className="comment-mention-list" hidden={!open}>
        {options.map((p, i) => (
          <li
            key={p.name}
            id={`${listId}-${i}`}
            role="option"
            aria-selected={i === current}
            className={`comment-mention-option${i === current ? ' is-active' : ''}${p.redrob ? ' is-redrob' : ''}`}
            onMouseDown={(e) => {
              e.preventDefault()
              pick(p)
            }}
          >
            <span className="comment-mention-name">@{p.name}</span>
            {p.redrob && <span className="comment-mention-hint">{redrobHint}</span>}
          </li>
        ))}
      </ul>
    </div>
  )
}
