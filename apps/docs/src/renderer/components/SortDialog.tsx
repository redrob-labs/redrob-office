import { useState, type ReactElement } from 'react'
import { Button, Dialog } from '@genoffice/ui'
import { useI18n } from '../i18n/locale'
import type { SortOptions } from '../editor/sort'

/** Word's Sort Text dialog, reduced to what a paragraph sort needs: the key and the direction. */
export function SortDialog({
  canSort,
  onApply,
  onClose,
}: {
  /** false when the selection is one paragraph, or takes in a table or picture */
  canSort: boolean
  onApply: (opts: SortOptions) => void
  onClose: () => void
}): ReactElement {
  const { t } = useI18n()
  const [by, setBy] = useState<SortOptions['by']>('text')
  const [order, setOrder] = useState<SortOptions['order']>('asc')
  return (
    <Dialog
      title={t('ribbonSortTitle')}
      closeLabel={t('ribbonCancel')}
      onClose={onClose}
      footer={
        <>
          <Button size="sm" variant="secondary" onClick={onClose}>
            {t('ribbonCancel')}
          </Button>
          <Button size="sm" variant="primary" disabled={!canSort} onClick={() => onApply({ by, order })}>
            {t('ribbonOk')}
          </Button>
        </>
      }
    >
      {!canSort && <p role="status">{t('ribbonSortNeedsTwo')}</p>}
      <fieldset className="sort-dialog__set">
        <legend>{t('ribbonSortBy')}</legend>
        {(['text', 'number', 'date'] as const).map((k) => (
          <label key={k} className="sort-dialog__opt">
            <input type="radio" name="sort-by" checked={by === k} onChange={() => setBy(k)} />
            {t(k === 'text' ? 'ribbonSortByText' : k === 'number' ? 'ribbonSortByNumber' : 'ribbonSortByDate')}
          </label>
        ))}
      </fieldset>
      <fieldset className="sort-dialog__set">
        {(['asc', 'desc'] as const).map((k) => (
          <label key={k} className="sort-dialog__opt">
            <input type="radio" name="sort-order" checked={order === k} onChange={() => setOrder(k)} />
            {t(k === 'asc' ? 'ribbonSortAsc' : 'ribbonSortDesc')}
          </label>
        ))}
      </fieldset>
    </Dialog>
  )
}
