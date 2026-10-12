import {
  createIpcTransport,
  type AgentLoopOptions,
  type AgentTransport,
} from '@genoffice/agent-core'
import type { AiSettings } from '../../shared/ipc'
import { t } from '../i18n/locale'

/** The shared IPC transport wired to the slides preload bridge (window.slidesApi). */
export function createElectronTransport(getSettings: () => AiSettings): AgentTransport {
  return createIpcTransport<AiSettings>({
    onStream: (listener) => window.slidesApi.onAiStream(listener),
    start: (request) => window.slidesApi.aiStream(request),
    cancel: (requestId) => void window.slidesApi.aiStreamCancel(requestId),
    getSettings,
    unknownErrorText: () => t('aiErrUnknown'),
    timeoutErrorText: () => t('aiErrStreamTimeout'),
    creditsErrorText: () => t('aiCreditsExhausted'),
    networkErrorText: () => t('aiErrNetwork'),
    overloadedErrorText: () => t('aiErrOverloaded'),
  })
}

/**
 * Where the agent loop records facts about each AI session for the Redrob Console's insights:
 * counts and flags, never text (@genoffice/agent-core insights.ts). The shell labels and sends them.
 */
export const insightsSink: NonNullable<AgentLoopOptions['insights']> = {
  surface: 'slides',
  record: (fact) => window.slidesApi.insightsFact(fact),
}
