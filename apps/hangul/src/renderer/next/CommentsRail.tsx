// The comments rail (spec task 4.2, R7.2): threads beside the page, a composer
// for the selection, replies, resolve and reopen, delete, and @mentions. Each
// comment is a 한글 memo (engine E4); threads, resolved state and mentions are
// Redrob's (packages/hwp-editor/src/comments.ts).
//
// "@Redrob" in a comment asks Redrob to answer in the thread (onAskRedrob).
import { useMemo, useState } from 'react'
import type { ReactElement } from 'react'
import { REDROB_MENTION, collapsed, mentionsIn, type CommentThread, type Comments, type EditorView } from '@genoffice/hwp-editor'
import { Badge, Button, Icon, IconButton, Switch, Textarea } from '@genoffice/ui'
import { useI18n } from '../i18n/locale'

export interface CommentsRailProps {
  view: EditorView
  comments: Comments
  me: string
  /** Bumped by the editor on every change, so the rail re-reads the threads. */
  revision: number
  composing: boolean
  onComposingChange(composing: boolean): void
  onChanged(): void
  onAskRedrob(threadId: number, text: string): void
  onClose(): void
}

function when(iso?: string): string {
  if (!iso) return ''
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleString(undefined, { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })
}

export function CommentsRail({ view, comments, me, revision, composing, onComposingChange, onChanged, onAskRedrob, onClose }: CommentsRailProps): ReactElement {
  const { t } = useI18n()
  const [showResolved, setShowResolved] = useState(false)
  const [draft, setDraft] = useState('')
  const [replies, setReplies] = useState<Record<number, string>>({})
  /** threads whose reply box is open */
  const [replying, setReplying] = useState<Set<number>>(new Set())
  const openReply = (id: number, open: boolean) =>
    setReplying((cur) => {
      const next = new Set(cur)
      if (open) next.add(id)
      else next.delete(id)
      return next
    })
  const [active, setActive] = useState<number | null>(null)
  const [error, setError] = useState<string | null>(null)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const threads = useMemo(() => comments.threads(), [comments, revision])
  const people = useMemo(() => comments.people(me), [comments, me, revision])
  const shown = threads.filter((th) => showResolved || !th.resolved)
  const canComment = !collapsed(view.session.selection)

  const act = (fn: () => void) => {
    try {
      setError(null)
      fn()
      onChanged()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    }
  }

  const jump = (th: CommentThread) => {
    setActive(th.id)
    view.session.select(comments.range(th))
    view.render()
    view.focus()
  }

  const submitNew = () => {
    const text = draft.trim()
    if (!text) return
    act(() => {
      const id = comments.add(view.session.selection, me, text, people)
      setDraft('')
      onComposingChange(false)
      setActive(id)
      if (mentionsIn(text, [REDROB_MENTION]).length) onAskRedrob(id, text)
    })
  }

  const submitReply = (th: CommentThread) => {
    const text = (replies[th.id] ?? '').trim()
    if (!text) return
    act(() => {
      comments.reply(th.id, me, text, people)
      setReplies((r) => ({ ...r, [th.id]: '' }))
      openReply(th.id, false)
      if (mentionsIn(text, [REDROB_MENTION]).length) onAskRedrob(th.id, text)
    })
  }

  return (
    <aside className="hangul-comments" aria-label={t('commentsTitle')}>
      <header className="hangul-comments__head">
        <h2 className="hangul-comments__title">
          {t('commentsTitle')} <Badge size="sm">{threads.filter((x) => !x.resolved).length}</Badge>
        </h2>
        <IconButton size="sm" label={t('commentsClose')} onClick={onClose}>
          <Icon name="close" size={16} />
        </IconButton>
        <Switch size="sm" checked={showResolved} onChange={(e) => setShowResolved(e.currentTarget.checked)} label={t('commentsShowResolved')} />
      </header>

      {composing ? (
        <div className="hangul-comments__composer">
          <Textarea label={t('commentsNewLabel')} hint={t('commentsMentionTip')} rows={3} value={draft} autoFocus onChange={(e) => setDraft(e.currentTarget.value)} />
          <div className="hangul-comments__actions">
            <Button size="sm" variant="ghost" onClick={() => (setDraft(''), onComposingChange(false))}>
              {t('aiCancel')}
            </Button>
            <Button size="sm" disabled={!draft.trim()} onClick={submitNew}>
              {t('commentsPost')}
            </Button>
          </div>
        </div>
      ) : (
        <Button size="sm" variant="secondary" disabled={!canComment} onClick={() => onComposingChange(true)}>
          <Icon name="comment" size={14} /> {t('commentsNew')}
        </Button>
      )}

      {error && (
        <p className="hangul-comments__error" role="alert">
          {error}
        </p>
      )}

      {shown.length === 0 ? (
        <p className="hangul-comments__empty">{t('commentsEmpty')}</p>
      ) : (
        <ol className="hangul-comments__list">
          {shown.map((th) => (
            <li key={th.id} className={`hangul-comment${th.id === active ? ' is-active' : ''}${th.resolved ? ' is-resolved' : ''}`}>
              <button type="button" className="hangul-comment__quote" onClick={() => jump(th)} title={t('commentsJump')}>
                {th.anchor.text}
              </button>
              {[th.root, ...th.replies].map((c, i) => (
                <div key={c.number} className={`hangul-comment__entry${i ? ' is-reply' : ''}`}>
                  <div className="hangul-comment__meta">
                    <span className="hangul-comment__author">{c.author || t('commentsUnknownAuthor')}</span>
                    <span className="hangul-comment__time">{when(c.at)}</span>
                    <IconButton size="sm" label={i ? t('commentsDeleteReply') : t('commentsDeleteThread')} onClick={() => act(() => comments.remove(c.number))}>
                      <Icon name="trash" size={14} />
                    </IconButton>
                  </div>
                  <p className="hangul-comment__text">{c.text}</p>
                </div>
              ))}
              {replying.has(th.id) ? (
                <div className="hangul-comment__reply">
                  <Textarea
                    label={t('commentsReplyLabel')}
                    rows={2}
                    autoFocus
                    value={replies[th.id] ?? ''}
                    onChange={(e) => {
                      const v = e.currentTarget.value
                      setReplies((r) => ({ ...r, [th.id]: v }))
                    }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
                        e.preventDefault()
                        submitReply(th)
                      } else if (e.key === 'Escape') openReply(th.id, false)
                    }}
                  />
                  <div className="hangul-comments__actions">
                    <Button size="sm" variant="ghost" onClick={() => openReply(th.id, false)}>
                      {t('aiCancel')}
                    </Button>
                    <Button size="sm" disabled={!(replies[th.id] ?? '').trim()} onClick={() => submitReply(th)}>
                      {t('commentsReply')}
                    </Button>
                  </div>
                </div>
              ) : (
                <div className="hangul-comments__actions">
                  <Button size="sm" variant="ghost" onClick={() => act(() => comments.resolve(th.id, !th.resolved))}>
                    <Icon name={th.resolved ? 'reply' : 'circleCheck'} size={14} /> {th.resolved ? t('commentsReopen') : t('commentsResolve')}
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => openReply(th.id, true)}>
                    <Icon name="reply" size={14} /> {t('commentsReply')}
                  </Button>
                </div>
              )}
            </li>
          ))}
        </ol>
      )}
    </aside>
  )
}
