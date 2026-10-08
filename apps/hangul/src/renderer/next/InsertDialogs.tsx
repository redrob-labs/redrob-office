/**
 * Insert flows for the owned editor (spec task 2.4): a small prompt dialog
 * for 수식 (equation script), 각주 (footnote text), 책갈피 (bookmark name) and
 * 머리말 / 꼬리말 text, and a picture file picker. Each runs one insert
 * command, so each is one undo step.
 */
import { useRef, useState } from 'react'
import type { EditorView } from '@genoffice/hwp-editor'
import { Button, Dialog, Input } from '@genoffice/ui'
import { useI18n, type StringKey } from '../i18n/locale'

export type InsertKind = 'insert:equation' | 'insert:footnote' | 'insert:bookmark' | 'page:header-create' | 'page:footer-create' | 'edit:goto-page' | 'view:zoom-set' | 'page:new-page-num' | 'table:formula' | 'insert:equation-edit'

const PROMPTS: Record<InsertKind, { title: StringKey; label: StringKey; param: string; required: boolean; number?: boolean; apply?: boolean }> = {
  'insert:equation': { title: 'nextInsertEquation', label: 'nextEquationScript', param: 'script', required: true },
  'insert:footnote': { title: 'nextInsertFootnote', label: 'nextFootnoteText', param: 'text', required: false },
  'insert:bookmark': { title: 'nextInsertBookmark', label: 'nextBookmarkName', param: 'name', required: true },
  'page:header-create': { title: 'nextInsertHeader', label: 'nextHeaderText', param: 'text', required: true },
  'page:footer-create': { title: 'nextInsertFooter', label: 'nextFooterText', param: 'text', required: true },
  'edit:goto-page': { title: 'nextGotoTitle', label: 'nextGotoPage', param: 'page', required: true, number: true, apply: true },
  'view:zoom-set': { title: 'nextZoomTitle', label: 'nextZoomPercent', param: 'percent', required: true, number: true, apply: true },
  'page:new-page-num': { title: 'nextNewPageNumTitle', label: 'nextNewPageNumStart', param: 'start', required: true, number: true, apply: true },
  'table:formula': { title: 'nextFormulaTitle', label: 'nextFormulaLabel', param: 'formula', required: true, apply: true },
  'insert:equation-edit': { title: 'nextEditEquation', label: 'nextEquationScript', param: 'script', required: true, apply: true },
}

/** 한글 equation script is the same in every language, so the examples are not translated. */
const EQUATION_EXAMPLES = 'a over b, sqrt {x^2 + 1}, sum from {i=1} to n i'

export function InsertPromptDialog({ view, kind, initial = '', onClose, onApplied }: { view: EditorView; kind: InsertKind; initial?: string; onClose: () => void; onApplied: () => void }): React.JSX.Element {
  const { t } = useI18n()
  const [value, setValue] = useState(initial)
  const spec = PROMPTS[kind]
  const bad = spec.number ? !/^\s*\d+\s*$/.test(value) : spec.required && !value.trim()
  const submit = () => {
    if (bad) return
    view.run(kind, { [spec.param]: spec.number ? Number(value) : value })
    onApplied()
    onClose()
  }
  return (
    <Dialog
      title={t(spec.title)}
      closeLabel={t('nextDialogClose')}
      onClose={onClose}
      width={420}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            {t('nextDialogCancel')}
          </Button>
          <Button disabled={bad} onClick={submit}>
            {t(spec.apply ? 'nextDialogApply' : 'nextDialogInsert')}
          </Button>
        </>
      }
    >
      <form
        onSubmit={(e) => {
          e.preventDefault()
          submit()
        }}
      >
        <Input label={t(spec.label)} value={value} inputMode={spec.number ? 'numeric' : undefined} autoFocus onChange={(e) => setValue(e.target.value)} />
        {kind === 'insert:equation' || kind === 'insert:equation-edit' ? (
          <p className="hangul-hint">
            {t('nextEquationHint')} <code lang="zxx">{EQUATION_EXAMPLES}</code>
          </p>
        ) : null}
        {kind === 'table:formula' ? (
          <p className="hangul-hint">
            {t('nextFormulaHint')} <code lang="zxx">=SUM(A1:A3), =A1*B2, =AVG(B1:B4)</code>
          </p>
        ) : null}
      </form>
    </Dialog>
  )
}

const EXT_BY_TYPE: Record<string, string> = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/gif': 'gif', 'image/bmp': 'bmp' }

/** Read a picked image's bytes and natural size, then insert it. */
export async function insertPictureFile(view: EditorView, file: File): Promise<boolean> {
  const extension = EXT_BY_TYPE[file.type] ?? file.name.split('.').pop()?.toLowerCase() ?? ''
  if (!['png', 'jpg', 'jpeg', 'gif', 'bmp'].includes(extension)) return false
  const bytes = new Uint8Array(await file.arrayBuffer())
  let widthPx = 0
  let heightPx = 0
  try {
    const bmp = await createImageBitmap(file)
    widthPx = bmp.width
    heightPx = bmp.height
    bmp.close()
  } catch {
    return false
  }
  view.run('insert:image', { bytes, extension: extension === 'jpeg' ? 'jpg' : extension, widthPx, heightPx, description: file.name })
  return true
}

/** A hidden file input the ribbon's 그림 button opens. */
export function usePicturePicker(getView: () => EditorView | null, onDone: () => void): { open: () => void; input: React.JSX.Element } {
  const ref = useRef<HTMLInputElement>(null)
  const input = (
    <input
      ref={ref}
      type="file"
      accept="image/png,image/jpeg,image/gif,image/bmp"
      hidden
      onChange={(e) => {
        const f = e.target.files?.[0]
        e.target.value = ''
        const view = getView()
        if (f && view) void insertPictureFile(view, f).then(onDone)
      }}
    />
  )
  return { open: () => ref.current?.click(), input }
}
