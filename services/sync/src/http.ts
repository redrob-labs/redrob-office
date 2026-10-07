/**
 * The HTTP API. Every route but /health needs a bearer token; every file
 * route checks the caller's role on that file first and answers 404 to a
 * non-member, so a file's existence is not disclosed.
 */
import { createHash, randomBytes } from 'node:crypto'
import Fastify, { type FastifyInstance, type FastifyReply, type FastifyRequest, type FastifyServerOptions } from 'fastify'
import { RateLimiter, type RateLimits } from './limits.ts'
import { can, canGrant, isRole, type Action, type Role } from './access.ts'
import { AuthError, bearer, normalEmail, type DevIssuer, type Identity, type Verifier } from './auth.ts'
import type { BlobStore } from './blobs.ts'
import type * as Y from 'yjs'
import { CommentError, addComment, listComments, updateComment, type LiveDocs, type NewComment } from './comments.ts'
import type { EventKind, Repo } from './repo.ts'

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
  /** the clock links expire by (tests move it) */
  now?: (() => Date) | undefined
  /** largest JSON body (uploads use maxFileBytes); 256 KiB when not given */
  bodyLimitBytes?: number | undefined
  /** request limits; none when not given (tests) */
  limits?: RateLimits | undefined
  /** Fastify's logger: false (tests) or pino options from main */
  logger?: FastifyServerOptions['logger'] | undefined
  /** behind a load balancer: take the caller's address from X-Forwarded-For */
  trustProxy?: boolean | undefined
  /** true once the service is stopping: readiness fails so the balancer stops sending work */
  draining?: (() => boolean) | undefined
}

/** how long readiness waits for the database or the store */
export const READY_TIMEOUT_MS = 3000

