/**
 * Office turns on the Redrob engine.
 *
 * agent-core drives its own loop: it asks the transport for one model turn, gets text and
 * tool calls back, executes the tools in the editor (rollback snapshots, edit queue), and
 * asks again with the results. The engine (docs/engine-api.md) also wants to drive the
 * loop: one posted message runs the model, calls tools and runs the model again until it
 * is done.
 *
 * The two meet in an engine "run", a coroutine that lives across several agent-core turns:
 *
 *   1. The first `stream()` of a request starts a run. It hosts this turn's tools as a
 *      loopback MCP server, registers it with the engine, opens a session and posts the
 *      message with `{ "*": false, "<server>_*": true }`, so the engine offers this run's
 *      tools and nothing else (none of its own built-ins and no other run's tools).
 *   2. Text deltas from the engine's event stream go to `onDelta`.
 *   3. When the engine calls a tool, the MCP answer is held open. The call is handed to
 *      agent-core through `onToolCall` with an id that names the run, and this `stream()`
 *      ends with stop reason `tool_use`.
 *   4. agent-core runs the tool and calls `stream()` again, its last message carrying the
 *      results. The ids lead back to the run, the held MCP answers are released, and the
 *      engine carries on: more text, more tool calls, or the end of the turn.
 *
 * So the engine makes every model call with the credential it holds, Office names a model
 * and never sees a key, and Office's tools keep their own execution rules.
 *
 * A request that cannot be resumed (a restored conversation, a run that timed out) starts a
 * new run with the earlier conversation written into the prompt. A failure is a visible
 * failure: nothing here falls back to calling a provider directly.
 */
import { randomBytes } from 'node:crypto'

import type { AgentMessage, AgentToolCall, AgentToolDef } from '@genoffice/agent-core'

import { AiAuthError } from './auth-error'
import { EngineClient, EngineError, OFFICE_AGENT, splitModelId, type EnginePromptPart } from './engine-client'
import { DEFAULT_ENGINE_MODEL } from './engine-model'
import type { EngineTarget } from './engine-integration'
import { startMcpHost, type McpHost, type McpToolResult } from './mcp-host'
import type { StreamCallbacks } from './protocols/shared'
import type { AiTurnUsage } from './types'

export { DEFAULT_ENGINE_MODEL } from './engine-model'

/** How long a run waits for agent-core to come back with tool results before it gives up. */
export const ENGINE_RUN_IDLE_MS = 15 * 60_000

/** Parallel tool calls arriving within this window end the same agent-core turn. */
const BATCH_MS = 120

/** History entries are clipped so a long tool output cannot swamp a restarted run. */
const HISTORY_CLIP = 4_000

const ID_PREFIX = 'eng_'

export class EngineUnavailableError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options)
    this.name = 'EngineUnavailableError'
  }
}

export type EngineTargetProvider = () => Promise<EngineTarget>

// Kept on globalThis: the shell bundles each editor's main process, and a second copy of
// this module in one bundle must still find the engine the shell installed.
const SLOT = Symbol.for('redrob.office.engineTargetProvider')
type Slot = { [SLOT]?: EngineTargetProvider | null }

function currentProvider(): EngineTargetProvider | null {
  return (globalThis as Slot)[SLOT] ?? null
}

/**
 * Where the engine is. The shell installs this once at startup; outside the suite there
 * is none, and a turn fails with that said plainly.
 */
export function setEngineTargetProvider(provider: EngineTargetProvider | null): void {
  ;(globalThis as Slot)[SLOT] = provider
}

/** What the person sees when the engine cannot run the turn. Names no vendor. */
export function engineUnavailableMessage(detail?: string): string {
  const d = detail?.trim()
  return d
    ? `Redrob could not run this reply (${d}). Check the Redrob engine in Settings, then try again.`
    : 'Redrob could not run this reply. Check the Redrob engine in Settings, then try again.'
}

/**
 * The engine target the shell installed, started if needed. Main-process only. Throws
 * an EngineUnavailableError with the reason, like a turn would.
 */
