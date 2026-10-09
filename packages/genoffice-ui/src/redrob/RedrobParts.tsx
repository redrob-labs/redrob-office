/**
 * The Redrob panel's shared parts, for every editor's AI panel: Plan or Run
 * in the composer bar, what will happen before Send (ComposerStatus), what
 * happened after (AnswerReceipt), and the plan document Plan mode writes.
 *
 * Honesty rules (handoff 55-agents, AGENTS.md fail-closed):
 * - the status line states only what this computer actually does; privacy
 *   protection is "Not on this computer" until the desktop app reports a
 *   local check, rather than promising protection that is not running.
 * - a receipt row appears only for something the run reported. Nothing is
 *   invented to fill the row.
 * - no model IDs or token counts: the model is named only as the person
 *   chose it (Redrob Auto, or the picker's own label).
 */
import { useRef, useState, type ReactElement } from 'react'
import { AnswerReceipt, ComposerStatus, type AnswerReceiptItem, type ComposerStatusItem } from '@redrob-labs/ui'
import { createI18n, defineStrings, type Lang } from '@genoffice/i18n'
import { ComposerMode, PlanDocument, type PlanStatus } from '../Plan'
import { Icon } from '../Icon'

export type RedrobMode = 'plan' | 'run'
export type CrossCheckLevel = 'off' | 'auto' | 'always'

export const redrobStrings = defineStrings({
  en: {
    modeLabel: 'How Redrob works on this message',
    plan: 'Plan',
    modePlanHint: 'Redrob writes a plan first. Nothing changes until you say so.',
    run: 'Run',
    modeRunHint: 'Redrob starts at once.',
    statusLabel: 'Before you send',
    privacy: 'Privacy',
    privacyNotHere: 'Not on this computer',
    privacyNotHereLive: 'What you send goes to the AI as written',
    memory: 'Memory',
    memoryOn: 'On for every AI',
    memoryOff: 'Off here',
    crossCheck: 'Cross-check',
    levelOff: 'Off',
    levelAuto: 'When it matters',
    levelAlways: 'Always',
    levelMixed: 'On',
    receiptModel: 'Answered by {model}',
    receiptChosenByYou: 'You chose it',
    receiptChosenByAuto: 'Redrob Auto chose it',
    receiptPrivacy: 'Privacy protection',
    receiptMemory: 'Memory',
    receiptPlan: 'Followed your plan',
    receiptPlanSteps: '{n} steps',
    receiptCheck: 'Cross-check',
    receiptChanges: '{n} changes',
    receiptChangesOne: '1 change',
    receiptChangesSub: 'Each one can be rolled back',
    planFile: 'Plan',
    planLead: 'Plan is on, so nothing changes yet. Here is the plan; change any line, then run it.',
    planRunning: 'Running the plan you approved.',
    planHow: 'How I will do it',
    planTodo: 'To do',
    planDone: '(done)',
    planRun: 'Run this plan',
    planKeep: 'Keep it for later',
    planHint: 'Click any line to change it.',
    planEmpty: 'Redrob did not write a plan this time. Ask again, or switch to Run.',
    statusDraft: 'Draft, not run yet',
    statusEdited: 'Edited by you, not run yet',
    statusRunning: 'Approved by you, running',
    statusDone: 'Approved by you, done',
    statusKept: 'Kept for later',
  },
  ko: {
    modeLabel: '이 메시지에서 Redrob이 일하는 방식',
    plan: '계획',
    modePlanHint: 'Redrob이 먼저 계획을 씁니다. 승인하기 전에는 아무것도 바뀌지 않습니다.',
    run: '실행',
    modeRunHint: 'Redrob이 바로 시작합니다.',
    statusLabel: '보내기 전에',
    privacy: '개인정보 보호',
    privacyNotHere: '이 컴퓨터에는 없음',
    privacyNotHereLive: '보내는 내용이 쓴 그대로 AI에 전달됩니다',
    memory: '기억',
    memoryOn: '모든 AI에서 켬',
    memoryOff: '여기에서 끔',
    crossCheck: '교차 확인',
    levelOff: '끔',
    levelAuto: '필요할 때',
    levelAlways: '항상',
    levelMixed: '켬',
    receiptModel: '{model}이(가) 답함',
    receiptChosenByYou: '직접 고름',
    receiptChosenByAuto: 'Redrob Auto가 고름',
    receiptPrivacy: '개인정보 보호',
    receiptMemory: '기억',
    receiptPlan: '계획대로 진행함',
    receiptPlanSteps: '{n}단계',
    receiptCheck: '교차 확인',
    receiptChanges: '변경 {n}건',
    receiptChangesOne: '변경 1건',
    receiptChangesSub: '하나씩 되돌릴 수 있습니다',
    planFile: '계획',
    planLead: '계획 모드라 아직 아무것도 바뀌지 않았습니다. 아래 계획의 줄을 고친 다음 실행하세요.',
    planRunning: '승인한 계획대로 실행하고 있습니다.',
    planHow: '이렇게 하겠습니다',
    planTodo: '할 일',
    planDone: '(완료)',
    planRun: '이 계획 실행',
    planKeep: '나중에 하기',
    planHint: '줄을 클릭하면 고칠 수 있습니다.',
    planEmpty: '이번에는 Redrob이 계획을 쓰지 않았습니다. 다시 요청하거나 실행으로 바꾸세요.',
    statusDraft: '초안, 아직 실행 안 함',
    statusEdited: '직접 고침, 아직 실행 안 함',
    statusRunning: '승인함, 실행 중',
    statusDone: '승인함, 완료',
    statusKept: '나중에 하기로 함',
  },
})

