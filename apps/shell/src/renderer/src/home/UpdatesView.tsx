import type { ReactElement } from 'react'
import { EmptyState, Icon } from '@genoffice/ui'
import { useI18n } from '../locale'

/**
 * Updates: one changed figure, every file that uses it, each kept by a person.
 * Until the linked-figure store is wired in, this is its empty state, which is
 * also what a person with nothing waiting sees.
 */
export function UpdatesView(): ReactElement {
  const { t } = useI18n()
  return (
    <main className="content updates" aria-labelledby="updates-title">
      <header className="updates-head">
        <h1 id="updates-title" className="updates-title">
          {t('navUpdates')}
        </h1>
        <p className="updates-sub">{t('updatesSub')}</p>
      </header>
      <EmptyState
        className="updates-empty"
        icon={<Icon name="refresh" size={20} />}
        title={t('updatesEmptyTitle')}
        description={t('updatesEmptyBody')}
      />
    </main>
  )
}
