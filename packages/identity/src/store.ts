import { normalizeSession, type Session } from './session'

/**
 * Encryption the operating system provides (Electron's safeStorage in the
 * shell). When it is not available the session is kept in memory only:
 * a token is never written to disk in the clear.
 */
export interface SecretCipher {
  available(): boolean
  encrypt(plain: string): Uint8Array
  decrypt(data: Uint8Array): string
}

export interface SessionFile {
  read(): Promise<Uint8Array | null>
  write(data: Uint8Array): Promise<void>
  remove(): Promise<void>
}

export class SessionStore {
  private current: Session | null = null
  private loaded = false

  constructor(
    private readonly cipher: SecretCipher,
    private readonly file: SessionFile,
  ) {}

  /** whether a sign-in survives a restart on this computer */
  persistent(): boolean {
    return this.cipher.available()
  }

  async get(now = Date.now()): Promise<Session | null> {
    if (!this.loaded) {
      this.loaded = true
      if (this.cipher.available()) {
        try {
          const data = await this.file.read()
          this.current = data ? normalizeSession(JSON.parse(this.cipher.decrypt(data))) : null
        } catch {
          // unreadable (another user's key, a corrupt file): start signed out
          this.current = null
        }
      }
    }
    return this.current
  }

  async set(session: Session): Promise<void> {
    this.current = session
    this.loaded = true
    if (this.cipher.available()) await this.file.write(this.cipher.encrypt(JSON.stringify(session)))
  }

  async clear(): Promise<void> {
    this.current = null
    this.loaded = true
    await this.file.remove()
  }
}