export async function currentEngineTarget(): Promise<EngineTarget> {
  const provider = currentProvider()
  if (!provider) throw new EngineUnavailableError(engineUnavailableMessage('the Redrob engine is not available in this window'))
  try {
    return await provider()
  } catch (e) {
    const why = e instanceof Error ? e.message : String(e)
    throw new EngineUnavailableError(engineUnavailableMessage(`the engine did not start: ${why.split('\n')[0]}`), { cause: e })
  }
}

async function clientFor(): Promise<EngineClient> {
  const targetProvider = currentProvider()
  if (!targetProvider) throw new EngineUnavailableError(engineUnavailableMessage('the Redrob engine is not available in this window'))
  let target: EngineTarget
  try {
    target = await targetProvider()
  } catch (e) {
    const why = e instanceof Error ? e.message : String(e)
    throw new EngineUnavailableError(engineUnavailableMessage(`the engine did not start: ${why.split('\n')[0]}`), { cause: e })
  }
  return new EngineClient(target)
}

// ---- transcript ----

function clip(text: string, max = HISTORY_CLIP): string {
  return text.length > max ? `${text.slice(0, max)}\n[... ${text.length - max} more characters]` : text
}

function describe(message: AgentMessage): string {
  if (message.role === 'user') return `User: ${message.text}`
  if (message.role === 'assistant') {
    const calls = (message.toolCalls ?? []).map((c) => `[called ${c.name} ${clip(JSON.stringify(c.input ?? {}), 600)}]`)
    return [`Assistant: ${message.text}`.trimEnd(), ...calls].join('\n')
  }
  return message.results.map((r) => `Result of ${r.name}${r.isError ? ' (error)' : ''}: ${clip(r.output)}`).join('\n')
}

/**
 * The prompt for a fresh run. The engine session starts empty, so what came before is
 * written in as context; the newest user message is the request.
 */
export function transcriptParts(messages: AgentMessage[]): EnginePromptPart[] {
  let last = -1
  for (let i = messages.length - 1; i >= 0; i--) {
    if (messages[i]!.role === 'user') {
      last = i
      break
    }
  }
  if (last < 0) return [{ type: 'text', text: messages.map(describe).join('\n\n') || '(empty)' }]
  const request = messages[last] as Extract<AgentMessage, { role: 'user' }>
  const before = messages.slice(0, last)
  const after = messages.slice(last + 1)
  const blocks: string[] = []
  if (before.length) blocks.push(`<conversation_history>\n${before.map(describe).join('\n\n')}\n</conversation_history>`)
  blocks.push(after.length ? `<request>\n${request.text}\n</request>` : request.text)
  if (after.length) {
    blocks.push(`<progress>\n${after.map(describe).join('\n\n')}\n</progress>\nContinue the request from where the progress ends.`)
  }
  const parts: EnginePromptPart[] = [{ type: 'text', text: blocks.join('\n\n') }]
  for (const image of request.images ?? []) {
    parts.push({ type: 'file', mime: image.mime, url: `data:${image.mime};base64,${image.base64}` })
  }
  return parts
}

// ---- errors from the engine's answer ----

type EngineMessageError = { name?: unknown; data?: { message?: unknown; statusCode?: unknown } }

export function engineErrorOf(error: unknown): Error | null {
  if (!error || typeof error !== 'object') return null
  const e = error as EngineMessageError
  const name = typeof e.name === 'string' ? e.name : 'UnknownError'
  const message = typeof e.data?.message === 'string' ? e.data.message : name
  const status = typeof e.data?.statusCode === 'number' ? e.data.statusCode : undefined
  if (name === 'MessageAbortedError') return null
  if (name === 'ProviderAuthError' || status === 401 || status === 403) {
    return new AiAuthError(`Redrob could not sign in to the model provider: ${message}`, status)
  }
  return new Error(engineUnavailableMessage(message.slice(0, 300)))
}

/** The engine's message info → what the turn used. The model it names wins over the one asked for. */
export function usageOf(info: unknown, asked: string): AiTurnUsage | null {
  if (!info || typeof info !== 'object') return null
  const i = info as { providerID?: unknown; modelID?: unknown; cost?: unknown; tokens?: { input?: unknown; output?: unknown } }
  const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : 0)
  const model = typeof i.providerID === 'string' && typeof i.modelID === 'string' ? `${i.providerID}/${i.modelID}` : asked
  return { model, inputTokens: num(i.tokens?.input), outputTokens: num(i.tokens?.output), cost: num(i.cost) }
}