/** a request's path as logs keep it: invite-link tokens are never written down */
export function redactUrl(url: string | undefined): string {
  return (url ?? '').replace(/^\/links\/[^/?#]+/, '/links/[token]').replace(/\?.*$/, (q) => (q.length > 1 ? '?[query]' : q))
}

/** Fastify logger options for production: JSON lines, no tokens, no query strings. */
export function loggerOptions(level: string): FastifyServerOptions['logger'] {
  return {
    level,
    redact: { paths: ['req.headers.authorization', 'req.headers.cookie'], remove: true },
    serializers: {
      req: (req: FastifyRequest) => ({ id: req.id, method: req.method, url: redactUrl(req.url) }),
    },
  }
}

const withTimeout = <T>(p: Promise<T>, ms: number) =>
  Promise.race([p, new Promise<never>((_, reject) => setTimeout(() => reject(new Error(`no answer in ${ms} ms`)), ms).unref?.())])

/** an invite link lives at most this long, and a week when the owner does not say */
export const LINK_MAX_DAYS = 30
export const LINK_DEFAULT_DAYS = 7
const LINK_TOKEN = /^[A-Za-z0-9_-]{43}$/
const tokenHash = (token: string) => createHash('sha256').update(token).digest('hex')

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const cleanName = (v: unknown, max = 255) =>
  typeof v === 'string' ? v.replace(/[\u0000-\u001f]/g, '').trim().slice(0, max) : ''

declare module 'fastify' {
  interface FastifyRequest {
    identity?: Identity
  }
}

export function buildApp(deps: AppDeps): FastifyInstance {
  const app = Fastify({
    logger: deps.logger ?? false,
    bodyLimit: deps.bodyLimitBytes ?? 256 * 1024,
    trustProxy: deps.trustProxy ?? false,
  })
  const log = deps.log ?? ((m: string) => app.log.warn(m))

  app.addContentTypeParser('application/octet-stream', { parseAs: 'buffer' }, (_req, body, done) => done(null, body))

  // liveness: the process answers
  app.get('/health', async () => ({ ok: true }))

  // readiness: the database and the store answer, and the service is not stopping
  app.get('/ready', async (_req, reply) => {
    if (deps.draining?.()) return reply.code(503).send({ ok: false, draining: true })
    const check = async (name: string, fn: () => Promise<void>) => {
      try {
        await withTimeout(fn(), READY_TIMEOUT_MS)
        return true
      } catch (err) {
        log(`sync: not ready, ${name}: ${(err as Error).message}`)
        return false
      }
    }
    const [db, store] = await Promise.all([check('database', () => deps.repo.ping()), check('store', () => deps.blobs.ping())])
    return reply.code(db && store ? 200 : 503).send({ ok: db && store, db, store })
  })

  // Limits: per address before sign-in, per account after, and tighter on
  // invite links, whose tokens are what someone would try to guess.
  const clock = () => (deps.now?.() ?? new Date()).getTime()
  const byAddress = deps.limits && new RateLimiter(deps.limits.perAddressPerMinute, 60_000, clock)
  const byAccount = deps.limits && new RateLimiter(deps.limits.perAccountPerMinute, 60_000, clock)
  const byLinks = deps.limits && new RateLimiter(deps.limits.linksPerHour, 3_600_000, clock)
  const refuse = (reply: FastifyReply, retryAfter: number) =>
    reply.code(429).header('retry-after', String(retryAfter)).send({ error: 'Too many requests. Try again shortly.' })
  if (byAddress) {
    app.addHook('onRequest', async (req, reply) => {
      if (req.url === '/health' || req.url === '/ready') return
      const t = byAddress.take(`ip:${req.ip}`)
      if (!t.ok) return refuse(reply, t.retryAfter)
    })
  }
  const linkLimit = (req: FastifyRequest, reply: FastifyReply): boolean => {
    if (!byLinks) return true
    const t = byLinks.take(req.identity!.sub)
    if (t.ok) return true
    refuse(reply, t.retryAfter)
    return false
  }

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

  /**
   * Records what someone did, for everyone with the file now (or `audience`,
   * when the people it concerns are about to lose it). Activity is a record,
   * not the change: a failure here is logged and never fails the request.
   */
  const emit = async (
    file: { id: string; name: string },
    who: { sub: string; name: string },
    kind: EventKind,
    detail: Record<string, unknown> = {},
    audience?: readonly string[],
  ) => {
    try {
      const subs = audience ?? (await deps.repo.members(file.id)).map((m) => m.sub)
      await deps.repo.addEvent({ fileId: file.id, fileName: file.name, actorSub: who.sub, actorName: who.name, kind, detail, audience: subs })
    } catch (err) {
      log(`sync: activity was not recorded: ${(err as Error).message}`)
    }
  }

  /** pending invites to the caller's verified address become membership */
  const claim = async (req: FastifyRequest): Promise<string[]> => {
    const who = req.identity!
    if (!who.email) return []
    const joined = await deps.repo.claimInvites(who.email, { sub: who.sub, name: who.name })
    for (const id of joined) {
      const f = await deps.repo.getFile(id)
      const role = f && (await deps.repo.roleOf(id, who.sub))
      if (f) await emit(f, who, 'joined', { role })
    }
    return joined
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
    if (byAccount) {
      api.addHook('preHandler', async (req, reply) => {
        const t = byAccount.take(req.identity!.sub)
        if (!t.ok) return refuse(reply, t.retryAfter)
      })
    }

    api.get('/me', async (req) => {
      await claim(req)
      return req.identity
    })

    api.get('/files', async (req) => {
      await claim(req)
      return { files: await deps.repo.listFiles(req.identity!.sub) }
    })

    // What other people did to files this person had at the time, newest
    // first. `after` polls for newer events; `before` pages back.
    api.get('/activity', async (req, reply) => {
      await claim(req)
      const q = (req.query ?? {}) as Record<string, unknown>
      const id = (v: unknown) => (typeof v === 'string' && /^\d{1,15}$/.test(v) ? Number(v) : undefined)
      if ((q.after !== undefined && id(q.after) === undefined) || (q.before !== undefined && id(q.before) === undefined)) {
        return reply.code(400).send({ error: 'after and before are event ids.' })
      }
      const limit = Math.min(200, Math.max(1, id(q.limit) ?? 50))
      // one more than asked says whether there is more
      const me = req.identity!.sub
      const rows = await deps.repo.activity(me, { after: id(q.after), before: id(q.before), limit: limit + 1 })
      // `you`: the event is about the caller (shared with, removed, made owner), so it reads "you"
      const events = rows.slice(0, limit).map((e) => ({ ...e, you: e.detail.sub === me }))
      return { events, more: rows.length > limit }
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
      const had = (await deps.repo.members(got.file.id)).map((m) => m.sub)
      await deps.repo.deleteFile(got.file.id)
      await emit(got.file, req.identity!, 'unshared', {}, had)
      deps.closeLive?.(got.file.id)
      try {
        await deps.blobs.delete(keys)
      } catch (err) {
        // the file is already gone for everyone; stray bytes are only storage
        log(`sync: stored bytes of a deleted file were left behind: ${(err as Error).message}`)
      }
      return reply.code(204).send()
    })

    // Rename: the name everyone with access sees. Anyone who may edit may rename,
    // as they may change the contents; each computer keeps its own file name.
    api.patch('/files/:id', async (req, reply) => {
      const got = await fileFor(req, reply, 'write')
      if (!got) return
      const name = cleanName(((req.body ?? {}) as Record<string, unknown>).name)
      if (!name) return reply.code(400).send({ error: 'A file needs a name.' })
      await deps.repo.renameFile(got.file.id, name)
      if (name !== got.file.name) await emit({ id: got.file.id, name }, req.identity!, 'renamed', { from: got.file.name })
      return { ...got.file, name, role: got.role }
    })

    // Hand the file to an editor: they become the owner and the old owner an
    // editor, in one step, so there is always exactly one owner.
    api.post('/files/:id/transfer', async (req, reply) => {
      const got = await fileFor(req, reply, 'share')
      if (!got) return
      const to = cleanName(((req.body ?? {}) as Record<string, unknown>).sub, 120)
      if (!to || to === req.identity!.sub) return reply.code(400).send({ error: 'Choose someone else to own the file.' })
      if (!(await deps.repo.transferOwnership(got.file.id, req.identity!.sub, to))) {
        return reply.code(409).send({ error: 'Only someone who can already edit the file can become its owner.' })
      }
      const members = await deps.repo.members(got.file.id)
      const owner = members.find((m) => m.sub === to)
      await emit(got.file, req.identity!, 'transferred', { sub: to, name: owner?.name ?? to }, members.map((m) => m.sub))
      return { members }
    })

    // Leave: someone who is not the owner takes themself off the file. Their
    // copy on their own computer stays.
    api.delete('/files/:id/members/me', async (req, reply) => {
      const got = await fileFor(req, reply, 'read')
      if (!got) return
      if (got.role === 'owner') {
        return reply.code(409).send({ error: 'The owner cannot leave. Make someone else the owner first, or stop sharing.' })
      }
      await deps.repo.removeMember(got.file.id, req.identity!.sub)
      await emit(got.file, req.identity!, 'left')
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
      const before = await deps.repo.roleOf(got.file.id, sub)
      const name = cleanName(b.name, 120) || sub
      await deps.repo.setMember({ fileId: got.file.id, sub, name, role: role as Role })
      if (before !== role) await emit(got.file, req.identity!, before ? 'role' : 'shared', { sub, name, role })
      return { members: await deps.repo.members(got.file.id) }
    })

    api.delete('/files/:id/members/:sub', async (req, reply) => {
      const got = await fileFor(req, reply, 'share')
      if (!got) return
      const sub = cleanName((req.params as { sub?: string }).sub, 120)
      if (sub === req.identity!.sub) return reply.code(403).send({ error: 'The owner stays on the file.' })
      const members = await deps.repo.members(got.file.id)
      const gone = members.find((m) => m.sub === sub)
      await deps.repo.removeMember(got.file.id, sub)
      // the person removed is told too: they are in the audience taken before the change
      if (gone) await emit(got.file, req.identity!, 'removed', { sub, name: gone.name }, members.map((m) => m.sub))
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

    // Invite links. The owner makes one with a role (edit at most) and an
    // expiry, and can revoke it. Anyone signed in who has the link joins with
    // that role; a link alone, without a verified token, opens nothing. The
    // token is shown once, at creation: only its hash is stored.
    api.post('/files/:id/links', async (req, reply) => {
      const got = await fileFor(req, reply, 'share')
      if (!got) return
      const b = (req.body ?? {}) as Record<string, unknown>
      const role = b.role
      if (!isRole(role) || !canGrant(got.role, role, false)) return reply.code(400).send({ error: 'A link gives edit, comment or view.' })
      const days = b.days === undefined ? LINK_DEFAULT_DAYS : b.days
      if (typeof days !== 'number' || !Number.isInteger(days) || days < 1 || days > LINK_MAX_DAYS) {
        return reply.code(400).send({ error: `A link lasts 1 to ${LINK_MAX_DAYS} days.` })
      }
      const token = randomBytes(32).toString('base64url')
      const now = deps.now?.() ?? new Date()
      const link = await deps.repo.createLink({
        fileId: got.file.id,
        tokenHash: tokenHash(token),
        role,
        createdBy: req.identity!.sub,
        expiresAt: new Date(now.getTime() + days * 86_400_000),
      })
      return reply.code(201).send({ link, token })
    })

    api.get('/files/:id/links', async (req, reply) => {
      const got = await fileFor(req, reply, 'share')
      if (!got) return
      return { links: await deps.repo.links(got.file.id) }
    })

    api.delete('/files/:id/links/:linkId', async (req, reply) => {
      const got = await fileFor(req, reply, 'share')
      if (!got) return
      const linkId = (req.params as { linkId?: string }).linkId ?? ''
      if (!UUID.test(linkId) || !(await deps.repo.revokeLink(got.file.id, linkId))) {
        return reply.code(404).send({ error: 'No such link.' })
      }
      return reply.code(204).send()
    })

    // What a link would do, without using it, so the desktop can ask first.
    api.get('/links/:token', async (req, reply) => {
      if (!linkLimit(req, reply)) return
      const token = (req.params as { token?: string }).token ?? ''
      const gone = () => reply.code(404).send({ error: 'This link does not work any more. Ask the owner for a new one.' })
      if (!LINK_TOKEN.test(token)) return gone()
      const l = await deps.repo.peekLink(tokenHash(token), deps.now?.() ?? new Date())
      const file = l && (await deps.repo.getFile(l.fileId))
      if (!l || !file) return gone()
      const owner = (await deps.repo.members(file.id)).find((m) => m.role === 'owner')
      const role = await deps.repo.roleOf(file.id, req.identity!.sub)
      return { fileName: file.name, ownerName: owner?.name ?? '', role: l.role, expiresAt: l.expiresAt, alreadyHave: role }
    })

    api.post('/links/:token/redeem', async (req, reply) => {
      if (!linkLimit(req, reply)) return
      const token = (req.params as { token?: string }).token ?? ''
      const gone = () => reply.code(404).send({ error: 'This link does not work any more. Ask the owner for a new one.' })
      if (!LINK_TOKEN.test(token)) return gone()
      const who = req.identity!
      const r = await deps.repo.redeemLink(tokenHash(token), { sub: who.sub, name: who.name }, deps.now?.() ?? new Date())
      if (!r) return gone()
      const file = await deps.repo.getFile(r.fileId)
      if (!file) return gone()
      if (r.joined) await emit(file, who, 'joined', { role: r.role, via: 'link' })
      return { file: { id: file.id, name: file.name }, role: r.role, joined: r.joined }
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
      if (comment) await emit(got.file, req.identity!, 'comment', { reply: !!comment.parentId })
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

    // the one route that takes file bytes: its own, larger body limit
    api.put('/files/:id/content', { bodyLimit: deps.maxFileBytes }, async (req, reply) => {
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
      await emit(got.file, req.identity!, 'version', { version: v.version })
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

    // One earlier version's bytes; the desktop opens them as a copy, so nothing
    // anyone has open is overwritten.
    api.get('/files/:id/versions/:v/content', async (req, reply) => {
      const got = await fileFor(req, reply, 'read')
      if (!got) return
      const raw = (req.params as { v?: string }).v ?? ''
      const n = /^\d{1,9}$/.test(raw) ? Number(raw) : 0
      const v = n > 0 ? await deps.repo.version(got.file.id, n) : null
      const bytes = v ? await deps.blobs.get(v.blobKey) : null
      if (!v || !bytes) return reply.code(404).send({ error: 'That version is not here.' })
      return reply
        .header('content-type', 'application/octet-stream')
        .header('x-file-version', String(v.version))
        .header('x-file-sha256', v.sha256)
        .send(Buffer.from(bytes))
    })
  })

  return app
}
