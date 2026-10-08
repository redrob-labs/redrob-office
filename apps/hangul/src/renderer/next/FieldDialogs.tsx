/**
 * 하이퍼링크 and 누름틀 (click-here field) dialogs for the owned editor (spec
 * task 2.4). The hyperlink dialog edits the link at the caret when there is
 * one; otherwise it links the selection, or inserts the shown text and links it.
 * Only web and mail addresses are accepted.
 */
import { useMemo, useState } from 'react'
import { hyperlinkAt, normalizeUri, ordered, type EditorView } from '@genoffice/hwp-editor'
import { Button, Dialog, Input } from '@genoffice/ui'
import { useI18n } from '../i18n/locale'

type Props = { view: EditorView; onClose: () => void; onApplied: () => void }

function selectedText(view: EditorView): string {
  const [a, b] = ordered(view.session.selection)
  if (a.para !== b.para || a.section !== b.section || JSON.stringify(a.cell) !== JSON.stringify(b.cell)) return ''
  return a.offset === b.offset ? '' : view.session.text.text(a, a.offset, b.offset - a.offset)
}

export function HyperlinkDialog({ view, onClose, onApplied }: Props): React.JSX.Element {
  const { t } = useI18n()
  const existing = useMemo(() => hyperlinkAt(view.session), [view])
  const selected = useMemo(() => selectedText(view), [view])
  const [text, setText] = useState(existing?.text ?? selected)
  const [uri, setUri] = useState(existing?.uri ?? '')
  const address = normalizeUri(uri)
  const textLocked = !existing && !!selected

  const apply = () => {
    if (!address) return
    if (existing) view.run('hyperlink:edit', { uri: address, text })
    else view.run('insert:hyperlink', { uri: address, text })
    onApplied()
    onClose()
  }
  const remove = () => {
    view.run('hyperlink:remove')
    onApplied()
    onClose()
  }
  return (
    <Dialog
      title={t('nextHyperlinkTitle')}
      closeLabel={t('nextDialogClose')}
      onClose={onClose}
      width={480}
      footer={
        <>
          {existing ? (
            <Button variant="secondary" onClick={remove}>
              {t('nextHyperlinkRemove')}
            </Button>
          ) : null}
          <Button variant="secondary" onClick={onClose}>
            {t('nextDialogCancel')}
          </Button>
          <Button onClick={apply} disabled={!address}>
            {t('nextDialogApply')}
          </Button>
        </>
      }
    >
      <div className="hangul-dialog-stack">
        <Input label={t('nextHyperlinkText')} value={text} disabled={textLocked} onChange={(e) => setText(e.target.value)} />
        <Input
          label={t('nextHyperlinkAddress')}
          value={uri}
          placeholder="https://"
          autoFocus
          onChange={(e) => setUri(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') apply()
          }}
        />
        {uri.trim() && !address ? (
          <p className="hangul-dialog-note" role="alert">
            {t('nextHyperlinkInvalid')}
          </p>
        ) : null}
      </div>
    </Dialog>
  )
}

export function ClickHereDialog({ view, onClose, onApplied }: Props): React.JSX.Element {
  const { t } = useI18n()
  const [guide, setGuide] = useState('')
  const [memo, setMemo] = useState('')
  const [name, setName] = useState('')
  const apply = () => {
    if (!guide.trim()) return
    view.run('insert:field', { guide: guide.trim(), memo, name: name.trim() })
    onApplied()
    onClose()
  }
  return (
    <Dialog
      title={t('nextClickHereTitle')}
      closeLabel={t('nextDialogClose')}
      onClose={onClose}
      width={480}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            {t('nextDialogCancel')}
          </Button>
          <Button onClick={apply} disabled={!guide.trim()}>
            {t('nextDialogApply')}
          </Button>
        </>
      }
    >
      <div className="hangul-dialog-stack">
        <Input label={t('nextClickHereGuide')} value={guide} autoFocus onChange={(e) => setGuide(e.target.value)} />
        <Input label={t('nextClickHereMemo')} value={memo} onChange={(e) => setMemo(e.target.value)} />
        <Input label={t('nextFieldName')} value={name} onChange={(e) => setName(e.target.value)} />
      </div>
    </Dialog>
  )
}