// ---- runs ----

type HeldCall = { call: AgentToolCall; release: (result: McpToolResult) => void }

type Waiter = {
  cb: StreamCallbacks
  resolve: () => void
  reject: (e: unknown) => void
}

const runs = new Map<string, EngineRun>()

/** Runs alive right now, for tests and diagnostics. */
export function activeEngineRuns(): number {
  return runs.size
}

class EngineRun {
  readonly id = randomBytes(6).toString('hex')
  private readonly mcpName = `o${this.id}`
  private host: McpHost | null = null
  private sessionId: string | null = null
  private readonly held = new Map<string, HeldCall>()
  private batch: AgentToolCall[] = []
  private batchTimer: ReturnType<typeof setTimeout> | null = null
  private idleTimer: ReturnType<typeof setTimeout> | null = null
  private waiter: Waiter | null = null
  private bufferedText = ''
  private seq = 0
  private finished = false
  private readonly eventsAbort = new AbortController()
  private readonly partType = new Map<string, string>()
  private readonly streamed = new Map<string, number>()
  private readonly assistantMessages = new Set<string>()
  private lastError: Error | null = null
  private idle = false

  constructor(private readonly client: EngineClient) {}

  ownsCall(id: string): boolean {
    return this.held.has(id)
  }

  /** Begin: tools as MCP, a session, the message. Resolves when the first turn yields. */
  private model = DEFAULT_ENGINE_MODEL

  async start(model: string, system: string, messages: AgentMessage[], tools: AgentToolDef[], cb: StreamCallbacks): Promise<void> {
    runs.set(this.id, this)
    this.model = model || DEFAULT_ENGINE_MODEL
    const yielded = this.attach(cb)
    try {
      if (tools.length) {
        this.host = await startMcpHost(tools, (name, input) => this.onCall(name, input))
        const status = await this.client.addMcp(this.mcpName, this.host.url, this.host.headers)
        if (status !== 'connected') throw new EngineUnavailableError(engineUnavailableMessage(`the engine could not reach Office's tools (${status})`))
      }
      this.sessionId = await this.client.createSession('Redrob Office')
      void this.watchEvents()
      const toolMap: Record<string, boolean> = { '*': false }
      if (tools.length) toolMap[`${this.mcpName}_*`] = true
      const promptBody = {
        model: splitModelId(model || DEFAULT_ENGINE_MODEL),
        agent: OFFICE_AGENT,
        ...(system.trim() ? { system } : {}),
        tools: toolMap,
        parts: transcriptParts(messages),
      }
      // not awaited: the run outlives this call
      void this.client.prompt(this.sessionId, promptBody).then(
        (result) => this.complete(result),
        (e) => this.fail(e),
      )
    } catch (e) {
      this.fail(e)
    }
    return yielded
  }

  /** Continue: hand the results to the held MCP calls and wait for the next yield. */
  resume(messages: AgentMessage[], cb: StreamCallbacks): Promise<void> {
    const yielded = this.attach(cb)
    const last = messages[messages.length - 1]
    if (last?.role === 'tool') {
      for (const result of last.results) {
        const held = this.held.get(result.id)
        if (!held) continue
        this.held.delete(result.id)
        held.release({ output: result.output, isError: result.isError === true })
      }
    }
    // a call agent-core did not answer must not hang the engine forever
    for (const [id, held] of this.held) {
      this.held.delete(id)
      held.release({ output: 'This tool call was not run.', isError: true })
    }
    return yielded
  }

  private attach(cb: StreamCallbacks): Promise<void> {
    this.clearIdle()
    return new Promise<void>((resolve, reject) => {
      this.waiter = { cb, resolve, reject }
      if (cb.signal.aborted) return this.abort()
      // only the turn that is waiting may stop the run; a stale signal from a turn that
      // already yielded must not kill the run agent-core is about to resume
      cb.signal.addEventListener('abort', () => {
        if (this.waiter?.cb === cb) this.abort()
      }, { once: true })
      if (this.bufferedText) {
        cb.onDelta(this.bufferedText)
        this.bufferedText = ''
      }
    })
  }

