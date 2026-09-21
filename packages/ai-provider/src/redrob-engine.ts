import type { AgentMessage, AgentToolCall, AgentToolDef } from '@genoffice/agent-core'
import { AiAuthError } from './auth-error'
import { aiFetch } from './fetch'
import {
  AiCreditsError,
  jsonBodyInsteadOfSse,
  parseToolInput,
  sseErrorText,
  sseLines,
  throwIfCreditsNotice,
  type StreamCallbacks,
} from './protocols/shared'
import type { AiChatResponse } from './types'
import { AI_CHAT_RESPONSE_TIMEOUT_MS, createStreamWatchdog } from './watchdog'

/**
 * The single Redrob Console engine. There is no provider selection, no BYOK, no
 * configurable inference server URL, and no third-party engine name. Every AI
 * turn from every editor is routed here.
 *
 * The base and model are fixed by policy (see redrob-office/AGENTS.md): the
 * Console API base is https://console.redrob.ai/api/backend/v1 and the wire
 * model is `auto` (Console route `redrob/auto`). Do not add a way to override
 * either from settings or the UI.
 */
export const REDROB_CONSOLE_API_BASE = 'https://console.redrob.ai/api/backend/v1'

/**
 * The one wire model id. Console accepts `auto` on chat/completions; the
 * product route name is `redrob/auto`. Settings may leave `model` empty because
 * this constant is what every turn sends. Neither exposes a vendor choice.
 */
export const REDROB_ENGINE_MODEL = 'auto'
export const REDROB_ENGINE_ROUTE = 'redrob/auto'

/**
 * What the person is told when the Redrob engine cannot run the turn. Mirrors
 * office/src/main/redrob-code/steering.ts redrobCodeUnavailableMessage: branded
 * as Redrob, names no engine or third party, and never claims a silent swap onto
 * another loop. There is one engine, so a failure is a visible failure.
 */
export function redrobEngineUnavailableMessage(reason?: string): string {
  const detail = reason?.trim()
  if (detail) {
    return `Redrob could not complete this reply (${detail}). Add your Redrob Console key in Settings and try again.`
  }
  return 'Redrob could not complete this reply. Add your Redrob Console key in Settings and try again.'
}

/**
 * Phrases that quietly tell a model to give up on its tools. Any steering copy
 * the AI layer emits must not match these: a run should be told to connect or
 * retry, not to pretend the capability is gone. Mirrors the office engine's
 * hasDegradedSteering so the same "no degraded mode" rule holds across the port.
 */
const DEGRADED_PATTERNS: RegExp[] = [
  /\bwithout (?:your |any )?tools?\b/i,
  /\bno tools? (?:are )?available\b/i,
  /\btools? (?:are )?(?:disabled|unavailable|gone)\b/i,
  /\blimited mode\b/i,
  /\bdegraded mode\b/i,
  /\bcannot use (?:any )?tools?\b/i,
  /\bproceed without\b/i,
  /\bfall back to (?:plain )?(?:text|prose)\b/i,
]

/** True when a steering string tells the model to work as if its tools vanished. */
export function hasDegradedSteering(text: string): boolean {
  return DEGRADED_PATTERNS.some((pattern) => pattern.test(text))
}

/**
 * The Redrob Console key that authorizes a turn. The apps read it from their AI
 * settings (the only accepted key is one issued at https://console.redrob.ai);
 * an empty key means onboarding is not finished, so the turn is refused with the
 * honest-failure notice rather than sent keyless.
 */
export interface RedrobEngineAuth {
  apiKey: string
}

class RedrobEngineError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'RedrobEngineError'
  }
}

