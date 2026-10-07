/**
 * Live typing for Docs: the shared tiptap binding (@genoffice/live-text)
 * with this schema's text blocks and the paper's peer-caret classes
 * (live.css, docs-peer-*). See the package for what is bound and why.
 */
import {
  startCollab as startSharedCollab,
  type CollabHandle,
  type CollabOptions,
} from '@genoffice/live-text'

export {
  FRAGMENT,
  applyPeers,
  historyCan,
  historyRedo,
  historyUndo,
  isRemoteChange,
  type CollabHandle,
} from '@genoffice/live-text'

/** blocks an undo never removes whole when only their text changed (y-prosemirror's "paragraph", in this schema's names) */
export const DOCS_TEXT_BLOCKS = ['docParagraph', 'docHeading', 'docListItem'] as const

export function startCollab(options: Omit<CollabOptions, 'protectedBlocks' | 'classPrefix'>): CollabHandle {
  return startSharedCollab({ ...options, protectedBlocks: DOCS_TEXT_BLOCKS, classPrefix: 'docs-peer' })
}
