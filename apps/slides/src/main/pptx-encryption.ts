/**
 * Password-protected (ECMA-376 encrypted) pptx support. The single integration
 * point for the third-party crypto implementation (officecrypto-tool), the same
 * library docs and sheets use, kept separate from the open pipeline so a
 * replacement touches only this module.
 *
 * An encrypted deck is not a zip: PowerPoint repackages it as a CFB (OLE2)
 * container holding an EncryptionInfo stream (parameters) and an
 * EncryptedPackage stream (the ciphertext of the real pptx zip). Both Standard
 * (AES-128/SHA-1) and Agile (AES-256/SHA-512) decrypt; saves re-encrypt with
 * Agile, matching PowerPoint 2013+ defaults.
 */
import officeCrypto from 'officecrypto-tool'

export type DecryptFailReason = 'wrong-password' | 'unsupported'

export class PptxDecryptError extends Error {
  readonly reason: DecryptFailReason
  constructor(reason: DecryptFailReason, message: string) {
    super(message)
    this.reason = reason
  }
}

/**
 * Decrypt an encrypted pptx container into plain zip bytes. Throws
 * PptxDecryptError with reason 'wrong-password' (verifier mismatch — reprompt)
 * or 'unsupported' (exotic scheme).
 */
export async function decryptPptx(bytes: Buffer, password: string): Promise<Buffer> {
  try {
    return await officeCrypto.decrypt(bytes, { password })
  } catch (err) {
    const message = String((err as Error)?.message ?? err)
    if (message.includes('password is incorrect')) {
      throw new PptxDecryptError('wrong-password', message)
    }
    throw new PptxDecryptError('unsupported', message)
  }
}

/** Re-encrypt plain pptx zip bytes with ECMA-376 Agile (PowerPoint 2013+ default). */
export function encryptPptx(bytes: Uint8Array, password: string): Buffer {
  return officeCrypto.encrypt(Buffer.from(bytes), { password })
}