type Key = keyof typeof redrobStrings.en
const translate = createI18n(redrobStrings)
export const redrobT = (lang: Lang, key: Key, params?: Record<string, string | number>): string =>
  translate(lang, key, params)

/* ── Plan or Run ── */

export function RedrobModeSwitch({
  lang,
  value,
  onChange,
}: {
  lang: Lang
  value: RedrobMode
  onChange: (m: RedrobMode) => void
}): ReactElement {
  const t = (k: Key) => redrobT(lang, k)
  return (
    <ComposerMode
      compact
      label={t('modeLabel')}
      value={value}
      onChange={(v) => onChange(v === 'plan' ? 'plan' : 'run')}
      options={[
        { value: 'plan', label: t('plan'), icon: 'route', hint: t('modePlanHint') },
        { value: 'run', label: t('run'), icon: 'play', hint: t('modeRunHint') },
      ]}
    />
  )
}

/* ── before Send ── */

export interface RedrobStatusInput {
  /** a local privacy check is running on this computer; false until the desktop app reports one */
  privacyLocal?: { level: string; levelN: number; of: number } | null | undefined
  memory: boolean
  factCheck: CrossCheckLevel
  challenge: CrossCheckLevel
}

export function crossCheckSummary(lang: Lang, fact: CrossCheckLevel, challenge: CrossCheckLevel): string {
  const t = (k: Key) => redrobT(lang, k)
  const word = (l: CrossCheckLevel) => (l === 'off' ? t('levelOff') : l === 'auto' ? t('levelAuto') : t('levelAlways'))
  if (fact === challenge) return word(fact)
  if (fact === 'off' || challenge === 'off') return `1 of 2: ${word(fact === 'off' ? challenge : fact)}`
  return t('levelMixed')
}

export function redrobStatusItems(lang: Lang, s: RedrobStatusInput): ComposerStatusItem[] {
  const t = (k: Key) => redrobT(lang, k)
  return [
    s.privacyLocal
      ? {
          id: 'privacy',
          icon: <Icon name="shieldCheck" size={15} />,
          tone: 'safe',
          name: t('privacy'),
          value: s.privacyLocal.level,
          level: { n: s.privacyLocal.levelN, of: s.privacyLocal.of },
        }
      : {
          id: 'privacy',
          icon: <Icon name="shield" size={15} />,
          tone: 'plain',
          name: t('privacy'),
          value: t('privacyNotHere'),
          live: t('privacyNotHereLive'),
        },
    {
      id: 'memory',
      icon: <Icon name="bookOpen" size={15} />,
      tone: s.memory ? 'on' : 'plain',
      name: t('memory'),
      value: s.memory ? t('memoryOn') : t('memoryOff'),
    },
    {
      id: 'check',
      icon: <Icon name="compare" size={15} />,
      tone: s.factCheck === 'off' && s.challenge === 'off' ? 'plain' : 'on',
      name: t('crossCheck'),
      value: crossCheckSummary(lang, s.factCheck, s.challenge),
    },
  ]
}

export function RedrobStatus({ lang, ...s }: RedrobStatusInput & { lang: Lang }): ReactElement {
  return <ComposerStatus label={redrobT(lang, 'statusLabel')} items={redrobStatusItems(lang, s)} />
}

/* ── after the answer ── */

/** what a run reported; every field is optional and only reported fields become rows */
export interface RunReport {
  /** the model as the person knows it, e.g. "Redrob Auto"; never a raw model id */
  model?: string | undefined
  chosenBy?: 'you' | 'auto' | undefined
  /** what privacy protection did, in words, e.g. "2 names kept on this computer" */
  privacy?: string | undefined
  /** what memory was used, in words */
  memory?: string | undefined
  /** the run followed an approved plan of this many steps */
  planSteps?: number | undefined
  /** the Cross-check result, in words */
  check?: string | undefined
  /** how many document changes the run made (each can be rolled back) */
  changes?: number | undefined
}