function authHeaders(auth: RedrobEngineAuth): Record<string, string> {
  return {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${auth.apiKey}`,
  }
}

// ---- AgentMessage <-> OpenAI-compatible chat wire ----

interface OpenAiToolMessage {
  role: 'system' | 'user' | 'assistant' | 'tool'
  content?: string | null
  tool_calls?: Array<{
    id: string
    type: 'function'
    function: { name: string; arguments: string }
  }>
  tool_call_id?: string
  name?: string
}

function toWireMessages(system: string, messages: AgentMessage[]): OpenAiToolMessage[] {
  const wire: OpenAiToolMessage[] = []
  if (system.trim()) wire.push({ role: 'system', content: system })
  for (const message of messages) {
    if (message.role === 'user') {
      wire.push({ role: 'user', content: message.text })
      continue
    }
    if (message.role === 'assistant') {
      const entry: OpenAiToolMessage = { role: 'assistant', content: message.text || '' }
      if (message.toolCalls?.length) {
        entry.tool_calls = message.toolCalls.map((call) => ({
          id: call.id,
          type: 'function',
          function: { name: call.name, arguments: JSON.stringify(call.input ?? {}) },
        }))
      }
      wire.push(entry)
      continue
    }
    // tool results: one wire message per result, addressed by the originating call id
    for (const result of message.results) {
      wire.push({
        role: 'tool',
        tool_call_id: result.id,
        name: result.name,
        content: result.output,
      })
    }
  }
  return wire
}

function toWireTools(tools: AgentToolDef[]): Array<Record<string, unknown>> | undefined {
  if (!tools.length) return undefined
  return tools.map((tool) => ({
    type: 'function',
    function: {
      name: tool.name,
      description: tool.description,
      parameters: tool.inputSchema,
    },
  }))
}

function normalizeStopReason(finish: string | null | undefined): string | undefined {
  if (!finish) return undefined
  if (finish === 'length') return 'max_tokens'
  return finish
}

/**
 * The single non-streaming turn. Never names a provider or lets the caller pick
 * one: the base and model are fixed to the Redrob Console engine.
 */
export async function redrobEngineChat(
  auth: RedrobEngineAuth,
  system: string,
  user: string,
  signal?: AbortSignal,
): Promise<AiChatResponse> {
  if (!auth.apiKey.trim()) {
    return { ok: false, error: redrobEngineUnavailableMessage('no Redrob Console key') }
  }
  const watchdog = createStreamWatchdog(signal, AI_CHAT_RESPONSE_TIMEOUT_MS, AI_CHAT_RESPONSE_TIMEOUT_MS)
  try {
    return await watchdog.guard(async () => {
      const response = await aiFetch(`${REDROB_CONSOLE_API_BASE}/chat/completions`, {
        method: 'POST',
        headers: authHeaders(auth),
        body: JSON.stringify({
          model: REDROB_ENGINE_MODEL,
          messages: toWireMessages(system, [{ role: 'user', text: user }]),
          stream: false,
        }),
        signal: watchdog.signal,
      })
      const bodyText = await response.text()
      if (!response.ok) {
        throwIfCreditsNotice(bodyText)
        return { ok: false, error: bodyText.slice(0, 500) || `HTTP ${response.status}` }
      }
      throwIfCreditsNotice(bodyText)
      let parsed: {
        choices?: Array<{ message?: { content?: string | null }; finish_reason?: string }>
      }
      try {
        parsed = JSON.parse(bodyText)
      } catch {
        return { ok: false, error: 'Redrob returned an unreadable reply.' }
      }
      const content = parsed.choices?.[0]?.message?.content ?? ''
      return { ok: true, content }
    })
  } catch (error) {
    if (error instanceof AiCreditsError) throw error
    return { ok: false, error: error instanceof Error ? error.message : String(error) }
  }
}

/**
 * The single streaming, tool-calling turn. Speaks the Console's OpenAI-compatible
 * SSE (content deltas, reasoning deltas, streamed tool_calls) and emits the same
 * StreamCallbacks the editors already consume. No provider branch, no BYOK
 * fallback: one engine, and a failure surfaces as a thrown error the app renders
 * with the honest-failure notice.
 */
export async function redrobEngineStream(
  auth: RedrobEngineAuth,
  system: string,
  messages: AgentMessage[],
  tools: AgentToolDef[],
  maxTokens: number,
  cb: StreamCallbacks,
): Promise<void> {
  if (!auth.apiKey.trim()) {
    throw new AiAuthError(redrobEngineUnavailableMessage('no Redrob Console key'))
  }
  const watchdog = createStreamWatchdog(cb.signal)
  await watchdog.guard(async () => {
    const wireTools = toWireTools(tools)
    const body: Record<string, unknown> = {
      model: REDROB_ENGINE_MODEL,
      messages: toWireMessages(system, messages),
      max_tokens: maxTokens,
      stream: true,
    }
    if (wireTools) {
      body.tools = wireTools
      body.tool_choice = 'auto'
    }
    const response = await aiFetch(`${REDROB_CONSOLE_API_BASE}/chat/completions`, {
      method: 'POST',
      headers: authHeaders(auth),
      body: JSON.stringify(body),
      signal: watchdog.signal,
    })
    if (!response.ok) {
      const detail = await response.text().catch(() => '')
      throwIfCreditsNotice(detail)
      const text = `Redrob engine request failed: HTTP ${response.status}${detail ? ` ${detail.slice(0, 240)}` : ''}`
      // 401/403 is the only failure a sign-in button can fix; everything else
      // must surface its own cause instead of being dressed up as signed-out.
      if (response.status === 401 || response.status === 403) {
        throw new AiAuthError(text, response.status)
      }
      throw new RedrobEngineError(text)
    }
    // The response headers ARE the connection proving itself alive, so hand the
    // rest of the wait to the idle budget here. Without this the 60s connect
    // timeout keeps running until the first SSE line is parsed, so it gates
    // time-to-first-token rather than time-to-headers -- and the gateway
    // legitimately thinks for minutes before the first token on a long-context
    // or reasoning request. That killed real generations at exactly 60s, while
    // the console had already answered and was still billing them.
    watchdog.touch()
    // A gateway can answer a stream request with a plain JSON body (e.g. a
    // credits notice). Surface it rather than dissolving it into an empty turn.
    const jsonBody = await jsonBodyInsteadOfSse(response)
    if (jsonBody !== null) {
      throwIfCreditsNotice(jsonBody)
      throw new RedrobEngineError(sseErrorText(safeParse(jsonBody), jsonBody.slice(0, 240)))
    }
    if (!response.body) throw new RedrobEngineError('Redrob engine returned an empty stream.')

    // Tool call arguments arrive as fragments keyed by choice index; buffer them
    // and emit a complete AgentToolCall once the arguments finish.
    const pending = new Map<number, { id: string; name: string; args: string }>()
    let sawDone = false

    for await (const line of sseLines(response.body, () => {
      watchdog.touch()
      cb.onActivity?.()
    })) {
      const trimmed = line.trim()
      if (!trimmed.startsWith('data:')) continue
      const data = trimmed.slice('data:'.length).trim()
      if (data === '[DONE]') {
        sawDone = true
        break
      }
      let event: {
        choices?: Array<{
          delta?: {
            content?: string | null
            reasoning_content?: string | null
            reasoning?: string | null
            tool_calls?: Array<{
              index?: number
              id?: string
              function?: { name?: string; arguments?: string }
            }>
          }
          finish_reason?: string | null
        }>
        error?: unknown
      }
      try {
        event = JSON.parse(data)
      } catch {
        continue
      }
      if (event.error) {
        throw new RedrobEngineError(sseErrorText(event.error, 'Redrob engine stream error'))
      }
      const choice = event.choices?.[0]
      if (!choice) continue
      const delta = choice.delta
      if (delta?.content) cb.onDelta(delta.content)
      const reasoning = delta?.reasoning_content ?? delta?.reasoning
      if (reasoning) cb.onReasoningDelta?.(reasoning)
      if (delta?.tool_calls) {
        for (const fragment of delta.tool_calls) {
          const index = fragment.index ?? 0
          const slot = pending.get(index) ?? { id: '', name: '', args: '' }
          if (fragment.id) slot.id = fragment.id
          if (fragment.function?.name) slot.name = fragment.function.name
          if (fragment.function?.arguments) slot.args += fragment.function.arguments
          pending.set(index, slot)
        }
      }
      const stop = normalizeStopReason(choice.finish_reason)
      if (stop) {
        flushToolCalls(pending, cb, stop === 'max_tokens')
        cb.onStopReason?.(stop)
      }
    }
    // Some gateways end the stream without a finish_reason chunk; flush anything
    // still buffered so a completed tool call is not dropped.
    if (sawDone) flushToolCalls(pending, cb, false)
  })
}

function flushToolCalls(
  pending: Map<number, { id: string; name: string; args: string }>,
  cb: StreamCallbacks,
  truncated: boolean,
): void {
  for (const slot of pending.values()) {
    if (!slot.name) continue
    const parsed = parseToolInput(slot.args)
    const call: AgentToolCall = {
      id: slot.id || `call_${slot.name}`,
      name: slot.name,
      input: parsed.input,
      ...(parsed.error ? { inputError: parsed.error } : {}),
      ...(truncated ? { truncated: true } : {}),
    }
    cb.onToolCall(call)
  }
  pending.clear()
}

function safeParse(text: string): unknown {
  try {
    return JSON.parse(text)
  } catch {
    return text
  }
}
