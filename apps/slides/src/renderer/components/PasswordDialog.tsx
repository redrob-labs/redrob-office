import { useEffect, useState } from 'react'

import type { PasswordPromptPayload } from '../../shared/ipc'

/** Password prompt raised by main while opening an encrypted (password-protected) deck. Strings arrive pre-localized. */
export function PasswordDialog({
  prompt,
  onSubmit,
}: {
  prompt: PasswordPromptPayload
  /** the password to try, or null when the user cancels the open */
  onSubmit: (password: string | null) => void
}) {
  const [password, setPassword] = useState('')

  // Esc cancels. No backdrop-click dismissal: cancelling abandons the open, so it must be explicit.
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
    <div className="modal-backdrop">
      <div className="modal password-modal" role="dialog" aria-label={prompt.title}>
        <h2>{prompt.title}</h2>
        <p className="password-modal-body" role={prompt.wrong ? 'alert' : undefined}>
          {prompt.body}
        </p>
        <p className="password-modal-file" title={prompt.fileName}>
          {prompt.fileName}
        </p>
        <label>
          {prompt.passwordLabel}
          <input
            type="password"
            autoFocus
            autoComplete="off"
            value={password}
            aria-invalid={prompt.wrong || undefined}
            onChange={(e) => setPassword(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault()
                submit()
              }
            }}
          />
        </label>
        <div className="modal-actions">
          <button onClick={() => onSubmit(null)}>{prompt.cancelLabel}</button>
          <button className="primary" disabled={password.length === 0} onClick={submit}>
            {prompt.openLabel}
          </button>
        </div>
      </div>
    </div>
  )
}
