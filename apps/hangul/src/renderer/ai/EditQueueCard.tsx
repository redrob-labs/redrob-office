// Queued selection edits above the composer (the shared .ai-queue styles in
// @genoffice/ui agent.css). Rows resolve their anchors on every render, so the
// excerpt follows the live document.
import { useState } from 'react'
import type { ReactElement } from 'react'
import type { Anchors } from '@genoffice/hwp-editor'
import { Button, Icon, IconButton } from '@genoffice/ui'
import { useI18n } from '../i18n/locale'
import { EDIT_INSTRUCTION_MAX, EDIT_QUEUE_MAX, resolveItem, truncate, type EditQueueItem } from './edit-queue'

interface Props {
  items: EditQueueItem[]
  anchors: Anchors
  busy: boolean
  onEditInstruction(qid: string, instruction: string): void
  onRemove(qid: string): void
  onDiscardAll(): void
  onSend(): void
  onFocus(qid: string): void
}

export function EditQueueCard({ items, anchors, busy, onEditInstruction, onRemove, onDiscardAll, onSend, onFocus }: Props): ReactElement | null {
  const { t } = useI18n()
  const [editing, setEditing] = useState<string | null>(null)
  const [draft, setDraft] = useState('')
  const [confirm, setConfirm] = useState(false)
  if (!items.length) return null
  const resolved = items.map((i) => resolveItem(anchors, i))
  const live = resolved.filter((r) => r.target).length
  return (
    <section className="ai-queue" aria-label={t('aiQueueTitle')}>
      <div className="ai-queue-head">
        <span className="ai-queue-title">{t('aiQueueTitle')}</span>
        <span className="ai-queue-count">
          {items.length}/{EDIT_QUEUE_MAX}
        </span>
      </div>
      <ol className="ai-queue-list">
        {resolved.map(({ item, target }, i) => (
          <li key={item.qid} className={`ai-queue-row${target ? '' : ' stale'}`} data-tip={target ? undefined : t('aiQueueOrphan')} onClick={() => target && editing !== item.qid && onFocus(item.qid)}>
            <span className="ai-queue-ord">{i + 1}</span>
            {editing === item.qid ? (
              <input
                className="ai-queue-edit-input"
                aria-label={t('aiQueueRowEdit')}
                value={draft}
                autoFocus
                maxLength={EDIT_INSTRUCTION_MAX}
                onChange={(e) => setDraft(e.target.value)}
                onBlur={() => {
                  const next = draft.trim()
                  if (next) onEditInstruction(item.qid, next)
                  setEditing(null)
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.nativeEvent.isComposing) {
                    e.preventDefault()
                    e.currentTarget.blur()
                  } else if (e.key === 'Escape') {
                    e.preventDefault()
                    setEditing(null)
                  }
                }}
              />
            ) : (
              <span className="ai-queue-text" title={item.instruction}>
                <span className="ai-queue-target">{truncate(target?.excerpt ?? item.capturedText, 24)}</span>
                {item.instruction}
              </span>
            )}
            <span className="ai-queue-row-actions" onClick={(e) => e.stopPropagation()}>
              <IconButton
                size="sm"
                label={t('aiQueueRowEdit')}
                disabled={busy}
                onClick={() => {
                  setDraft(item.instruction)
                  setEditing(item.qid)
                }}
              >
                <Icon name="edit" size={14} />
              </IconButton>
              <IconButton size="sm" label={t('aiQueueRowRemove')} disabled={busy} onClick={() => onRemove(item.qid)}>
                <Icon name="close" size={14} />
              </IconButton>
            </span>
          </li>
        ))}
      </ol>
      <div className="ai-queue-foot">
        {confirm ? (
          <>
            <span className="ai-queue-confirm">{t('aiQueueDiscardConfirm', { count: items.length })}</span>
            <Button size="sm" variant="ghost" onClick={() => setConfirm(false)}>
              {t('aiCancel')}
            </Button>
            <Button
              size="sm"
              onClick={() => {
                setConfirm(false)
                onDiscardAll()
              }}
            >
              {t('aiQueueDiscard')}
            </Button>
          </>
        ) : (
          <>
            <Button size="sm" variant="ghost" disabled={busy} onClick={() => setConfirm(true)}>
              {t('aiQueueDiscard')}
            </Button>
            <Button size="sm" disabled={busy || live === 0} onClick={onSend}>
              {t('aiQueueSend', { count: live })}
            </Button>
          </>
        )}
      </div>
    </section>
  )
}
