import { createHash, createCipheriv, createDecipheriv, randomBytes } from 'crypto'

/**
 * Derive a 32-byte AES key from the application secret via SHA-256.
 * This ensures a stable, correctly-sized key regardless of secret length.
 */
function deriveKey(secret: string): Buffer {
  return createHash('sha256').update(secret).digest()
}

/**
 * Encrypt a plaintext string using AES-256-GCM.
 * Returns a colon-delimited string: "<iv_hex>:<authTag_hex>:<ciphertext_hex>"
 */
export function encryptApiKey(plaintext: string, secret: string): string {
  const key = deriveKey(secret)
  const iv = randomBytes(12) // 96-bit IV recommended for GCM
  const cipher = createCipheriv('aes-256-gcm', key, iv)
  const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()])
  const authTag = cipher.getAuthTag()
  return `${iv.toString('hex')}:${authTag.toString('hex')}:${ciphertext.toString('hex')}`
}

/**
 * Decrypt a string produced by encryptApiKey.
 * Throws if the ciphertext is tampered (GCM auth tag mismatch).
 */
export function decryptApiKey(encrypted: string, secret: string): string {
  const parts = encrypted.split(':')
  if (parts.length !== 3) throw new Error('Invalid encrypted key format')
  const [ivHex, authTagHex, ciphertextHex] = parts
  const key = deriveKey(secret)
  const iv = Buffer.from(ivHex, 'hex')
  const authTag = Buffer.from(authTagHex, 'hex')
  const ciphertext = Buffer.from(ciphertextHex, 'hex')
  const decipher = createDecipheriv('aes-256-gcm', key, iv)
  decipher.setAuthTag(authTag)
  return decipher.update(ciphertext) + decipher.final('utf8')
}

/** Mask an API key for display: show first 8 chars + ••••••• */
export function maskApiKey(plaintext: string): string {
  if (plaintext.length <= 8) return '•'.repeat(plaintext.length)
  return plaintext.slice(0, 8) + '•'.repeat(Math.min(20, plaintext.length - 8))
}
