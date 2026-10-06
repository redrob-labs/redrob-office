/**
 * "Sign in to Redrob" from an editor's AI panel.
 *
 * An editor main process cannot run the Console connect flow itself (the shell owns it and
 * hands the key straight to the engine), so the shell installs the handler here and every
 * editor's `ai:gsk-login` channel calls it. The channel name is kept from the port for the
 * renderers' sake; nothing behind it talks to Genspark.
 */
export type RedrobSignIn = () => Promise<void>

const SLOT = Symbol.for('redrob.office.signIn')
type Slot = { [SLOT]?: RedrobSignIn | null }

export function setRedrobSignIn(handler: RedrobSignIn | null): void {
  ;(globalThis as Slot)[SLOT] = handler
}

/** Start Redrob sign-in; a no-op outside the suite, where there is no shell to run it. */
export async function redrobSignIn(): Promise<void> {
  await (globalThis as Slot)[SLOT]?.()
}
