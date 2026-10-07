import { useEffect, useState, type ReactElement } from 'react'
import { Button } from '@genoffice/ui'
import type { ProjectHomeApi, TimelineEntryItem } from '../../../shared/home-api'
import { useI18n } from '../locale'
import { timelineCountKey } from '../counts'

/** how many conversation turns a project's timeline shows */
export const TIMELINE_LIMIT = 30

export interface TimelineSectionProps {
  projectId: string
  /** bumps when Home refreshes its project data */
  tick: number
  api?: Pick<ProjectHomeApi, 'getTimeline'> | undefined
  openPath: (path: string) => void
}

/**
 * A project's timeline: the latest AI conversation turns across its files,
 * newest first (project-store's getProjectTimeline). Each turn opens its file.
 */
export function TimelineSection({ projectId, tick, api = window.aiOfficeProject, openPath }: TimelineSectionProps): ReactElement | null {
  const { t, dateLocale } = useI18n()
  const [entries, setEntries] = useState<TimelineEntryItem[] | null>(null)

  useEffect(() => {
    if (typeof api?.getTimeline !== 'function') {
      setEntries(null)
      return
    }
    let active = true
    void api.getTimeline(projectId, TIMELINE_LIMIT).then(
      (r) => {
        if (active) setEntries(Array.isArray(r) ? r : [])
      },
      () => {
        if (active) setEntries([])
      },
    )
    return () => {
      active = false
    }
  }, [api, projectId, tick])

  if (!entries) return null
  const when = (ts: string) =>
    Number.isNaN(Date.parse(ts)) ? ts : new Date(ts).toLocaleString(dateLocale, { dateStyle: 'medium', timeStyle: 'short' })

  return (
    <section className="timeline" aria-labelledby="timeline-title">
      <div className="section-head">
        <span id="timeline-title" className="section-label">
          {t('secActivity')}
        </span>
        <span className="file-count">{t(timelineCountKey(entries.length), { n: entries.length })}</span>
      </div>
      {entries.length === 0 ? (
        <p className="updates-sub">{t('timelineEmpty')}</p>
      ) : (
        <ul className="shared-list">
          {entries.map((e) => (
            <li key={`${e.chatId}:${e.seq}`} className="shared-row">
              <span className="timeline__who" aria-label={e.role === 'user' ? t('timelineUserAria') : undefined}>
                {e.role === 'user' ? t('timelineYou') : 'Redrob'}
              </span>
              <span className="activity__line">
                <b>{e.fileName}</b> {e.preview || t('noContent')}
              </span>
              <time className="updf__dir" dateTime={e.ts}>
                {when(e.ts)}
              </time>
              {e.filePath && (
                <Button size="sm" variant="ghost" aria-label={t('activityOpenLabel', { file: e.fileName })} onClick={() => openPath(e.filePath)}>
                  {t('activityOpen')}
                </Button>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
