/**
 * The Office AI panel, composed from the design system's agent components.
 *
 * Each editor still owns its AgentLoop, tools, persistence and rollback; these
 * parts only draw the conversation, so every panel reads and behaves the same.
 * Strings arrive as props because the kit's own defaults are English-only and
 * the suite ships 19 languages.
 */
import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react'
import type { ClipboardEvent, KeyboardEvent, ReactElement, ReactNode, RefObject } from 'react'
import {
  AgentAction,
  Alert,
  Button,
  Composer,
  EmptyState,
  IconButton,
  Loader,
  Message,
  PromptSuggestions,
} from '@redrob-labs/ui'
import { Icon } from './Icon'
import { RedrobMark } from './icons'

// ── panel header ──

export interface AgentPanelAction {
  /** Accessible name and tooltip. */
  label: string
  icon: ReactNode
  onClick: () => void
}

export interface AgentPanelHeaderProps {
  title: string
  /** Leading brand mark; the Redrob mark by default. */
  mark?: ReactNode
  actions?: ReadonlyArray<AgentPanelAction | false | null | undefined>
}

/** Title row of an AI panel: brand mark, name, and icon actions (new chat, collapse). */
export function AgentPanelHeader({
  title,
  mark,
  actions = [],
}: AgentPanelHeaderProps): ReactElement {
  return (
    <header className="go-agent-header">
      <span className="go-agent-header__title">
        {mark ?? <RedrobMark size={20} />}
        <span>{title}</span>
      </span>
      <span className="go-agent-header__actions">
        {actions.map(
          (a) =>
            a && (
              // the kit names the button and titles it from `label`
              <IconButton key={a.label} label={a.label} size="sm" onClick={a.onClick}>
                {a.icon}
              </IconButton>
            ),
        )}
      </span>
    </header>
  )
}

// ── empty state ──

export interface AgentEmptyProps {
  title: string
  description?: string
  /** Starter prompts; picking one calls onPick with its text. */
  prompts?: ReadonlyArray<string>
  promptsLabel?: string
  onPick?: (prompt: string) => void
}

/** First-run state of a conversation: what the assistant can do, and a few starters. */
export function AgentEmpty({
  title,
  description,
  prompts = [],
  promptsLabel,
  onPick,
}: AgentEmptyProps): ReactElement {
  return (
    <div className="go-agent-empty">
      <EmptyState
        compact
        title={title}
        description={description}
        action={
          prompts.length > 0 ? (
            <PromptSuggestions
              items={[...prompts]}
              {...(promptsLabel === undefined ? {} : { label: promptsLabel })}
              onSelect={(value) => {
                if (value) onPick?.(value)
              }}
            />
          ) : undefined
        }
      />
    </div>
  )
}

// ── messages ──

export interface AgentMessageProps {
  role: 'user' | 'assistant'
  /** Who said it, localized ("You", "Redrob AI"). */
  author: string
  /** Text is still arriving: draws the streaming caret after the content. */
  streaming?: boolean
  footer?: ReactNode
  children?: ReactNode
}

/**
 * One turn of the conversation, on the kit Message. The assistant wears the
 * Redrob mark; the person wears their initial.
 */
export function AgentMessage({
  role,
  author,
  streaming,
  footer,
  children,
}: AgentMessageProps): ReactElement {
  return (
    <Message
      role={role}
      author={author}
      mark={role === 'assistant' ? <RedrobMark size={28} /> : undefined}
      footer={footer}
      className={`go-agent-msg${streaming ? ' go-agent-msg--streaming' : ''}`}
    >
      {children}
    </Message>
  )
}

export interface AgentFailureProps {
  /** Heading, e.g. "The assistant could not finish". */
  title: string
  /** The engine's own message, shown verbatim. */
  message: string
  action?: ReactNode
}

/**
 * A failed engine turn. Always visible and never dismissible: the run did not
 * happen, and the panel must not pretend otherwise or quietly try elsewhere.
 */
export function AgentFailure({ title, message, action }: AgentFailureProps): ReactElement {
  return (
    <Alert tone="danger" title={title} action={action} className="go-agent-failure">
      {message}
    </Alert>
  )
}

export interface AgentUndeliveredProps {
  /** e.g. "Not sent to the assistant". */
  message: string
  retryLabel: string
  /** Omit to hide Retry (e.g. while another run is in flight). */
  onRetry?: () => void
}

/** Marks a user message that a failed run rolled back out of the model's context. */
export function AgentUndelivered({
  message,
  retryLabel,
  onRetry,
}: AgentUndeliveredProps): ReactElement {
  return (
    <Alert
      tone="warning"
      className="go-agent-undelivered"
      action={
        onRetry ? (
          <Button size="sm" variant="secondary" onClick={onRetry}>
            {retryLabel}
          </Button>
        ) : undefined
      }
    >
      {message}
    </Alert>
  )
}

// ── tool activity ──

export interface AgentToolStep {
  /** Tool function name (kept for the tooltip). */
  name: string
  /** What it did, in plain words. */
  summary: string
  running?: boolean
  isError?: boolean
  /** Tool output, shown when the step is expanded. */
  output?: string | undefined
}

export interface AgentStepsStrings {
  /** Collapsed summary once finished, already formatted ("Worked · 3 steps"). */
  worked: string
  /** Summary while any step runs ("Working…"). */
  working: string
  running: string
  done: string
  failed: string
}

