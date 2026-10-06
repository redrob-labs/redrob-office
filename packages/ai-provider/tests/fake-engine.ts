/**
 * A fake `redrob-code serve` for tests, shaped after the real v0.0.12 routes recorded in
 * docs/engine-api.md. Only what Office calls is here.
 *
 * `onPrompt` scripts the model: it receives the posted body plus helpers to emit text
 * deltas on the event stream and to call a tool on a registered MCP server (exactly as
 * the real engine does, over HTTP JSON-RPC), and returns the final assistant message.
 */
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http'
import type { AddressInfo } from 'node:net'

export type FakePromptContext = {
  sessionId: string
  body: Record<string, unknown>
  signal: AbortSignal
  /** Emit a streamed text part the way the engine does (part.updated, deltas, part.updated). */
  text: (text: string) => void
  /** Call `<server>_<tool>` on a registered MCP server and return the text it answered. */
  callTool: (qualifiedName: string, args: Record<string, unknown>) => Promise<string>
  /** Tool names the engine would offer for this message after applying the tools map. */
  offeredTools: () => Promise<string[]>
}

export type FakeEngine = {
  baseUrl: string
  username: string
  password: string
  requests: { method: string; path: string; body: unknown }[]
  mcp: Map<string, { url: string; headers: Record<string, string> }>
  aborted: string[]
  /** Console routes the (requested) engine relay serves; empty = the relay does not exist yet */
  relayRoutes: Map<string, (body: unknown) => unknown>
  /** v1 `/auth/:id` store */
  v1Auth: Map<string, unknown>
  /** keys handed to the credential store, in order */
  keys: { integration: string; key: string; label?: string | undefined }[]
  onPrompt: (fn: (ctx: FakePromptContext) => Promise<Record<string, unknown>>) => void
  close: () => Promise<void>
}

function wildcard(pattern: string, name: string): boolean {
  const re = new RegExp(`^${pattern.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*')}$`)
  return re.test(name)
}

/** The engine applies the last matching rule of the tools map. */
export function toolAllowed(map: Record<string, boolean> | undefined, name: string): boolean {
  if (!map) return true
  let allowed = true
  for (const [pattern, on] of Object.entries(map)) if (wildcard(pattern, name)) allowed = on
  return allowed
}

async function readBody(req: IncomingMessage): Promise<unknown> {
  let raw = ''
  for await (const chunk of req) raw += chunk
  if (!raw) return undefined
  try {
    return JSON.parse(raw)
  } catch {
    return raw
  }
}

async function rpc(url: string, headers: Record<string, string>, method: string, params: unknown, id = 1) {
  const r = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json', accept: 'application/json, text/event-stream', ...headers },
    body: JSON.stringify({ jsonrpc: '2.0', id, method, params }),
  })
  const body = (await r.json()) as { result?: Record<string, unknown>; error?: { message: string } }
  if (body.error) throw new Error(body.error.message)
  return body.result ?? {}
}

