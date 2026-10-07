import { Button, Icon, IconButton } from '@genoffice/ui'
import { useI18n } from './locale'
import './star-prompt.css'

/**
 * One-time "star us on GitHub" invitation, shown over the home screen after
 * the main process decides the user has gotten real value out of the app
 * (see main/star-prompt.ts). Non-modal: a small bottom-right card that never
 * blocks work. Any reaction resolves it via starPromptAction.
 */

/** with at least this many opens, the title reflects the user's own usage
 * ("you've opened N documents") — the strongest-converting copy per industry
 * data; below it (e.g. upgrade-launch prompts) fall back to the generic title */
const PERSONALIZED_MIN_OPENS = 5

interface StarPromptCardProps {
  /** lifetime documents opened, from the main process's prompt state */
  docOpens: number
  /** called after the user reacts, whatever the reaction — unmounts the card */
  onClose: () => void
}

export function StarPromptCard({ docOpens, onClose }: StarPromptCardProps) {
  const { t } = useI18n()

  const react = (action: 'starred' | 'later') => {
    void window.aiOffice.starPromptAction(action).catch(() => {})
    onClose()
  }

  const title =
    docOpens >= PERSONALIZED_MIN_OPENS
      ? t('starPromptTitleN', { n: docOpens })
      : t('starPromptTitle')

  return (
    <div className="star-prompt" role="dialog" aria-label={title}>
      <IconButton
        className="star-prompt-close"
        size="sm"
        label={t('starPromptLater')}
        onClick={() => react('later')}
      >
        <Icon name="close" size={14} />
      </IconButton>
      <div className="star-prompt-head">
        <span className="star-prompt-icon">
          <Icon name="star" size={18} />
        </span>
        <h3 className="star-prompt-title">{title}</h3>
      </div>
      <p className="star-prompt-body">{t('starPromptBody')}</p>
      <div className="star-prompt-actions">
        <Button
          className="star-prompt-go"
          variant="primary"
          size="sm"
          iconLeft={<Icon name="star" size={14} />}
          onClick={() => {
            void window.aiOffice.openGitHubRepo().catch(() => {})
            react('starred')
          }}
        >
          {t('starPromptGo')}
        </Button>
        <Button
          className="star-prompt-done"
          variant="ghost"
          size="sm"
          onClick={() => react('starred')}
        >
          {t('starPromptDone')}
        </Button>
      </div>
    </div>
  )
}