/**
 * The tools a turn ran, as kit AgentAction rows under one quiet toggle.
 * Collapsed by default; a person opens it when an answer looks wrong.
 */
export function AgentSteps<S extends AgentToolStep>({
  steps,
  strings,
  renderDetail,
}: {
  steps: ReadonlyArray<S>
  strings: AgentStepsStrings
  /**
   * Draws a step's expanded detail (image grids, link lists); by default the
   * raw output as text. Return nothing for a step with no detail.
   */
  renderDetail?: (step: S) => ReactNode
}): ReactElement {
  const [open, setOpen] = useState(false)
  const listId = useId()
  const anyRunning = steps.some((s) => s.running)
  return (
    <div className="go-agent-steps">
      <button
        type="button"
        className="go-agent-steps__toggle"
        aria-expanded={open}
        aria-controls={listId}
        onClick={() => setOpen(!open)}
      >
        {anyRunning && <span className="rr-spinner go-agent-steps__spinner" aria-hidden="true" />}
        <span>{anyRunning ? strings.working : strings.worked}</span>
        <Icon
          name="chevronDown"
          size={14}
          className={`go-agent-steps__caret${open ? ' go-agent-steps__caret--open' : ''}`}
        />
      </button>
      <div id={listId} className="go-agent-steps__list" hidden={!open}>
        {steps.map((step, i) => {
          const state = step.running ? 'running' : step.isError ? 'error' : 'done'
          return (
            <AgentAction
              key={i}
              name={step.summary}
              state={state}
              stateLabel={
                state === 'running'
                  ? strings.running
                  : state === 'error'
                    ? strings.failed
                    : strings.done
              }
              className="go-agent-step"
            >
              {renderDetail ? renderDetail(step) : step.output ? step.output : undefined}
            </AgentAction>
          )
        })}
      </div>
    </div>
  )
}

// ── in-progress indicator ──

/** Some locales already end the label with an ellipsis; normalize to exactly one. */
function withEllipsis(label: string): string {
  return `${label.replace(/(?:…|\.{3})+$/u, '')}…`
}

/**
 * What the assistant is doing while no text has arrived: the kit Loader, the
 * phase in words, and the elapsed seconds after three.
 */
export function AgentWorking({ label }: { label: string }): ReactElement {
  const [elapsed, setElapsed] = useState(0)
  useEffect(() => {
    const timer = setInterval(() => setElapsed((s) => s + 1), 1000)
    return () => clearInterval(timer)
  }, [])
  return (
    <div className="go-agent-working" role="status" aria-label={label}>
      {/* the Loader's hidden text carries the phase; the visible label is decorative */}
      <Loader size="sm" live={false} label={label} />
      <span className="go-agent-working__label" aria-hidden="true">
        {withEllipsis(label)}
        {elapsed >= 3 && <span className="go-agent-working__elapsed">{` · ${elapsed}s`}</span>}
      </span>
    </div>
  )
}

// ── composer ──

export interface AgentComposerProps {
  value: string
  busy: boolean
  placeholder: string
  /** Accessible name of the field. */
  label: string
  sendLabel: string
  stopLabel: string
  /** Inside the box above the field: a scope chip, attachment chips. */
  context?: ReactNode
  /** Left of the bar (an attach button). Nothing by default. */
  leading?: ReactNode
  /** Right of the bar, before Send. */
  tools?: ReactNode
  /** Pass to focus the field from outside. */
  textareaRef?: RefObject<HTMLTextAreaElement | null>
  onChange: (next: string) => void
  onSend: () => void
  onStop: () => void
  /** Files pasted into the field; text paste stays native. */
  onPasteFiles?: (files: File[]) => void
}

/**
 * The kit Composer with the Office panel's extras: Esc stops a running answer,
 * pasted files go to the app, the field follows the text direction, and the
 * app can focus it. Enter sends and Shift+Enter breaks a line (the kit guards
 * IME composition so Korean, Japanese and Chinese input commits first).
 */
export function AgentComposer({
  value,
  busy,
  placeholder,
  label,
  sendLabel,
  stopLabel,
  context,
  leading,
  tools,
  textareaRef,
  onChange,
  onSend,
  onStop,
  onPasteFiles,
}: AgentComposerProps): ReactElement {
  const wrapRef = useRef<HTMLDivElement>(null)
  useLayoutEffect(() => {
    const ta = wrapRef.current?.querySelector('textarea') ?? null
    ta?.setAttribute('dir', 'auto')
    if (textareaRef) textareaRef.current = ta
  }, [textareaRef])

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>): void => {
    if (e.key === 'Escape' && busy) {
      e.preventDefault()
      onStop()
    }
  }
  const onPaste = (e: ClipboardEvent<HTMLDivElement>): void => {
    if (!onPasteFiles) return
    const files = Array.from(e.clipboardData.files)
    if (files.length === 0) return
    e.preventDefault()
    onPasteFiles(files)
  }

  return (
    <div ref={wrapRef} className="go-agent-composer" onKeyDown={onKeyDown} onPaste={onPaste}>
      <Composer
        value={value}
        busy={busy}
        placeholder={placeholder}
        label={label}
        submitLabel={sendLabel}
        stopLabel={stopLabel}
        context={context}
        leading={leading ?? null}
        tools={tools}
        maxRows={7}
        onChange={onChange}
        onSubmit={() => onSend()}
        onStop={onStop}
      />
    </div>
  )
}
