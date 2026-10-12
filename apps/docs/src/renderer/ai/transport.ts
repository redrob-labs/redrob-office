import {
  createIpcTransport,
  type AgentLoopOptions,
  type AgentTransport,
} from '@genoffice/agent-core'
import type { AiSettings } from '../../shared/ipc'
import { t } from '../i18n/locale'

/** The shared IPC transport wired to the docs preload bridge (window.desktop). */
export function createElectronTransport(getSettings: () => AiSettings): AgentTransport {
  return createIpcTransport<AiSettings>({
    onStream: (listener) => window.desktop.onAiStream(listener),
    start: (request) => window.desktop.aiStream(request),
    cancel: (requestId) => void window.desktop.aiStreamCancel(requestId),
    getSettings,
    unknownErrorText: () => t('aiUnknownError'),
    timeoutErrorText: () => t('aiTimeoutError'),
    creditsErrorText: () => t('aiCreditsExhausted'),
    networkErrorText: () => t('aiNetworkError'),
    overloadedErrorText: () => t('aiOverloadedError'),
  })
}

/**
 * Where the agent loop records facts about each AI session for the Redrob Console's insights:
 * counts and flags, never text (@genoffice/agent-core insights.ts). The shell labels and sends them.
 */
export const insightsSink: NonNullable<AgentLoopOptions['insights']> = {
  surface: 'docs',
  record: (fact) => window.desktop.insightsFact(fact),
}
