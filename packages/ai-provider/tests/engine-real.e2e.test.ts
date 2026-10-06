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

describe.skipIf(!enabled)('real engine', () => {
  beforeAll(async () => {
    const username = randomUUID()
    const password = randomUUID()
    child = spawn(binary, ['serve', '--hostname', '127.0.0.1', '--port', '0'], {
      cwd: mkdtempSync(join(tmpdir(), 'engine-e2e-')),
      env: { ...process.env, REDROB_CONFIG_CONTENT: JSON.stringify(officeEngineConfig()), REDROB_SERVER_USERNAME: username, REDROB_SERVER_PASSWORD: password },
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
