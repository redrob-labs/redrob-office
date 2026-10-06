/**
 * Pending selection-scoped requests, shown above the composer (markdown's card,
 * anchored by page and quote instead of a live decoration).
 */
import { useState } from 'react'
import type { ReactElement } from 'react'
import { Icon } from '@genoffice/ui'
import { useI18n } from '../i18n/locale'
import { EDIT_INSTRUCTION_MAX, EDIT_QUEUE_MAX, truncate, type PdfQueueItem } from './edit-queue'

interface Props {
  items: PdfQueueItem[]
  busy: boolean
  onEditInstruction: (qid: string, instruction: string) => void
  onRemove: (qid: string) => void
  onDiscardAll: () => void
  onSend: () => void
  /** scroll to the item's page */
  onFocus: (item: PdfQueueItem) => void
}

/** beyond this the list starts collapsed so it never swallows the transcript */
const AUTO_COLLAPSE_FROM = 4

export function EditQueueCard({ items, busy, onEditInstruction, onRemove, onDiscardAll, onSend, onFocus }: Props): ReactElement | null {
  const { t } = useI18n()
  const [manualFold, setManualFold] = useState<boolean | null>(null)
  const [editingQid, setEditingQid] = useState<string | null>(null)
  const [draft, setDraft] = useState('')
  const [confirmDiscard, setConfirmDiscard] = useState(false)

  if (items.length === 0) return null
  const folded = manualFold ?? items.length >= AUTO_COLLAPSE_FROM

  return (
    <div className="ai-queue">
      <div className="ai-queue-head">
        <span className="ai-queue-title">{t('aiQueueTitle')}</span>
        <span className="ai-queue-count">
          {items.length}/{EDIT_QUEUE_MAX}
        </span>
        <button
          type="button"
          className={`ai-queue-fold${folded ? ' folded' : ''}`}
          onClick={() => setManualFold(!folded)}
          aria-expanded={!folded}
          aria-label={t('aiQueueTitle')}
        >
          <Icon name="chevronDown" size={14} />
        </button>
      </div>
      {!folded && (
        <>
          <div className="ai-queue-hint">{t('aiQueueHint')}</div>
          <ol className="ai-queue-list">
            {items.map((item, i) => (
              <li key={item.qid} className="ai-queue-row" onClick={() => editingQid !== item.qid && onFocus(item)}>
                <span className="ai-queue-ord">{i + 1}</span>
                {editingQid === item.qid ? (
                  <input
                    className="ai-queue-edit-input"
                    value={draft}
                    autoFocus
                    maxLength={EDIT_INSTRUCTION_MAX}
                    aria-label={t('aiQueueRowEdit')}
                    onChange={(e) => setDraft(e.target.value)}
                    onBlur={() => {
                      const next = draft.trim()
                      if (next) onEditInstruction(item.qid, next)
                      setEditingQid(null)
                    }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && !e.nativeEvent.isComposing) {
                        e.preventDefault()
                        e.currentTarget.blur()
                      } else if (e.key === 'Escape') {
                        e.preventDefault()
                        setEditingQid(null)
                      }
                    }}
                  />
                ) : (
                  <span className="ai-queue-text" title={item.instruction}>
                    <span className="ai-queue-target">
                      {t('aiQueuePage', { page: item.page })} {truncate(item.excerpt, 24)}
                    </span>
                    {item.instruction}
                  </span>
                )}
                <span className="ai-queue-row-actions" onClick={(e) => e.stopPropagation()}>
                  <button
                    type="button"
                    className="rr-iconbtn rr-iconbtn--ghost rr-iconbtn--sm ai-queue-row-btn"
                    data-tip={t('aiQueueRowEdit')}
                    aria-label={t('aiQueueRowEdit')}
                    disabled={busy}
                    onClick={() => {
                      setDraft(item.instruction)
                      setEditingQid(item.qid)
                    }}
                  >
                    <Icon name="edit" size={14} />
                  </button>
                  <button
                    type="button"
                    className="rr-iconbtn rr-iconbtn--ghost rr-iconbtn--sm ai-queue-row-btn"
                    data-tip={t('aiQueueRowRemove')}
                    aria-label={t('aiQueueRowRemove')}
                    disabled={busy}
                    onClick={() => onRemove(item.qid)}
                  >
                    <Icon name="close" size={14} />
                  </button>
                </span>
              </li>
            ))}
          </ol>
        </>
      )}
      <div className="ai-queue-foot">
        {confirmDiscard ? (
          <>
            <span className="ai-queue-confirm">{t('aiQueueDiscardConfirm', { count: items.length })}</span>
            <button type="button" className="rr-btn rr-btn--ghost rr-btn--sm ai-queue-discard" onClick={() => setConfirmDiscard(false)}>
              {t('aiCancel')}
            </button>
            <button
              type="button"
              className="rr-btn rr-btn--primary rr-btn--sm ai-queue-send"
              onClick={() => {
                setConfirmDiscard(false)
                onDiscardAll()
              }}
            >
              {t('aiQueueDiscard')}
            </button>
          </>
        ) : (
          <>
            <button type="button" className="rr-btn rr-btn--ghost rr-btn--sm ai-queue-discard" disabled={busy} onClick={() => setConfirmDiscard(true)}>
              {t('aiQueueDiscard')}
            </button>
            <button type="button" className="rr-btn rr-btn--primary rr-btn--sm ai-queue-send" disabled={busy} onClick={onSend}>
              {t('aiQueueSend', { count: items.length })}
            </button>
          </>
        )}
      </div>
    </div>
  )
}
