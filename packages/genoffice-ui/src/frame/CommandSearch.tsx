import {
  forwardRef,
  useId,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
  type ReactElement,
} from 'react'
import { icons } from '@redrob-labs/ui'

export interface FrameTool {
  id: string
  /** the tool's name as the toolbar shows it */
  label: string
  /** other words people search for it by */
  keywords?: readonly string[] | undefined
  /** where it lives, e.g. Home or Insert */
  group?: string | undefined
  run: () => void
  disabled?: boolean | undefined
}

export interface CommandSearchStrings {
  /** the field's placeholder and accessible name, e.g. "Search tools, or ask Redrob" */
  placeholder: string
  /** the shortcut hint shown in the field, e.g. "Alt Q" */
  shortcut: string
  /** the last option: `Ask Redrob: "{q}"` */
  ask: (query: string) => string
  /** names the list of results */
  results: string
}

export interface CommandSearchProps {
  tools: readonly FrameTool[]
  strings: CommandSearchStrings
  /** hand the query to Redrob; omitted when there is no panel */
  onAsk?: ((query: string) => void) | undefined
  /** at most this many tools are listed */
  limit?: number | undefined
  className?: string | undefined
}

export interface CommandSearchHandle {
  focus: () => void
}

const norm = (s: string) => s.toLowerCase().normalize('NFKC').trim()

/**
 * Tools whose name, keywords or group contain every word of the query, the
 * ones whose name starts with it first. Disabled tools are left out.
 */
export function filterTools(tools: readonly FrameTool[], query: string, limit = 8): FrameTool[] {
  const words = norm(query).split(/\s+/).filter(Boolean)
  if (words.length === 0) return []
  const scored: Array<{ tool: FrameTool; score: number; index: number }> = []
  tools.forEach((tool, index) => {
    if (tool.disabled) return
    const name = norm(tool.label)
    const hay = [name, ...(tool.keywords ?? []).map(norm), norm(tool.group ?? '')].join(' ')
    if (!words.every((w) => hay.includes(w))) return
    const score = name.startsWith(words.join(' ')) ? 0 : name.includes(words[0]!) ? 1 : 2
    scored.push({ tool, score, index })
  })
  scored.sort((a, b) => a.score - b.score || a.index - b.index)
  return scored.slice(0, limit).map((s) => s.tool)
}

/**
 * Title bar search (Alt+Q): runs any tool by name, or asks Redrob. A combobox
 * with a listbox popup; arrow keys move, Enter runs, Escape clears.
 */
export const CommandSearch = forwardRef<CommandSearchHandle, CommandSearchProps>(
  function CommandSearch({ tools, strings, onAsk, limit = 8, className }, ref): ReactElement {
    const listId = useId()
    const input = useRef<HTMLInputElement>(null)
    const [query, setQuery] = useState('')
    const [active, setActive] = useState(0)
    const [open, setOpen] = useState(false)
    useImperativeHandle(ref, () => ({ focus: () => input.current?.focus() }), [])

    const matches = useMemo(() => filterTools(tools, query, limit), [tools, query, limit])
    const trimmed = query.trim()
    const options: Array<{ id: string; label: string; run: () => void }> = [
      ...matches.map((t) => ({ id: t.id, label: t.label, run: t.run })),
      ...(trimmed && onAsk ? [{ id: '__ask', label: strings.ask(trimmed), run: () => onAsk(trimmed) }] : []),
    ]
    const shown = open && options.length > 0

    const close = () => {
      setOpen(false)
      setActive(0)
    }
    const runAt = (i: number) => {
      const option = options[i]
      if (!option) return
      setQuery('')
      close()
      input.current?.blur()
      option.run()
    }
    const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
      if (e.nativeEvent.isComposing) return
      if (e.key === 'ArrowDown') {
        e.preventDefault()
        setOpen(true)
        setActive((a) => (options.length ? (a + 1) % options.length : 0))
      } else if (e.key === 'ArrowUp') {
        e.preventDefault()
        setActive((a) => (options.length ? (a - 1 + options.length) % options.length : 0))
      } else if (e.key === 'Enter') {
        e.preventDefault()
        runAt(active)
      } else if (e.key === 'Escape') {
        if (query) setQuery('')
        else input.current?.blur()
        close()
      }
    }

    const Search = icons.search
    return (
      <div className={`go-cmdsearch${className ? ` ${className}` : ''}`}>
        <span className="go-cmdsearch__icon" aria-hidden="true">
          <Search width={15} height={15} />
        </span>
        <input
          ref={input}
          type="text"
          role="combobox"
          aria-label={strings.placeholder}
          aria-expanded={shown}
          aria-controls={listId}
          aria-autocomplete="list"
          aria-activedescendant={shown ? `${listId}-${active}` : undefined}
          placeholder={strings.placeholder}
          value={query}
          onChange={(e) => {
            setQuery(e.target.value)
            setActive(0)
            setOpen(true)
          }}
          onFocus={() => setOpen(true)}
          onBlur={() => close()}
          onKeyDown={onKeyDown}
        />
        <kbd className="go-cmdsearch__kbd" aria-hidden="true">
          {strings.shortcut}
        </kbd>
        <ul
          id={listId}
          role="listbox"
          aria-label={strings.results}
          className="go-cmdsearch__list"
          hidden={!shown}
        >
          {options.map((o, i) => (
            <li
              key={o.id}
              id={`${listId}-${i}`}
              role="option"
              aria-selected={i === active}
              className={`go-cmdsearch__opt${o.id === '__ask' ? ' go-cmdsearch__opt--ask' : ''}`}
              // mousedown, not click: the input's blur would close the list first
              onMouseDown={(e) => {
                e.preventDefault()
                runAt(i)
              }}
              onMouseEnter={() => setActive(i)}
            >
              {o.label}
            </li>
          ))}
        </ul>
      </div>
    )
  },
)