export function receiptItems(lang: Lang, r: RunReport): AnswerReceiptItem[] {
  const t = (k: Key, p?: Record<string, string | number>) => redrobT(lang, k, p)
  const items: AnswerReceiptItem[] = []
  if (r.model) {
    items.push({
      id: 'model',
      label: t('receiptModel', { model: r.model }),
      ...(r.chosenBy ? { sub: r.chosenBy === 'you' ? t('receiptChosenByYou') : t('receiptChosenByAuto') } : {}),
    })
  }
  if (r.privacy) items.push({ id: 'privacy', label: t('receiptPrivacy'), sub: r.privacy })
  if (r.memory) items.push({ id: 'memory', label: t('receiptMemory'), sub: r.memory })
  if (r.planSteps && r.planSteps > 0) {
    items.push({ id: 'plan', label: t('receiptPlan'), sub: t('receiptPlanSteps', { n: r.planSteps }) })
  }
  if (r.changes && r.changes > 0) {
    items.push({
      id: 'changes',
      label: r.changes === 1 ? t('receiptChangesOne') : t('receiptChanges', { n: r.changes }),
      sub: t('receiptChangesSub'),
    })
  }
  if (r.check) items.push({ id: 'check', label: t('receiptCheck'), sub: r.check })
  return items
}

/** one receipt under an answer; renders nothing when the run reported nothing */
export function RedrobReceipt({ lang, report }: { lang: Lang; report: RunReport }): ReactElement | null {
  const items = receiptItems(lang, report)
  if (items.length === 0) return null
  return <AnswerReceipt className="go-redrob-receipt" items={items} />
}

/* ── Plan mode ── */

/**
 * What Plan mode sends: the person's request, with the instruction to write
 * the plan only. The run that answers it has no document tools, so nothing in
 * the file can change before "Run this plan".
 */
export function planRequest(request: string): string {
  return [
    'Plan mode: do not change the document and do not call any tool.',
    'Write a short plan for the request below as a numbered list of steps,',
    'one line each, in plain words for someone who is not an engineer.',
    'Reply with the list only.',
    '',
    `Request: ${request}`,
  ].join('\n')
}

/** what Run sends once the person approves the plan (with any lines they changed) */
export function runPlanRequest(request: string, steps: readonly string[]): string {
  return [
    request,
    '',
    'Follow this plan, which the person approved, step by step:',
    ...steps.map((s, i) => `${i + 1}. ${s}`),
  ].join('\n')
}

/** the steps of a plan reply: numbered or bulleted lines, markers stripped */
export function parsePlan(text: string): string[] {
  const lines = text.split(/\r?\n/).map((l) => l.trim())
  const marked = lines
    .map((l) => /^(?:\d+[.)]|[-*•])\s+(.+)$/.exec(l)?.[1]?.trim())
    .filter((s): s is string => !!s)
  if (marked.length > 0) return marked.slice(0, 12)
  return lines.filter(Boolean).slice(0, 12)
}

export interface PlanReplyProps {
  lang: Lang
  request: string
  steps: readonly string[]
  /** the plan ran (or is running); the document stays locked against edits */
  status: PlanStatus
  onRun: (steps: string[]) => void
  onKeep: () => void
}

/**
 * The plan, written as a document outside the message bubble. Each step can
 * be changed in place until it runs; Run sends the edited steps.
 */
export function PlanReply({ lang, request, steps, status, onRun, onKeep }: PlanReplyProps): ReactElement {
  const t = (k: Key) => redrobT(lang, k)
  const [edited] = useState<string[]>(() => [...steps])
  const root = useRef<HTMLDivElement>(null)
  if (steps.length === 0) return <p className="go-plan-reply__empty">{t('planEmpty')}</p>
  const title = request.length > 60 ? `${request.slice(0, 60)}...` : request
  // lines are edited in place (contentEditable): read what the person left on Run
  const currentSteps = (): string[] => {
    const lis = root.current?.querySelectorAll('.go-plandoc__sec ol > li') ?? []
    const read = Array.from(lis, (li) => (li.textContent ?? '').trim()).filter(Boolean)
    return read.length > 0 ? read : edited
  }
  return (
    <div className="go-plan-reply" ref={root}>
      <p className="go-plan-reply__lead">{status === 'running' || status === 'done' ? t('planRunning') : t('planLead')}</p>
      <PlanDocument
        label={t('planFile')}
        file={`${t('planFile')} - ${title}`}
        status={status}
        statusLabels={{
          draft: t('statusDraft'),
          edited: t('statusEdited'),
          running: t('statusRunning'),
          done: t('statusDone'),
          kept: t('statusKept'),
        }}
        title={request}
        sections={[
          {
            id: 'how',
            heading: t('planHow'),
            ordered: true,
            items: edited.map((s, i) => ({ id: `s${i}`, text: s })),
          },
        ]}
        todo={edited.map((s, i) => ({ id: `t${i}`, label: s }))}
        todoLabel={t('planTodo')}
        doneLabel={t('planDone')}
        done={status === 'done' ? edited.length : 0}
        runLabel={t('planRun')}
        keepLabel={t('planKeep')}
        hint={t('planHint')}
        onRun={() => onRun(currentSteps())}
        onKeep={onKeep}
      />
    </div>
  )
}
