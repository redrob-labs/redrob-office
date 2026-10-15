/**
 * Password-protected (ECMA-376 encrypted) xlsx support. The single integration
 * point for the third-party crypto implementation (officecrypto-tool), kept
 * separate from the open pipeline so a replacement touches only this module.
 *
 * An encrypted workbook is not a zip: Excel/WPS repackage it as a CFB (OLE2)
 * container holding an EncryptionInfo stream (parameters) and an
 * EncryptedPackage stream (the ciphertext of the real xlsx zip). Both Standard
 * (AES-128/SHA-1) and Agile (AES-256/SHA-512) decrypt; saves re-encrypt with
 * Agile, matching Excel 2013+ defaults.
 */
import officeCrypto from 'officecrypto-tool'

const CFB_MAGIC = Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1])
const ENCRYPTED_STREAM_UTF16 = Buffer.from('EncryptedPackage', 'utf16le')

/** ECMA-376 encrypted OOXML: CFB magic + an EncryptedPackage stream in the directory. */
export function isEncryptedOoxml(bytes: Buffer): boolean {
  return (
    bytes.length >= 8 &&
    bytes.subarray(0, 8).equals(CFB_MAGIC) &&
    bytes.includes(ENCRYPTED_STREAM_UTF16)
  )
}

export type DecryptFailReason = 'wrong-password' | 'unsupported'

export class XlsxDecryptError extends Error {
  readonly reason: DecryptFailReason
  constructor(reason: DecryptFailReason, message: string) {
    super(message)
    this.reason = reason
  }
}

/**
 * Decrypt an encrypted xlsx into plain zip bytes. Throws XlsxDecryptError with
 * reason 'wrong-password' (verifier mismatch — reprompt) or 'unsupported'
 * (exotic scheme, e.g. WPS account encryption).
 */
export async function decryptXlsx(bytes: Buffer, password: string): Promise<Buffer> {
  try {
    return await officeCrypto.decrypt(bytes, { password })
  } catch (err) {
    const message = String((err as Error)?.message ?? err)
    if (message.includes('password is incorrect')) {
      throw new XlsxDecryptError('wrong-password', message)
    }
    throw new XlsxDecryptError('unsupported', message)
  }
}

/** Re-encrypt plain xlsx zip bytes with ECMA-376 Agile (Excel 2013+ default). */
export function encryptXlsx(bytes: Buffer, password: string): Buffer {
  return officeCrypto.encrypt(bytes, { password })
}
