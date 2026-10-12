/// <reference types="vite/client" />

import type { HangulApi } from '../shared/ipc'

declare global {
  interface Window {
    hangulApi: HangulApi
  }
}

export {}
