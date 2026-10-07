/**
 * Live documents over WebSocket (Hocuspocus). The document name is the file
 * id. A connection must present a valid token and be a member of the file;
 * anyone below edit joins read-only. The server stamps each person's
 * presence with who the token says they are, so a cursor cannot claim to be
 * someone else.
 */
import { Server, type onAuthenticatePayload } from '@hocuspocus/server'
import * as Y from 'yjs'
import { liveReadOnly } from './access.ts'
import type { Identity, Verifier } from './auth.ts'
import type { Repo } from './repo.ts'

export interface CollabContext {
  identity: Identity
  readOnly: boolean
}

export interface CollabDeps {
  repo: Repo
  verifier: Verifier
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** The authentication rule, apart from the server so it can be tested. */
export async function authenticate(
  deps: CollabDeps,
  payload: Pick<onAuthenticatePayload, 'documentName' | 'token' | 'connectionConfig'>,
): Promise<CollabContext> {
  if (!UUID.test(payload.documentName)) throw new Error('No such file.')
  const identity = await deps.verifier.verify(payload.token)
  const role = await deps.repo.roleOf(payload.documentName, identity.sub)
  if (!role) throw new Error('No such file.')
  const readOnly = liveReadOnly(role)
  payload.connectionConfig.readOnly = readOnly
  return { identity, readOnly }
}

export function buildCollab(deps: CollabDeps, opts: { port: number; host: string }): Server<CollabContext> {
  return new Server<CollabContext>({
    name: 'redrob-office-sync',
    port: opts.port,
    address: opts.host,
    quiet: true,
    stopOnSignals: false,
    debounce: 2000,
    maxDebounce: 10000,
    websocketOptions: { maxPayload: 8 * 1024 * 1024 },
    async onAuthenticate(payload) {
      return authenticate(deps, payload)
    },
    async beforeHandleAwareness({ states, context }) {
      // presence carries the verified person, whatever the client claimed
      for (const state of states.values()) {
        state.user = context ? { id: context.identity.sub, name: context.identity.name } : null
      }
    },
    async onLoadDocument({ documentName, document }) {
      const state = await deps.repo.loadDoc(documentName)
      if (state) Y.applyUpdate(document, state)
      return document
    },
    async onStoreDocument({ documentName, document }) {
      await deps.repo.storeDoc(documentName, Y.encodeStateAsUpdate(document))
    },
  })
}
