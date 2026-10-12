import { useEffect, useState, type ReactElement } from 'react'
import { Button, Dialog, ModelGuide, Select, type GuideProfession } from '@genoffice/ui'
import type { TFunc } from '../locale'

type Edition = { asOf: string; professions: GuideProfession[] }

const LANGUAGES = [
  { value: 'en', key: 'setGuideLangEn' },
  { value: 'ko', key: 'setGuideLangKo' },
  { value: 'hi', key: 'setGuideLangHi' },
] as const

/**
 * The ModelGuide edition Redrob Auto routes on, in a dialog: what each profession's tasks are ranked
 * to, in the working language chosen. Read from Console through the main process, so it is the
 * ranking requests from this computer are actually routed by.
 *
 * The kit pinned here (1.0.2) has no working-language select of its own, so the guide is handed the
 * picks for the chosen language and the select sits above it.
 */
export function ModelGuideDialog({ t, ui }: { t: TFunc; ui: 'en' | 'ko' }): ReactElement {
  const [open, setOpen] = useState(false)
  const [edition, setEdition] = useState<Edition | null | undefined>(undefined)
  const [language, setLanguage] = useState<string>(ui)

  useEffect(() => {
    if (!open || edition) return
    let alive = true
    void window.aiOffice
      .getModelGuide(ui)
      .then((loaded) => alive && setEdition(loaded as Edition | null))
      .catch(() => alive && setEdition(null))
    return () => {
      alive = false
    }
  }, [open, edition, ui])

  const professions = (edition?.professions ?? []).map((profession) => ({
    ...profession,
    tasks: (profession.tasks ?? []).map((task) => {
      const byLanguage = (task as { picksByLanguage?: Record<string, GuideProfession['tasks']> }).picksByLanguage
      const picks = byLanguage?.[language]
      return Array.isArray(picks) && picks.length ? { ...task, picks } : task
    }),
  })) as GuideProfession[]

  return (
    <>
      <Button variant="secondary" size="sm" onClick={() => setOpen(true)}>
        {t('setGuideOpen')}
      </Button>
      <Dialog
        open={open}
        title={t('setGuideTitle')}
        closeLabel={t('setGuideClose')}
        onClose={() => setOpen(false)}
        width={1080}
      >
        {edition === undefined ? (
          <p className="set-field-desc">{t('setGuideLoading')}</p>
        ) : edition === null ? (
          <p className="set-field-desc">{t('setGuideUnavailable')}</p>
        ) : (
          <>
            <Select
              id="set-guide-language"
              className="set-select"
              size="sm"
              label={t('setGuideLanguage')}
              value={language}
              options={LANGUAGES.map((l) => ({ value: l.value, label: t(l.key) }))}
              onChange={(_e, o) => o && setLanguage(String(o.value))}
            />
            <ModelGuide
              key={language}
              professions={professions}
              title={t('setGuideTitle')}
              source={{ name: 'Redrob ModelGuide', edition: t('setGuideEdition', { date: edition.asOf }) }}
            />
          </>
        )}
      </Dialog>
    </>
  )
}
