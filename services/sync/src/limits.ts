/**
 * Request limits, in memory, per service instance: a fixed window per key
 * (an account, or an address before sign-in). Behind a load balancer each
 * instance counts on its own, so the real ceiling is the limit times the
 * number of instances; that is a ceiling against abuse, not a quota.
 */
export interface Take {
  ok: boolean
  /** seconds until the window resets, when refused */
  retryAfter: number
}

/** keys kept at most; past this the expired ones go, and if none have, every key does */
const MAX_KEYS = 100_000

export class RateLimiter {
  private readonly windows = new Map<string, { start: number; count: number }>()
  readonly limit: number
  readonly windowMs: number
  private readonly now: () => number

  constructor(limit: number, windowMs: number, now: () => number = Date.now) {
    this.limit = limit
    this.windowMs = windowMs
    this.now = now
  }

  take(key: string): Take {
    if (!Number.isFinite(this.limit) || this.limit <= 0) return { ok: true, retryAfter: 0 }
    const t = this.now()
    let w = this.windows.get(key)
    if (!w || t - w.start >= this.windowMs) {
      if (!w && this.windows.size >= MAX_KEYS) this.sweep(t)
      w = { start: t, count: 0 }
      this.windows.set(key, w)
    }
    w.count += 1
    if (w.count <= this.limit) return { ok: true, retryAfter: 0 }
    return { ok: false, retryAfter: Math.max(1, Math.ceil((w.start + this.windowMs - t) / 1000)) }
  }

  private sweep(t: number) {
    for (const [k, w] of this.windows) if (t - w.start >= this.windowMs) this.windows.delete(k)
    if (this.windows.size >= MAX_KEYS) this.windows.clear()
  }

  /** for tests */
  size(): number {
    return this.windows.size
  }
}

export interface RateLimits {
  /** requests a minute from one address before it signs in (token checks are not free) */
  perAddressPerMinute: number
  /** requests a minute from one signed-in account */
  perAccountPerMinute: number
  /** invite-link look-ups and redemptions an hour from one account (guessing links is the threat) */
  linksPerHour: number
}

export const DEFAULT_LIMITS: RateLimits = { perAddressPerMinute: 600, perAccountPerMinute: 300, linksPerHour: 30 }
