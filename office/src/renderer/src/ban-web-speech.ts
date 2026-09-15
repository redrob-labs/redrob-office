/**
 * Web Speech APIs often route audio off-device (OS/browser STT).
 * Constructors stay blocked on `window`; live captions use captured natives.
 * Default: live captions ON. First voice use shows a one-time consent popup.
 */

const OPT_IN_KEY = "redrob.webSpeechOptIn.v1";
const CONSENT_KEY = "redrob.webSpeechConsent.v1";

type SpeechRecognitionCtor = new () => SpeechRecognitionLike;

export type SpeechRecognitionLike = {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  maxAlternatives: number;
  start: () => void;
  stop: () => void;
  abort: () => void;
  onresult: ((event: SpeechRecognitionEventLike) => void) | null;
  onerror: ((event: { error?: string }) => void) | null;
  onend: (() => void) | null;
};

export type SpeechRecognitionEventLike = {
  resultIndex: number;
  results: ArrayLike<{
    isFinal: boolean;
    0: { transcript: string };
  }>;
};

let nativeCtor: SpeechRecognitionCtor | null = null;
const listeners = new Set<() => void>();

function notify(): void {
  for (const listener of listeners) listener();
}

/** Missing key = on (product default). Explicit "0" turns off. */
function readOptIn(): boolean {
  try {
    const raw = localStorage.getItem(OPT_IN_KEY);
    if (raw === null) return true;
    return raw === "1";
  } catch {
    return true;
  }
}

function readConsent(): boolean {
  try {
    return localStorage.getItem(CONSENT_KEY) === "1";
  } catch {
    return false;
  }
}

export function isWebSpeechOptedIn(): boolean {
  return readOptIn();
}

export function setWebSpeechOptedIn(enabled: boolean): void {
  try {
    localStorage.setItem(OPT_IN_KEY, enabled ? "1" : "0");
  } catch {
    /* ignore */
  }
  notify();
}

export function hasWebSpeechConsent(): boolean {
  return readConsent();
}

export function setWebSpeechConsent(acknowledged: boolean): void {
  try {
    localStorage.setItem(CONSENT_KEY, acknowledged ? "1" : "0");
  } catch {
    /* ignore */
  }
  notify();
}

export function subscribeWebSpeechOptIn(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function isWebSpeechAvailable(): boolean {
  return nativeCtor !== null;
}

/**
 * Capture Chromium constructors, then block accidental `window.SpeechRecognition` use.
 * Call once at renderer bootstrap.
 */
export function banWebSpeechApis(): void {
  if (typeof window === "undefined") return;
  const w = window as Window & {
    SpeechRecognition?: SpeechRecognitionCtor;
    webkitSpeechRecognition?: SpeechRecognitionCtor;
  };
  nativeCtor = w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;

  const block = (): never => {
    throw new Error(
      "ERR_WEB_SPEECH_BANNED: use live captions via Settings → Data & privacy, or local ASR",
    );
  };
  try {
    Object.defineProperty(window, "webkitSpeechRecognition", {
      configurable: true,
      get: block,
      set: block,
    });
  } catch {
    /* ignore */
  }
  try {
    Object.defineProperty(window, "SpeechRecognition", {
      configurable: true,
      get: block,
      set: block,
    });
  } catch {
    /* ignore */
  }
}

/** Factory when live captions are enabled — returns null when off or unavailable. */
export function createOptInSpeechRecognition(): SpeechRecognitionLike | null {
  if (!readOptIn() || !nativeCtor) return null;
  return new nativeCtor();
}