export async function startFakeEngine(): Promise<FakeEngine> {
  const username = 'fake-user'
  const password = 'fake-pass'
  const expected = `Basic ${Buffer.from(`${username}:${password}`).toString('base64')}`
  const requests: FakeEngine['requests'] = []
  const mcp: FakeEngine['mcp'] = new Map()
  const aborted: string[] = []
  const keys: FakeEngine['keys'] = []
  const v1Auth = new Map<string, unknown>()
  const relayRoutes: FakeEngine['relayRoutes'] = new Map()
  const streams = new Set<ServerResponse>()
  const sessionAbort = new Map<string, AbortController>()
  let promptFn: (ctx: FakePromptContext) => Promise<Record<string, unknown>> = async () => ({
    info: { role: 'assistant', finish: 'stop' },
    parts: [],
  })
  let seq = 0
  const emit = (type: string, properties: Record<string, unknown>) => {
    const line = `data: ${JSON.stringify({ id: `evt_${++seq}`, type, properties })}\n\n`
    for (const s of streams) s.write(line)
  }

  const server: Server = createServer(async (req, res) => {
    const url = new URL(req.url ?? '/', 'http://x')
    const body = req.method === 'GET' ? undefined : await readBody(req)
    requests.push({ method: req.method ?? 'GET', path: url.pathname + url.search, body })
    if (req.headers.authorization !== expected) {
      res.writeHead(404).end()
      return
    }
    const send = (status: number, value: unknown) => {
      res.writeHead(status, { 'content-type': 'application/json' })
      res.end(JSON.stringify(value))
    }
    const location = { directory: url.searchParams.get('location[directory]') ?? '/fake', project: { id: 'global', directory: '/' } }
    const p = url.pathname
    if (p === '/global/health') return send(200, { healthy: true, version: '0.0.12' })
    if (p === '/api/model') {
      return send(200, {
        location,
        data: [
          {
            id: 'auto',
            providerID: 'redrob',
            name: 'Redrob Auto',
            capabilities: { tools: true, input: ['text'], output: ['text'] },
            request: { headers: {}, body: { apiKey: 'rrk_secret_should_never_leave' } },
            limit: { context: 1000000, output: 32000 },
            status: 'active',
            enabled: true,
          },
          {
            id: 'claude-sonnet-5',
            providerID: 'redrob',
            name: 'Claude Sonnet 5',
            capabilities: { tools: true, input: ['text', 'image'], output: ['text'] },
            limit: { context: 1000000, output: 32000 },
            enabled: true,
          },
        ],
      })
    }
    if (p === '/api/integration') {
      return send(200, {
        location,
        data: [
          {
            id: 'redrob',
            name: 'Redrob Code',
            methods: [{ type: 'key', label: 'Redrob API key' }, { type: 'env', names: ['REDROB_API_KEY'] }],
            connections: [],
          },
        ],
      })
    }
    if (p.startsWith('/api/console/relay/')) {
      const route = p.slice('/api/console/relay'.length)
      const answer = relayRoutes.get(route)
      if (!answer) return send(404, { name: 'NotFound' })
      return send(200, answer(body))
    }
    if (p === '/provider/auth') {
      return send(200, {
        redrob: [{ type: 'oauth', label: 'Connect Redrob' }, { type: 'api', label: 'Paste an API key' }],
        'github-copilot': [{ type: 'oauth', label: 'Login with GitHub Copilot', prompts: [{ type: 'select', key: 'deploymentType', message: 'Type', options: [{ label: 'GitHub.com', value: 'github.com' }] }] }],
        xai: [{ type: 'api', label: 'Manually enter API Key' }],
      })
    }
    if (p === '/provider') return send(200, { all: [], default: {}, connected: ['redrob', ...v1Auth.keys()] })
    const v1 = /^\/auth\/([^/]+)$/.exec(p)
    if (v1 && req.method === 'PUT') {
      v1Auth.set(decodeURIComponent(v1[1]!), body)
      return send(200, true)
    }
    if (v1 && req.method === 'DELETE') {
      const had = v1Auth.delete(decodeURIComponent(v1[1]!))
      return had ? send(200, true) : send(404, { name: 'NotFound' })
    }
    const oauth = /^\/provider\/([^/]+)\/oauth\/(authorize|callback)$/.exec(p)
    if (oauth && req.method === 'POST') {
      if (oauth[2] === 'authorize') return send(200, { url: 'https://example.test/device', method: 'auto', instructions: 'Enter code ABCD' })
      v1Auth.set(decodeURIComponent(oauth[1]!), { type: 'oauth' })
      return send(200, true)
    }
    const connectKey = /^\/api\/integration\/([^/]+)\/connect\/key$/.exec(p)
    if (connectKey && req.method === 'POST') {
      const b = body as { key?: string; label?: string }
      if (!b?.key) return send(400, { name: 'BadRequest' })
      keys.push({ integration: decodeURIComponent(connectKey[1]!), key: b.key, label: b.label })
      return send(200, { location, data: true })
    }
    if (p === '/session' && req.method === 'POST') {
      const id = `ses_${++seq}`
      emit('session.created', { sessionID: id, info: { id } })
      return send(200, { id, title: 'New session' })
    }
    const abortMatch = /^\/session\/([^/]+)\/abort$/.exec(p)
    if (abortMatch && req.method === 'POST') {
      aborted.push(abortMatch[1]!)
      sessionAbort.get(abortMatch[1]!)?.abort()
      return send(200, true)
    }
    const msgMatch = /^\/session\/([^/]+)\/message$/.exec(p)
    if (msgMatch && req.method === 'POST') {
      const sessionId = msgMatch[1]!
      const ac = new AbortController()
      sessionAbort.set(sessionId, ac)
      const messageID = `msg_${++seq}`
      // the real engine announces the user message and then the assistant message
      emit('message.updated', { sessionID: sessionId, info: { id: `msg_${++seq}`, role: 'user', sessionID: sessionId } })
      emit('message.updated', { sessionID: sessionId, info: { id: messageID, role: 'assistant', sessionID: sessionId } })
      const b = (body ?? {}) as Record<string, unknown>
      const tools = b.tools as Record<string, boolean> | undefined
      const ctx: FakePromptContext = {
        sessionId,
        body: b,
        signal: ac.signal,
        text: (text) => {
          const partID = `prt_${++seq}`
          emit('message.part.updated', { sessionID: sessionId, part: { id: partID, messageID, sessionID: sessionId, type: 'text', text: '' } })
          for (const ch of text.match(/.{1,4}/gs) ?? []) {
            emit('message.part.delta', { sessionID: sessionId, messageID, partID, field: 'text', delta: ch })
          }
          emit('message.part.updated', { sessionID: sessionId, part: { id: partID, messageID, sessionID: sessionId, type: 'text', text } })
        },
        offeredTools: async () => {
          const names: string[] = []
          for (const [server, cfg] of mcp) {
            const listed = await rpc(cfg.url, cfg.headers, 'tools/list', {})
            for (const t of (listed.tools as { name: string }[]) ?? []) {
              const q = `${server}_${t.name}`
              if (toolAllowed(tools, q)) names.push(q)
            }
          }
          return names
        },
        callTool: async (qualifiedName, args) => {
          for (const [server, cfg] of mcp) {
            if (!qualifiedName.startsWith(`${server}_`)) continue
            if (!toolAllowed(tools, qualifiedName)) throw new Error(`tool not allowed: ${qualifiedName}`)
            const callID = `call_${++seq}`
            emit('message.part.updated', {
              sessionID: sessionId,
              part: { type: 'tool', tool: qualifiedName, callID, state: { status: 'running', input: args } },
            })
            const result = await rpc(cfg.url, cfg.headers, 'tools/call', {
              name: qualifiedName.slice(server.length + 1),
              arguments: args,
            })
            const content = (result.content as { type: string; text?: string }[]) ?? []
            const text = content.map((c) => c.text ?? '').join('')
            emit('message.part.updated', {
              sessionID: sessionId,
              part: { type: 'tool', tool: qualifiedName, callID, state: { status: result.isError ? 'error' : 'completed', input: args, output: text } },
            })
            return text
          }
          throw new Error(`no MCP server for ${qualifiedName}`)
        },
      }
      try {
        const result = await promptFn(ctx)
        emit('session.idle', { sessionID: sessionId })
        return send(200, result)
      } catch (e) {
        emit('session.error', { sessionID: sessionId, error: { name: 'UnknownError', data: { message: String(e) } } })
        return send(500, { name: 'UnknownError', data: { message: 'Unexpected server error.' } })
      } finally {
        sessionAbort.delete(sessionId)
      }
    }
    if (p === '/mcp' && req.method === 'POST') {
      const b = body as { name: string; config: { url: string; headers?: Record<string, string> } }
      const headers = b.config.headers ?? {}
      try {
        await rpc(b.config.url, headers, 'initialize', { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'fake', version: '1' } })
        mcp.set(b.name, { url: b.config.url, headers })
        return send(200, Object.fromEntries([...mcp.keys()].map((k) => [k, { status: 'connected' }])))
      } catch (e) {
        return send(200, { [b.name]: { status: 'failed', error: String(e) } })
      }
    }
    const disc = /^\/mcp\/([^/]+)\/disconnect$/.exec(p)
    if (disc && req.method === 'POST') {
      mcp.delete(decodeURIComponent(disc[1]!))
      return send(200, true)
    }
    if (p === '/event') {
      res.writeHead(200, { 'content-type': 'text/event-stream' })
      res.write(`data: ${JSON.stringify({ type: 'server.connected', properties: {} })}\n\n`)
      streams.add(res)
      req.on('close', () => streams.delete(res))
      return
    }
    send(404, { name: 'NotFound' })
  })
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r))
  const port = (server.address() as AddressInfo).port
  return {
    baseUrl: `http://127.0.0.1:${port}`,
    username,
    password,
    requests,
    mcp,
    aborted,
    keys,
    v1Auth,
    relayRoutes,
    onPrompt: (fn) => {
      promptFn = fn
    },
    close: async () => {
      for (const s of streams) s.end()
      server.closeAllConnections()
      await new Promise<void>((r) => server.close(() => r()))
    },
  }
}
