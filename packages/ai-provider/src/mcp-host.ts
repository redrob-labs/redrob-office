/**
 * A minimal Model Context Protocol server Office hosts on loopback for one engine run.
 *
 * The engine (docs/engine-api.md) is the MCP client: it connects, lists tools and calls
 * them over streamable-HTTP JSON-RPC, and accepts a plain `application/json` answer. The
 * host does not execute anything itself. A `tools/call` is handed to `onCall`, which
 * resolves whenever Office has run the tool, possibly minutes later after the person
 * reviewed an edit, and the HTTP answer is held open until then.
 *
 * Bound to 127.0.0.1 with a random bearer token minted per run, so nothing else on the
 * machine can call Office's document tools through it.
 */
import { randomBytes } from 'node:crypto'
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http'
import type { AddressInfo } from 'node:net'

import type { AgentToolDef } from '@genoffice/agent-core'

export type McpToolResult = { output: string; isError?: boolean }

export type McpHost = {
  url: string
  /** Header the engine must send; passed to `POST /mcp` as `headers`. */
  headers: Record<string, string>
  close: () => Promise<void>
}

const MAX_BODY = 8 * 1024 * 1024

/** MCP wants an object schema; agent-core tools already are, but be defensive. */
function schemaOf(tool: AgentToolDef): Record<string, unknown> {
  const s = tool.inputSchema
  if (s && typeof s === 'object' && s.type === 'object') return s
  return { type: 'object', properties: {}, additionalProperties: true }
}

export async function startMcpHost(
  tools: AgentToolDef[],
  onCall: (name: string, input: Record<string, unknown>) => Promise<McpToolResult>,
): Promise<McpHost> {
  const token = randomBytes(24).toString('hex')
  const names = new Set(tools.map((t) => t.name))
  const listed = tools.map((t) => ({ name: t.name, description: t.description, inputSchema: schemaOf(t) }))

  const handle = async (req: IncomingMessage, res: ServerResponse) => {
    if (req.headers.authorization !== `Bearer ${token}`) {
      res.writeHead(401).end()
      return
    }
    if (req.method === 'GET') {
      // no server-initiated stream: tell the client to use plain POST answers
      res.writeHead(405).end()
      return
    }
    if (req.method === 'DELETE') {
      res.writeHead(200).end()
      return
    }
    if (req.method !== 'POST') {
      res.writeHead(405).end()
      return
    }
    let raw = ''
    for await (const chunk of req) {
      raw += chunk
      if (raw.length > MAX_BODY) {
        res.writeHead(413).end()
        return
      }
    }
    let msg: { id?: unknown; method?: unknown; params?: Record<string, unknown> }
    try {
      msg = JSON.parse(raw) as typeof msg
    } catch {
      res.writeHead(400, { 'content-type': 'application/json' })
      res.end(JSON.stringify({ jsonrpc: '2.0', id: null, error: { code: -32700, message: 'Parse error' } }))
      return
    }
    // notifications (no id) get an empty 202
    if (msg.id === undefined || msg.id === null) {
      res.writeHead(202).end()
      return
    }
    const reply = (body: Record<string, unknown>) => {
      if (res.writableEnded) return
      res.writeHead(200, { 'content-type': 'application/json' })
      res.end(JSON.stringify({ jsonrpc: '2.0', id: msg.id, ...body }))
    }
    switch (msg.method) {
      case 'initialize':
        return reply({
          result: {
            protocolVersion: typeof msg.params?.protocolVersion === 'string' ? msg.params.protocolVersion : '2025-06-18',
            capabilities: { tools: { listChanged: false } },
            serverInfo: { name: 'redrob-office', version: '1' },
          },
        })
      case 'ping':
        return reply({ result: {} })
      case 'tools/list':
        return reply({ result: { tools: listed } })
      case 'tools/call': {
        const name = typeof msg.params?.name === 'string' ? msg.params.name : ''
        if (!names.has(name)) return reply({ error: { code: -32602, message: `Unknown tool: ${name}` } })
        const args = msg.params?.arguments
        const input = args && typeof args === 'object' && !Array.isArray(args) ? (args as Record<string, unknown>) : {}
        try {
          const result = await onCall(name, input)
          return reply({ result: { content: [{ type: 'text', text: result.output }], isError: result.isError === true } })
        } catch (e) {
          return reply({ result: { content: [{ type: 'text', text: e instanceof Error ? e.message : String(e) }], isError: true } })
        }
      }
      default:
        return reply({ error: { code: -32601, message: 'Method not found' } })
    }
  }

  const server: Server = createServer((req, res) => {
    handle(req, res).catch(() => {
      if (!res.headersSent) res.writeHead(500)
      res.end()
    })
  })
  // a held tool call can legitimately wait minutes for the person
  server.requestTimeout = 0
  server.headersTimeout = 60_000
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject)
    server.listen(0, '127.0.0.1', () => resolve())
  })
  const { port } = server.address() as AddressInfo
  return {
    url: `http://127.0.0.1:${port}/mcp`,
    headers: { authorization: `Bearer ${token}` },
    close: () =>
      new Promise<void>((resolve) => {
        server.closeAllConnections()
        server.close(() => resolve())
      }),
  }
}