  private emitText(text: string, reasoning: boolean) {
    if (!text) return
    const w = this.waiter
    if (!w) {
      if (!reasoning) this.bufferedText += text
      return
    }
    w.cb.onActivity?.()
    if (reasoning) w.cb.onReasoningDelta?.(text)
    else w.cb.onDelta(text)
  }

  private onCall(name: string, input: Record<string, unknown>): Promise<McpToolResult> {
    return new Promise<McpToolResult>((release) => {
      if (this.finished) return release({ output: 'The run has ended.', isError: true })
      const call: AgentToolCall = { id: `${ID_PREFIX}${this.id}_${++this.seq}`, name, input }
      this.held.set(call.id, { call, release })
      this.batch.push(call)
      if (this.batchTimer) clearTimeout(this.batchTimer)
      this.batchTimer = setTimeout(() => this.flushBatch(), BATCH_MS)
    })
  }

  private flushBatch() {
    this.batchTimer = null
    const w = this.waiter
    if (!w || !this.batch.length) return
    const calls = this.batch
    this.batch = []
    this.waiter = null
    for (const call of calls) w.cb.onToolCall(call)
    w.cb.onStopReason?.('tool_use')
    this.armIdle()
    w.resolve()
  }

  private armIdle() {
    this.clearIdle()
    this.idleTimer = setTimeout(() => this.abort(), ENGINE_RUN_IDLE_MS)
    this.idleTimer.unref?.()
  }

  private clearIdle() {
    if (this.idleTimer) clearTimeout(this.idleTimer)
    this.idleTimer = null
  }

  private async watchEvents() {
    try {
      for await (const event of this.client.events(this.eventsAbort.signal)) {
        const p = event.properties
        if (p.sessionID !== this.sessionId) continue
        if (event.type === 'message.updated') {
          const info = p.info as { id?: unknown; role?: unknown } | undefined
          if (info?.role === 'assistant' && typeof info.id === 'string') this.assistantMessages.add(info.id)
        } else if (event.type === 'message.part.updated') {
          const part = p.part as { id?: unknown; type?: unknown; text?: unknown; messageID?: unknown } | undefined
          if (!part || typeof part.id !== 'string' || typeof part.type !== 'string') continue
          this.partType.set(part.id, part.type)
          if ((part.type === 'text' || part.type === 'reasoning') && typeof part.text === 'string' && this.isAssistant(part.messageID)) {
            // a provider that does not stream still ends with the whole text here
            const sent = this.streamed.get(part.id) ?? 0
            if (part.text.length > sent) {
              this.streamed.set(part.id, part.text.length)
              this.emitText(part.text.slice(sent), part.type === 'reasoning')
            }
          }
        } else if (event.type === 'message.part.delta') {
          if (p.field !== 'text' || typeof p.delta !== 'string' || typeof p.partID !== 'string') continue
          if (!this.isAssistant(p.messageID)) continue
          const type = this.partType.get(p.partID) ?? 'text'
          if (type !== 'text' && type !== 'reasoning') continue
          this.streamed.set(p.partID, (this.streamed.get(p.partID) ?? 0) + p.delta.length)
          this.emitText(p.delta, type === 'reasoning')
        } else if (event.type === 'session.error') {
          this.lastError = engineErrorOf(p.error)
        } else if (event.type === 'session.idle') {
          this.idle = true
        }
      }
    } catch {
      // the stream ends on abort or when the engine stops; the prompt answer decides the outcome
    }
  }

  private isAssistant(messageID: unknown): boolean {
    // user parts are echoed as part.updated too; only assistant text is the model's
    return typeof messageID === 'string' && this.assistantMessages.has(messageID)
  }

  /**
   * The HTTP answer can overtake the last events on the stream. Wait for `session.idle`
   * (or a short grace) so the final text deltas land on the turn that owns them.
   */
  private async drained(): Promise<void> {
    const deadline = Date.now() + 750
    while (!this.idle && Date.now() < deadline) await new Promise((r) => setTimeout(r, 15))
  }

