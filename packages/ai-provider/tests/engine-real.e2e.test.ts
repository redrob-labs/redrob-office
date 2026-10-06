/**
 * End to end against the real `redrob-code` binary and the person's own Redrob
 * credential. Off unless REDROB_ENGINE_E2E=1, because it makes real model calls.
 *
 *   REDROB_ENGINE_E2E=1 REDROB_ENGINE_BINARY=<path> pnpm --filter @genoffice/ai-provider test engine-real
 */
import { spawn, type ChildProcess } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { existsSync, mkdtempSync } from 'node:fs'
import { homedir, tmpdir } from 'node:os'
import { join } from 'node:path'
import { deflateSync } from 'node:zlib'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import type { AgentMessage, AgentToolCall } from '@genoffice/agent-core'

import { officeEngineConfig } from '../src/engine-client'
import { engineStream, setEngineTargetProvider } from '../src/engine-turn'

const exe = process.platform === 'win32' ? 'redrob-code.exe' : 'redrob-code'
const binary =
  process.env.REDROB_ENGINE_BINARY ??
  (process.platform === 'win32'
    ? join(process.env.LOCALAPPDATA ?? join(homedir(), 'AppData', 'Local'), 'Redrob', 'bin', exe)
    : join(homedir(), '.redrob', 'bin', exe))
const enabled = process.env.REDROB_ENGINE_E2E === '1' && existsSync(binary)

let child: ChildProcess | null = null

/** A solid-colour PNG, base64, built by hand so the colour is exact. */
function solidPng(w: number, h: number, [r, g, b]: [number, number, number]): string {
  const crcTable = Array.from({ length: 256 }, (_, n) => {
    let c = n
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    return c >>> 0
  })
  const crc = (buf: Buffer) => {
    let c = 0xffffffff
    for (const byte of buf) c = crcTable[(c ^ byte) & 0xff]! ^ (c >>> 8)
    return (c ^ 0xffffffff) >>> 0
  }
  const chunk = (type: string, data: Buffer) => {
    const len = Buffer.alloc(4)
    len.writeUInt32BE(data.length)
    const body = Buffer.concat([Buffer.from(type, 'ascii'), data])
    const sum = Buffer.alloc(4)
    sum.writeUInt32BE(crc(body))
    return Buffer.concat([len, body, sum])
  }
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(w, 0)
  ihdr.writeUInt32BE(h, 4)
  ihdr.set([8, 2, 0, 0, 0], 8)
  const row = Buffer.concat([Buffer.from([0]), Buffer.from(Array.from({ length: w }, () => [r, g, b]).flat())])
  const raw = Buffer.concat(Array.from({ length: h }, () => row))
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ]).toString('base64')
}

describe.skipIf(!enabled)('real engine', () => {
  beforeAll(async () => {
    const username = randomUUID()
    const password = randomUUID()
    child = spawn(binary, ['serve', '--hostname', '127.0.0.1', '--port', '0'], {
      cwd: mkdtempSync(join(tmpdir(), 'engine-e2e-')),
      env: { ...process.env, REDROB_CONFIG_CONTENT: JSON.stringify(officeEngineConfig(['auto', 'claude-sonnet-5', 'claude-opus-5', 'gpt-5.6-sol'])), REDROB_SERVER_USERNAME: username, REDROB_SERVER_PASSWORD: password },
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true,
    })
    const baseUrl = await new Promise<string>((resolve, reject) => {
      let out = ''
      child!.stdout!.on('data', (c) => {
        out += String(c)
        const m = /redrob server listening on (\S+)/.exec(out)
        if (m) resolve(m[1]!)
      })
      setTimeout(() => reject(new Error('engine did not start')), 20000)
    })
    setEngineTargetProvider(async () => ({ baseUrl, username, password }))
  })
  afterAll(() => {
    setEngineTargetProvider(null)
    child?.kill()
  })

  it('passes an attached image through to the model', async () => {
    const red = solidPng(32, 32, [255, 0, 0])
    let text = ''
    await engineStream(process.env.REDROB_E2E_VISION_MODEL ?? 'redrob/auto', 'Answer in one word.', [{ role: 'user', text: 'What colour is this image?', images: [{ base64: red, mime: 'image/png' }] }], [], {
      signal: new AbortController().signal,
      onDelta: (t) => (text += t),
      onToolCall: () => undefined,
    })
    console.log('[e2e] image answer:', text)
    expect(text.toLowerCase()).toContain('red')
  }, 120_000)

  it('runs an Office tool through the engine and answers from its result, across a slow tool', async () => {
    const tools = [
      {
        name: 'count_words',
        description: 'Count the words in the open document. Always use this to answer word-count questions.',
        inputSchema: { type: 'object', properties: {}, additionalProperties: false },
      },
    ]
    const history: AgentMessage[] = [{ role: 'user', text: 'How many words are in my document? Use the tool.' }]
    let text = ''
    for (let step = 0; step < 4; step++) {
      const calls: AgentToolCall[] = []
      await engineStream('redrob/auto', 'You help edit a document.', history, tools, {
        signal: new AbortController().signal,
        onDelta: (t) => (text += t),
        onToolCall: (c) => calls.push(c),
      })
      if (!calls.length) break
      history.push({ role: 'assistant', text: '', toolCalls: calls })
      // a person reviewing an edit takes a while; the held MCP call must survive it
      await new Promise((r) => setTimeout(r, 20_000))
      history.push({ role: 'tool', results: calls.map((c) => ({ id: c.id, name: c.name, output: 'The document has 4217 words.' })) })
    }
    expect(history.some((m) => m.role === 'tool')).toBe(true)
    expect(text).toMatch(/4,?217/)
  }, 180_000)
})
