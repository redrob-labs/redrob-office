import {
  createIpcTransport,
  type AgentLoopOptions,
  type AgentTransport,
} from '@genoffice/agent-core'
import type { AiSettings } from '@genoffice/ai-provider'
import { t } from '../i18n/locale'

/** The shared IPC transport wired to the sheets preload bridge (window.desktopApi). */
export function createElectronTransport(getSettings: () => AiSettings): AgentTransport {
  return createIpcTransport<AiSettings>({
    onStream: (listener) => window.desktopApi.onAiStream(listener),
    start: (request) => window.desktopApi.aiStream(request),
    cancel: (requestId) => void window.desktopApi.aiStreamCancel(requestId),
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
  surface: 'sheets',
  record: (fact) => window.desktopApi.insightsFact(fact),
}
