import type { ReactNode } from 'react'

// ── AI engine mark (settings → AI model) ──────────────────
// Redrob Office runs on a single engine (Redrob Console). There is no provider
// picker, so there is exactly one mark: the Redrob engine. The old multi-vendor
// brand logos were removed with the provider picker.

const REDROB_LOGO: ReactNode = (
  <svg viewBox="0 0 24 24" fill="currentColor" fillRule="evenodd" aria-hidden="true">
    <path d="M12 0a12 12 0 100 24 12 12 0 000-24zm-4.2 6h5.1c2.2 0 3.7 1.3 3.7 3.3 0 1.4-.8 2.5-2 3l2.4 3.9h-2.6l-2.1-3.5H9.9V19.2H7.8V6zm2.1 1.9v3.9h2.7c1.1 0 1.8-.7 1.8-1.9 0-1.2-.7-2-1.8-2H9.9z" />
  </svg>
)

/** Inline Redrob engine mark sized by the surrounding .set-provider-logo container. */
export function ProviderLogo({ id: _id }: { id: string }) {
  return (
    <span className="set-provider-logo" aria-hidden="true">
      {REDROB_LOGO}
    </span>
  )
}
