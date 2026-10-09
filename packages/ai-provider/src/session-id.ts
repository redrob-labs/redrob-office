/**
 * The id the Redrob Console knows an Office work session by: `of_` and the first 32 hex digits of the
 * SHA-256 of the session's key. The same as @redrob-labs/work-labeller's `externalIdOf` with Office's
 * prefix, which labels the session in the shell; a test holds the two together. WebCrypto, so this runs in
 * any main process without a Node import.
 */
export async function officeSessionId(key: string): Promise<string> {
  const digest = await globalThis.crypto.subtle.digest('SHA-256', new TextEncoder().encode(key))
  const hex = Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('')
  return `of_${hex.slice(0, 32)}`
}
