import type { ReactElement } from 'react'
import { Button, IconButton } from '../kit'
import { Icon } from '../Icon'
import type { CatchUpItem } from '@genoffice/versions'
import { verT } from './strings'

const short = (s: string) => {
  const one = s.replace(/\s+/g, ' ').trim()
  return one.length > 90 ? `${one.slice(0, 89)}…` : one
}

export function catchUpLine(item: CatchUpItem): string {
  switch (item.kind) {
    case 'comment':
      return verT(item.reply ? 'catchReply' : 'catchComment', { name: item.author || '?', text: short(item.text) })
    case 'suggestion':
      return item.count === 1
        ? verT('catchSuggestionOne', { name: item.author || '?' })
        : verT('catchSuggestion', { name: item.author || '?', n: item.count })
    case 'figures':
      return item.count === 1 ? verT('catchFiguresOne') : verT('catchFigures', { n: item.count })
  }
}

export interface CatchUpProps {
  since: string
  items: readonly CatchUpItem[]
  onShow: (item: CatchUpItem) => void
  onDismiss: () => void
}

/** What changed since the last visit, at the top of the Redrob panel; each line has "Show me". */
export function CatchUp({ since, items, onShow, onDismiss }: CatchUpProps): ReactElement {
  const d = new Date(since)
  const at = Number.isNaN(d.getTime()) ? since : d.toLocaleString(undefined, { weekday: 'short', hour: '2-digit', minute: '2-digit' })
  return (
    <section className="doc-catch" aria-labelledby="doc-catch-title">
      <div className="doc-catch__h">
        <h2 id="doc-catch-title">{verT('catchTitle', { when: at })}</h2>
        <IconButton size="sm" variant="ghost" label={verT('catchDismiss')} onClick={onDismiss}>
          <Icon name="close" size={14} />
        </IconButton>
      </div>
      <ul>
        {items.map((item, i) => (
          <li key={i}>
            <span>{catchUpLine(item)}</span>
            <Button size="sm" variant="ghost" onClick={() => onShow(item)}>
              {verT('catchShow')}
            </Button>
          </li>
        ))}
      </ul>
    </section>
  )
}
