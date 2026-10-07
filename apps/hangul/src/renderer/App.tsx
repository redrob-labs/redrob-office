import { useEffect, useState } from 'react'
import { HangulEditor } from './HangulEditor'
import { NextHangulEditor } from './next/NextHangulEditor'
import type { HangulEditorKind } from '../shared/ipc'

/** Mount the editor main chose for this view (see src/main/editor-kind.ts). */
export default function App(): React.JSX.Element | null {
  const [kind, setKind] = useState<HangulEditorKind | null>(null)
  useEffect(() => {
    void window.hangulApi.editorKind().then(setKind, () => setKind('studio'))
  }, [])
  if (!kind) return null
  return kind === 'next' ? <NextHangulEditor /> : <HangulEditor />
}
