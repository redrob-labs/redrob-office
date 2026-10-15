import { useEffect, useState } from 'react'

import type { PasswordPromptPayload } from '../shared/desktop-api'

/// Password prompt raised by main while opening an encrypted (password-
/// protected) workbook. Strings arrive pre-localized in the payload; the
/// dialog shows the file name and the "wrong password" state on a retry.
export function PasswordDialog({
  prompt,
  onSubmit,
}: {
  readonly prompt: PasswordPromptPayload
  /// the password to try, or null when the user cancels the open.
  readonly onSubmit: (password: string | null) => void
}): React.JSX.Element {
  const [password, setPassword] = useState('')

  // Esc cancels the open. No backdrop-click dismissal: the choice closes the
  // tab the user just opened, so it must be explicit.
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') onSubmit(null)
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [onSubmit])

  const submit = (): void => {
    if (password.length > 0) onSubmit(password)
  }

  return (
    <div className="dialog-backdrop">
      <div className="format-cells-dialog recovery-dialog" role="dialog" aria-label={prompt.title}>
        <section className="dialog-body">
          <div className="recovery-heading">
            <span className="recovery-icon" aria-hidden="true">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                <rect x="5" y="11" width="14" height="10" rx="2" />
                <path d="M8 11V8a4 4 0 0 1 8 0v3" strokeLinecap="round" />
                <circle cx="12" cy="16" r="1.2" fill="currentColor" stroke="none" />
              </svg>
            </span>
            <h2>{prompt.title}</h2>
          </div>
          <p className="recovery-body" role={prompt.wrong ? 'alert' : undefined}>
            {prompt.body}
          </p>
          <div className="recovery-file">
            <span className="recovery-file-name" title={prompt.fileName}>
              {prompt.fileName}
            </span>
          </div>
          <label className="password-dialog-field">
            <span>{prompt.passwordLabel}</span>
            <input
              type="password"
              autoFocus
              autoComplete="off"
              value={password}
              aria-invalid={prompt.wrong || undefined}
              onChange={(event) => setPassword(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  event.preventDefault()
                  submit()
                }
              }}
            />
          </label>
        </section>
        <div className="dialog-actions">
          <button className="secondary" onClick={() => onSubmit(null)}>
            {prompt.cancelLabel}
          </button>
          <button className="primary-action" disabled={password.length === 0} onClick={submit}>
            {prompt.openLabel}
          </button>
        </div>
      </div>
    </div>
  )
}
