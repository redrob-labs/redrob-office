/**
 * Live Slides: the text typed into a text box reaches everyone else with the
 * deck open, through the shared "shape-text" map of the file's live room (see
 * @genoffice/sync-client/live-models). Last writer wins per text box. Moving,
 * formatting, pictures and slides themselves still travel with the next saved
 * version.
 *
 * Text boxes are addressed by ids every copy agrees on (main's
 * slides:live-address). Someone else's text is applied in main as the same
 * setText op a local edit runs: journaled, so a save here writes it, but with
 * no undo step and without marking this window unsaved.
 */
import { useCallback, useEffect, useRef } from 'react'
import { useLiveRoom, type LiveFace } from '@genoffice/live-text/room'
import { bindShapeText, type LiveShapeText, type ShapesBinding } from '@genoffice/sync-client/live-models'
import type { RenderSlide } from '@genoffice/pptx-render'
import type { SlidesApi } from '../../shared/ipc'

/** What live editing covers for a deck (English master, like the rest of the Share copy) */
export const SLIDES_LIVE_NOTE =
  'Text typed into a text box changes for everyone when it is committed. Moving, formatting, pictures and new slides reach the others with your next save.'

export type LiveSlidesApi = Pick<SlidesApi, 'liveJoin' | 'liveUpdate' | 'liveLeave' | 'onLiveUpdate' | 'onLivePeers' | 'livePresence' | 'liveAddress' | 'liveApplyText'>

export interface LiveTextAddress {
  slideId: string
  shapeId: string
}

/** Applies someone else's text boxes one at a time, in the order they came. */
export function applyQueue(
  api: Pick<LiveSlidesApi, 'liveApplyText'>,
  onSlide: (slideIndex: number, slide: RenderSlide) => void,
): (edits: readonly LiveShapeText[]) => Promise<void> {
  let chain: Promise<void> = Promise.resolve()
  return (edits) => {
    chain = chain.then(async () => {
      for (const edit of edits) {
        try {
          const r = await api.liveApplyText?.(edit)
          // a slide or box this copy does not have waits for the next saved version
          if (r?.slide) onSlide(r.slideIndex, r.slide)
        } catch {
          // one bad entry does not stop the rest; the next write replaces it
        }
      }
    })
    return chain
  }
}

export function useLiveShapes({
  api,
  path,
  current,
  onRemoteSlide,
}: {
  api: LiveSlidesApi | undefined
  path: string | null
  /** the slide this person is on, told to the room as their place */
  current: number
  onRemoteSlide: (slideIndex: number, slide: RenderSlide) => void
}): {
  live: boolean
  readOnly: boolean
  faces: LiveFace[]
  /** the shared address of a text box, asked before the local edit runs */
  addressFor: (slideIndex: number, sourceId: string, groupId?: string) => Promise<LiveTextAddress | null>
  /** this person's text for a box, after the edit landed locally */
  push: (address: LiveTextAddress, paragraphs: unknown[]) => void
} {
  const room = useLiveRoom({ api, path })
  const state = room.state
  const bindingRef = useRef<ShapesBinding | null>(null)
  const onSlideRef = useRef(onRemoteSlide)
  onSlideRef.current = onRemoteSlide
  const apiRef = useRef(api)
  apiRef.current = api

  useEffect(() => {
    if (state.kind !== 'live' || !apiRef.current?.liveApplyText) return
    const apply = applyQueue(apiRef.current, (i, s) => onSlideRef.current(i, s))
    const binding = bindShapeText(state.doc, { readOnly: state.readOnly, onRemote: (edits) => void apply(edits) })
    bindingRef.current = binding
    // what others typed since the version this computer has
    void apply(binding.all())
    return () => {
      bindingRef.current = null
      binding.destroy()
    }
  }, [state])

  const fileId = state.kind === 'live' ? state.fileId : null
  useEffect(() => {
    if (!fileId) return
    apiRef.current?.livePresence?.(fileId, { at: { block: current, text: `Slide ${current + 1}` } })
  }, [fileId, current])

  const live = state.kind === 'live'
  const readOnly = state.kind === 'live' && state.readOnly
  const addressFor = useCallback(
    async (slideIndex: number, sourceId: string, groupId?: string) => {
      if (!live || readOnly || !apiRef.current?.liveAddress) return null
      try {
        return await apiRef.current.liveAddress({ slideIndex, sourceId, ...(groupId ? { groupId } : {}) })
      } catch {
        return null
      }
    },
    [live, readOnly],
  )
  const push = useCallback((address: LiveTextAddress, paragraphs: unknown[]) => {
    bindingRef.current?.push({ ...address, paragraphs })
  }, [])

  return { live, readOnly, faces: room.faces, addressFor, push }
}
