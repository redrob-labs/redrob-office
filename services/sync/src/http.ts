/**
 * The HTTP API. Every route but /health needs a bearer token; every file
 * route checks the caller's role on that file first and answers 404 to a
 * non-member, so a file's existence is not disclosed.
 */
import { createHash } from 'node:crypto'
import Fastify, { type FastifyInstance, type FastifyReply, type FastifyRequest } from 'fastify'
import { can, canGrant, isRole, type Action, type Role } from './access.ts'
import { AuthError, bearer, normalEmail, type DevIssuer, type Identity, type Verifier } from './auth.ts'
import type { BlobStore } from './blobs.ts'
import type * as Y from 'yjs'
import { CommentError, addComment, listComments, updateComment, type LiveDocs, type NewComment } from './comments.ts'
import type { Repo } from './repo.ts'

export interface AppDeps {
  repo: Repo
  blobs: BlobStore
  verifier: Verifier
  /** present only with SYNC_DEV_ISSUER=1: serves its JWKS and mints development tokens */
  devIssuer?: DevIssuer | undefined
  maxFileBytes: number
  /** the live documents, for comments written through the API */
  liveDocs?: LiveDocs | undefined
  /** drops every live connection to a file (the file was deleted) */
  closeLive?: ((fileId: string) => void) | undefined
  log?: ((message: string) => void) | undefined
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const cleanName = (v: unknown, max = 255) =>
  typeof v === 'string' ? v.replace(/[\u0000-\u001f]/g, '').trim().slice(0, max) : ''

declare module 'fastify' {
  interface FastifyRequest {
    identity?: Identity
  }
}

export function buildApp(deps: AppDeps): FastifyInstance {
  const app = Fastify({ logger: false, bodyLimit: deps.maxFileBytes })

  app.addContentTypeParser('application/octet-stream', { parseAs: 'buffer' }, (_req, body, done) => done(null, body))

  app.get('/health', async () => ({ ok: true }))

  if (deps.devIssuer) {
    const dev = deps.devIssuer
    app.get('/dev/.well-known/jwks.json', async () => dev.jwks)
    app.post('/dev/token', async (req, reply) => {
      const b = (req.body ?? {}) as Record<string, unknown>
      const sub = cleanName(b.sub, 120)
      if (!sub) return reply.code(400).send({ error: 'sub is required' })
      const name = cleanName(b.name, 120) || sub
      const email = normalEmail(b.email)
      return { token: await dev.sign(email ? { sub, name, email } : { sub, name }) }
    })
  }

  const authed = async (req: FastifyRequest, reply: FastifyReply) => {
    const token = bearer(req.headers.authorization)
    if (!token) return reply.code(401).send({ error: 'Sign in to Redrob first.' })
    try {
      req.identity = await deps.verifier.verify(token)
    } catch (err) {
      if (err instanceof AuthError) return reply.code(401).send({ error: err.message })
      throw err
    }
  }

  /** pending invites to the caller's verified address become membership */
  const claim = async (req: FastifyRequest): Promise<string[]> => {
    const who = req.identity!
    return who.email ? deps.repo.claimInvites(who.email, { sub: who.sub, name: who.name }) : []
  }

  /** the file and the caller's role, or a reply already sent */
  const fileFor = async (req: FastifyRequest, reply: FastifyReply, action: Action) => {
    const id = (req.params as { id?: string }).id ?? ''
    if (!UUID.test(id)) {
      reply.code(404).send({ error: 'No such file.' })
      return null
    }
    let role = await deps.repo.roleOf(id, req.identity!.sub)
    if (!role && (await claim(req)).includes(id)) role = await deps.repo.roleOf(id, req.identity!.sub)
    if (!role) {
      reply.code(404).send({ error: 'No such file.' })
      return null
    }
    if (!can(role, action)) {
      reply.code(403).send({ error: 'Your role on this file does not allow that.' })
      return null
    }
    const file = await deps.repo.getFile(id)
    if (!file) {
      reply.code(404).send({ error: 'No such file.' })
      return null
    }
    return { file, role }
  }

  app.register(async (api) => {
    api.addHook('preHandler', authed)

    api.get('/me', async (req) => {
      await claim(req)
      return req.identity
    })

    api.get('/files', async (req) => {
      await claim(req)
      return { files: await deps.repo.listFiles(req.identity!.sub) }
    })

    api.post('/files', async (req, reply) => {
      const name = cleanName((req.body as Record<string, unknown> | undefined)?.name)
      if (!name) return reply.code(400).send({ error: 'A file needs a name.' })
      const f = await deps.repo.createFile(name, { sub: req.identity!.sub, name: req.identity!.name })
      return reply.code(201).send(f)
    })

    api.get('/files/:id', async (req, reply) => {
      const got = await fileFor(req, reply, 'read')
      if (!got) return
      return { ...got.file, role: got.role, latest: await deps.repo.latestVersion(got.file.id) }
    })

    // Stop sharing: the file, its members, versions and live state go; every
    // member keeps the copy on their own computer.
    api.delete('/files/:id', async (req, reply) => {
      const got = await fileFor(req, reply, 'delete')
      if (!got) return
      const keys = (await deps.repo.versions(got.file.id)).map((v) => v.blobKey)
      await deps.repo.deleteFile(got.file.id)
      deps.closeLive?.(got.file.id)
      try {
        await deps.blobs.delete(keys)
      } catch (err) {
        // the file is already gone for everyone; stray bytes are only storage
        deps.log?.(`sync: stored bytes of a deleted file were left behind: ${(err as Error).message}`)
      }
      return reply.code(204).send()
    })

    api.get('/files/:id/members', async (req, reply) => {
      const got = await fileFor(req, reply, 'read')
      if (!got) return
      return { members: await deps.repo.members(got.file.id) }
    })

    api.put('/files/:id/members/:sub', async (req, reply) => {
      const got = await fileFor(req, reply, 'share')
      if (!got) return
      const sub = cleanName((req.params as { sub?: string }).sub, 120)
      const b = (req.body ?? {}) as Record<string, unknown>
      const role = b.role
      if (!sub || !isRole(role)) return reply.code(400).send({ error: 'A member needs an account and a role.' })
      if (!canGrant(got.role, role as Role, sub === req.identity!.sub)) {
        return reply.code(403).send({ error: 'That role cannot be given here.' })
      }
      await deps.repo.setMember({ fileId: got.file.id, sub, name: cleanName(b.name, 120) || sub, role: role as Role })
      return { members: await deps.repo.members(got.file.id) }
    })

    api.delete('/files/:id/members/:sub', async (req, reply) => {
      const got = await fileFor(req, reply, 'share')
      if (!got) return
      const sub = cleanName((req.params as { sub?: string }).sub, 120)
      if (sub === req.identity!.sub) return reply.code(403).send({ error: 'The owner stays on the file.' })
      await deps.repo.removeMember(got.file.id, sub)
      return reply.code(204).send()
    })

    // Invites by e-mail, for people who have not signed in to Redrob yet. The
    // first time someone signs in with that verified address, the invite
    // becomes membership. Only the owner sees or changes them.
    api.get('/files/:id/invites', async (req, reply) => {
      const got = await fileFor(req, reply, 'share')
      if (!got) return
      return { invites: await deps.repo.invites(got.file.id) }
    })

    api.put('/files/:id/invites/:email', async (req, reply) => {
      const got = await fileFor(req, reply, 'share')
      if (!got) return
      const email = normalEmail((req.params as { email?: string }).email)
      const role = ((req.body ?? {}) as Record<string, unknown>).role
      if (!email || !isRole(role)) return reply.code(400).send({ error: 'An invite needs an e-mail address and a role.' })
      if (!canGrant(got.role, role as Role, email === req.identity!.email)) {
        return reply.code(403).send({ error: 'That role cannot be given here.' })
      }
      await deps.repo.setInvite({ fileId: got.file.id, email, role: role as Role, invitedBy: req.identity!.sub })
      return { invites: await deps.repo.invites(got.file.id) }
    })

    api.delete('/files/:id/invites/:email', async (req, reply) => {
      const got = await fileFor(req, reply, 'share')
      if (!got) return
      const email = normalEmail((req.params as { email?: string }).email)
      if (email) await deps.repo.removeInvite(got.file.id, email)
      return reply.code(204).send()
    })

    // Comments, written into the live document by the service on behalf of
    // someone whose live session is read-only (see comments.ts).
    const commentsCall = async <T>(reply: FastifyReply, fileId: string, fn: (doc: Y.Doc) => T) => {
      if (!deps.liveDocs) {
        reply.code(503).send({ error: 'Comments are not available from this service.' })
        return undefined
      }
      try {
        return await deps.liveDocs.change(fileId, fn)
      } catch (err) {
        if (err instanceof CommentError) {
          reply.code(err.status).send({ error: err.message })
          return undefined
        }
        throw err
      }
    }

    api.get('/files/:id/comments', async (req, reply) => {
      const got = await fileFor(req, reply, 'read')
      if (!got) return
      const comments = await commentsCall(reply, got.file.id, listComments)
      return comments && { comments }
    })

    api.post('/files/:id/comments', async (req, reply) => {
      const got = await fileFor(req, reply, 'comment')
      if (!got) return
      const comment = await commentsCall(reply, got.file.id, (doc) => addComment(doc, (req.body ?? {}) as NewComment, req.identity!))
      return comment && reply.code(201).send({ comment })
    })

    api.patch('/files/:id/comments/:cid', async (req, reply) => {
      const got = await fileFor(req, reply, 'comment')
      if (!got) return
      const cid = cleanName((req.params as { cid?: string }).cid, 20)
      const patch = (req.body ?? {}) as { done?: unknown; text?: unknown }
      const comment = await commentsCall(reply, got.file.id, (doc) => updateComment(doc, cid, patch, req.identity!))
      return comment && { comment }
    })

    api.put('/files/:id/content', async (req, reply) => {
      const got = await fileFor(req, reply, 'write')
      if (!got) return
      const body = req.body
      if (!(body instanceof Buffer) || body.byteLength === 0) {
        return reply.code(400).send({ error: 'Send the file bytes as application/octet-stream.' })
      }
      const sha256 = createHash('sha256').update(body).digest('hex')
      const latest = await deps.repo.latestVersion(got.file.id)
      if (latest?.sha256 === sha256) return latest
      const blobKey = `files/${got.file.id}/${sha256}`
      await deps.blobs.put(blobKey, body)
      const v = await deps.repo.addVersion({ fileId: got.file.id, sha256, size: body.byteLength, blobKey, createdBy: req.identity!.sub })
      return reply.code(201).send(v)
    })

    api.get('/files/:id/content', async (req, reply) => {
      const got = await fileFor(req, reply, 'read')
      if (!got) return
      const latest = await deps.repo.latestVersion(got.file.id)
      const bytes = latest ? await deps.blobs.get(latest.blobKey) : null
      if (!latest || !bytes) return reply.code(404).send({ error: 'The file has no content yet.' })
      return reply
        .header('content-type', 'application/octet-stream')
        .header('x-file-version', String(latest.version))
        .header('x-file-sha256', latest.sha256)
        .send(Buffer.from(bytes))
    })

    api.get('/files/:id/versions', async (req, reply) => {
      const got = await fileFor(req, reply, 'read')
      if (!got) return
      return { versions: await deps.repo.versions(got.file.id) }
    })
  })

  return app
}