  private complete(result: Record<string, unknown>) {
    if (this.finished) return
    void this.drained().then(() => this.finish(result))
  }

  private finish(result: Record<string, unknown>) {
    if (this.finished) return
    const info = (result.info ?? {}) as { error?: unknown; finish?: unknown }
    const error = engineErrorOf(info.error)
    if (error) return this.fail(error)
    // text the event stream missed still reaches the person
    for (const part of (result.parts as { id?: unknown; type?: unknown; text?: unknown }[] | undefined) ?? []) {
      if (part.type !== 'text' || typeof part.text !== 'string' || typeof part.id !== 'string') continue
      const sent = this.streamed.get(part.id) ?? 0
      if (part.text.length > sent) {
        this.streamed.set(part.id, part.text.length)
        this.emitText(part.text.slice(sent), false)
      }
    }
    const w = this.waiter
    const finish = typeof info.finish === 'string' ? info.finish : 'stop'
    void this.teardown()
    if (w) {
      const usage = usageOf(result.info, this.model)
      if (usage) w.cb.onUsage?.(usage)
      this.waiter = null
      w.cb.onStopReason?.(finish === 'length' ? 'max_tokens' : finish === 'tool-calls' ? 'stop' : finish)
      w.resolve()
    }
  }

  private fail(e: unknown) {
    if (this.finished) return
    let error: unknown = e
    if (e instanceof EngineError) {
      error = this.lastError ?? (e.status === 401 ? new EngineUnavailableError(engineUnavailableMessage('the engine rejected Office')) : new EngineUnavailableError(engineUnavailableMessage(e.message)))
    }
    const w = this.waiter
    this.waiter = null
    void this.teardown()
    w?.reject(error)
  }

  abort() {
    if (this.finished) return
    const w = this.waiter
    this.waiter = null
    const session = this.sessionId
    if (session) void this.client.abort(session).catch(() => undefined)
    void this.teardown()
    w?.reject(Object.assign(new Error('aborted'), { name: 'AbortError' }))
  }

  private async teardown() {
    if (this.finished) return
    this.finished = true
    runs.delete(this.id)
    this.clearIdle()
    if (this.batchTimer) clearTimeout(this.batchTimer)
    for (const held of this.held.values()) held.release({ output: 'The run has ended.', isError: true })
    this.held.clear()
    this.eventsAbort.abort()
    if (this.host) {
      await this.client.disconnectMcp(this.mcpName).catch(() => undefined)
      await this.host.close().catch(() => undefined)
    }
    if (this.sessionId) await this.client.deleteSession(this.sessionId).catch(() => undefined)
  }
}

function runFor(messages: AgentMessage[]): EngineRun | undefined {
  const last = messages[messages.length - 1]
  if (last?.role !== 'tool') return undefined
  for (const result of last.results) {
    if (!result.id.startsWith(ID_PREFIX)) continue
    for (const run of runs.values()) if (run.ownsCall(result.id)) return run
  }
  return undefined
}

/**
 * One agent-core model turn on the engine. Same contract as the old direct transport:
 * text through `onDelta`, tool calls through `onToolCall`, the stop reason through
 * `onStopReason`, and a rejection for a failure.
 */
export async function engineStream(
  model: string,
  system: string,
  messages: AgentMessage[],
  tools: AgentToolDef[],
  cb: StreamCallbacks,
): Promise<void> {
  const resumable = runFor(messages)
  if (resumable) return resumable.resume(messages, cb)
  const client = await clientFor()
  return new EngineRun(client).start(model, system, messages, tools, cb)
}

/** A single question with no tools, answered by the engine. */
export async function engineChat(model: string, system: string, user: string, signal?: AbortSignal): Promise<string> {
  let text = ''
  const controller = new AbortController()
  signal?.addEventListener('abort', () => controller.abort(), { once: true })
  await engineStream(model, system, [{ role: 'user', text: user }], [], {
    signal: controller.signal,
    onDelta: (t) => {
      text += t
    },
    onToolCall: () => undefined,
  })
  return text
}
