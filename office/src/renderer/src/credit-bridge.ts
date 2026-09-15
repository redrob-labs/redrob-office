/**
 * How a turn that was refused for want of credit reaches the shell.
 *
 * The chat panel is where the refusal is seen and the app shell is where a modal
 * belongs, and neither renders the other. This is the same one-line bridge the
 * chat navigation uses: a module-level set of listeners, no context, no store.
 *
 * It carries no state of its own on purpose. The console's answer lives in the
 * main process, so a listener asks for it rather than trusting a payload that
 * travelled through a renderer.
 */

export type OutOfCreditListener = () => void;

const listeners = new Set<OutOfCreditListener>();

/** Called by whatever saw the console refuse a request. */
export function announceOutOfCredit(): void {
  for (const listener of listeners) listener();
}

export function onOutOfCredit(listener: OutOfCreditListener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** @internal for tests. */
export function __outOfCreditListenerCount(): number {
  return listeners.size;
}
