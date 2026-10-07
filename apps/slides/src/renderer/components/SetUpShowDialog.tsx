import { useEffect, useState, type ReactElement } from 'react'
import { Button, Dialog } from '@genoffice/ui'
import type { ShowSettings } from '../../shared/ipc'
import { useI18n } from '../i18n/locale'

/**
 * Slide Show → Set Up Show: PowerPoint's dialog, reduced to what this show
 * plays: who runs it, looping, which slides, and whether saved timings turn
 * the slides. Read from and written to ppt/presProps.xml through main.
 */
export function SetUpShowDialog({
  slideCount,
  load,
  onSave,
  onClose,
}: {
  slideCount: number
  load: () => Promise<ShowSettings | null>
  onSave: (settings: ShowSettings) => void
  onClose: () => void
}): ReactElement {
  const { t } = useI18n()
  const [s, setS] = useState<ShowSettings | null>(null)
  const [from, setFrom] = useState(1)
  const [to, setTo] = useState(Math.max(1, slideCount))

  useEffect(() => {
    let active = true
    void load().then((got) => {
      if (!active) return
      const settings: ShowSettings = got ?? {
        type: 'speaker',
        loop: false,
        useTimings: true,
        showNarration: true,
        range: { kind: 'all' },
      }
      setS(settings)
      if (settings.range.kind === 'slides') {
        setFrom(settings.range.from)
        setTo(settings.range.to)
      }
    })
    return () => {
      active = false
    }
  }, [load])

  const kiosk = s?.type === 'kiosk'
  const clamp = (n: number) => Math.min(Math.max(1, Math.floor(n) || 1), Math.max(1, slideCount))
  const save = () => {
    if (!s) return
    const range: ShowSettings['range'] =
      s.range.kind === 'slides' ? { kind: 'slides', from: clamp(from), to: Math.max(clamp(from), clamp(to)) } : s.range
    onSave({ ...s, range })
  }

  return (
    <Dialog
      title={t('setupShowTitle')}
      closeLabel={t('ribbonCancel')}
      onClose={onClose}
      footer={
        <>
          <Button size="sm" variant="secondary" onClick={onClose}>
            {t('ribbonCancel')}
          </Button>
          <Button size="sm" variant="primary" disabled={!s} onClick={save}>
            {t('ribbonOk')}
          </Button>
        </>
      }
    >
      {s && (
        <div className="setup-show">
          <fieldset className="setup-show__set">
            <legend>{t('setupShowType')}</legend>
            <label className="setup-show__opt">
              <input type="radio" name="setup-type" checked={!kiosk} onChange={() => setS({ ...s, type: 'speaker' })} />
              {t('setupShowSpeaker')}
            </label>
            <label className="setup-show__opt">
              <input type="radio" name="setup-type" checked={kiosk} onChange={() => setS({ ...s, type: 'kiosk' })} />
              {t('setupShowKiosk')}
            </label>
          </fieldset>
          <fieldset className="setup-show__set">
            <legend>{t('setupShowOptions')}</legend>
            <label className="setup-show__opt">
              <input type="checkbox" checked={kiosk || s.loop} disabled={kiosk} onChange={(e) => setS({ ...s, loop: e.target.checked })} />
              {t('setupShowLoop')}
            </label>
            <label className="setup-show__opt">
              <input type="checkbox" checked={s.showNarration} onChange={(e) => setS({ ...s, showNarration: e.target.checked })} />
              {t('setupShowNarration')}
            </label>
          </fieldset>
          <fieldset className="setup-show__set">
            <legend>{t('setupShowSlides')}</legend>
            <label className="setup-show__opt">
              <input
                type="radio"
                name="setup-range"
                checked={s.range.kind !== 'slides'}
                onChange={() => setS({ ...s, range: { kind: 'all' } })}
              />
              {t('setupShowAll')}
            </label>
            <label className="setup-show__opt">
              <input
                type="radio"
                name="setup-range"
                checked={s.range.kind === 'slides'}
                onChange={() => setS({ ...s, range: { kind: 'slides', from: clamp(from), to: clamp(to) } })}
              />
              {t('setupShowFrom')}
              <input
                type="number"
                className="setup-show__num"
                min={1}
                max={slideCount}
                value={from}
                aria-label={t('setupShowFrom')}
                disabled={s.range.kind !== 'slides'}
                onChange={(e) => setFrom(Number(e.target.value))}
              />
              {t('setupShowTo')}
              <input
                type="number"
                className="setup-show__num"
                min={1}
                max={slideCount}
                value={to}
                aria-label={t('setupShowTo')}
                disabled={s.range.kind !== 'slides'}
                onChange={(e) => setTo(Number(e.target.value))}
              />
            </label>
            {s.range.kind === 'custom' && <p className="setup-show__note">{t('setupShowCustomKept')}</p>}
          </fieldset>
          <fieldset className="setup-show__set">
            <legend>{t('setupShowAdvance')}</legend>
            <label className="setup-show__opt">
              <input
                type="radio"
                name="setup-advance"
                checked={!kiosk && !s.useTimings}
                disabled={kiosk}
                onChange={() => setS({ ...s, useTimings: false })}
              />
              {t('setupShowManual')}
            </label>
            <label className="setup-show__opt">
              <input
                type="radio"
                name="setup-advance"
                checked={kiosk || s.useTimings}
                disabled={kiosk}
                onChange={() => setS({ ...s, useTimings: true })}
              />
              {t('setupShowTimings')}
            </label>
          </fieldset>
        </div>
      )}
    </Dialog>
  )
}
