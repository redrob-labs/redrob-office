/**
 * A shared file's live room, mirrored in this view: the shared room hook
 * (@genoffice/live-text) plus where this person is in the editor. The shell
 * holds the connection.
 */
import type { Editor } from '@tiptap/core'
import { useEditorPresence, useLiveRoom, type LiveFace, type LiveState } from '@genoffice/live-text'
import type { LiveApi, LivePeer } from '@genoffice/sync-client'

export { FROM_ROOM, LIVE_STRINGS, facesFor, presenceAt, type LiveState } from '@genoffice/live-text'

export function useLive({ api, path, editor }: { api: Partial<LiveApi> | undefined; path: string | null; editor: Editor | null }): {
  state: LiveState
  peers: LivePeer[]
  faces: LiveFace[]
} {
  const room = useLiveRoom({ api, path })
  useEditorPresence(room.state, editor, api)
  return room
}
