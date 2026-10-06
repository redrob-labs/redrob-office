import { useCallback, useEffect, useState, type ReactElement } from 'react'
import { Button } from '@genoffice/ui'
import type { Role, ShareApi, SharedActivity } from '@genoffice/sync-client'
import { useI18n, type TFunc } from '../locale'

/** how often Updates asks the shell for new activity while it is on screen */
export const ACTIVITY_POLL_MS = 60_000

function roleWord(r: Role | undefined, t: TFunc): string {
  return r === 'edit' ? t('activityRoleEdit') : r === 'comment' ? t('activityRoleComment') : t('activityRoleView')
}

/** One event as a sentence, from the reader's side: "you" when it is about them. */
export function activityLine(e: SharedActivity, t: TFunc): string {
  const base = { name: e.by, file: e.fileName, who: e.detail.name ?? '' }
  switch (e.kind) {
    case 'version':
      return t('activityVersion', { ...base, v: e.detail.version ?? '' })
    case 'shared':
      return e.you ? t('activitySharedYou', base) : t('activityShared', base)
    case 'role':
      return t(e.you ? 'activityRoleYou' : 'activityRole', { ...base, role: roleWord(e.detail.role, t) })
    case 'removed':
      return e.you ? t('activityRemovedYou', base) : t('activityRemoved', base)
    case 'left':
      return t('activityLeft', base)
    case 'joined':
      return t('activityJoined', base)
    case 'renamed':
      return t('activityRenamed', { ...base, from: e.detail.from ?? '' })
    case 'transferred':
      return e.you ? t('activityTransferredYou', base) : t('activityTransferred', base)
    case 'comment':
      return t(e.detail.reply ? 'activityReply' : 'activityComment', base)
    case 'unshared':
      return t('activityUnshared', base)
  }
}

/** whether the file can still be opened from this event: a local copy, or a shared file this person still has */
function openable(e: SharedActivity): boolean {
  if (e.localPath) return true
  return e.kind !== 'unshared' && !(e.kind === 'removed' && e.you)
}

export interface ActivitySectionProps {
  api?: Partial<Pick<ShareApi, 'shareActivity' | 'openShared'>> | undefined
  openPath: (path: string) => void
}

/**
 * Shared files in Updates: what other people did lately to files shared with
 * this person, newest first. Asked for on show and every minute while shown.
 * Nothing shows when sharing is not set up here (no service, signed out).
 */
export function ActivitySection({ api = window.aiOfficeShare, openPath }: ActivitySectionProps): ReactElement | null {
  const { t, dateLocale } = useI18n()
  const [events, setEvents] = useState<SharedActivity[]>([])
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(() => {
    if (typeof api?.shareActivity !== 'function') return
    void api.shareActivity().then(
      (r) => {
        if (Array.isArray(r)) {
          setEvents(r)
          setError(null)
        } else setEvents([])
      },
      () => setEvents([]),
    )
  }, [api])

  useEffect(() => {
    load()
    const timer = window.setInterval(load, ACTIVITY_POLL_MS)
    window.addEventListener('focus', load)
    return () => {
      window.clearInterval(timer)
      window.removeEventListener('focus', load)
    }
  }, [load])

  if (events.length === 0) return null

  const open = async (e: SharedActivity) => {
    if (e.localPath) return openPath(e.localPath)
    if (typeof api?.openShared !== 'function') return
    const r = await api.openShared(e.fileId)
    if (!r.ok) setError(r.error)
  }
  const when = (at: string) =>
    Number.isNaN(Date.parse(at)) ? at : new Date(at).toLocaleString(dateLocale, { dateStyle: 'medium', timeStyle: 'short' })

  return (
    <section className="activity" aria-labelledby="activity-title">
      <h2 id="activity-title" className="activity__title">
        {t('activityTitle')}
      </h2>
      <p className="updates-sub">{t('activitySub')}</p>
      {error && (
        <p className="activity__error" role="alert">
          {error}
        </p>
      )}
      <ul className="shared-list">
        {events.map((e) => (
          <li key={e.id} className="shared-row">
            <span className="activity__line">{activityLine(e, t)}</span>
            <time className="updf__dir" dateTime={e.at}>
              {when(e.at)}
            </time>
            {openable(e) && (
              <Button size="sm" variant="ghost" aria-label={t('activityOpenLabel', { file: e.fileName })} onClick={() => void open(e)}>
                {t('activityOpen')}
              </Button>
            )}
          </li>
        ))}
      </ul>
    </section>
  )
}
