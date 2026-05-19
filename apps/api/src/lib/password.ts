import { scrypt, randomBytes, timingSafeEqual, type ScryptOptions } from 'node:crypto'

// Must match better-auth's scrypt config so passwords hashed here can be
// verified by better-auth's credential provider (and vice-versa).
const SCRYPT_N = 16384
const SCRYPT_R = 16
const SCRYPT_P = 1
const SCRYPT_DK_LEN = 64
const SCRYPT_MAXMEM = 128 * SCRYPT_N * SCRYPT_R * 2

const SCRYPT_OPTIONS: ScryptOptions = {
  N: SCRYPT_N,
  r: SCRYPT_R,
  p: SCRYPT_P,
  maxmem: SCRYPT_MAXMEM,
}

// Hand-written Promise wrapper instead of util.promisify: TS's promisify
// type helper can't resolve scrypt's overloaded signature (the options
// overload isn't picked), which rejects the 4-arg call at compile time.
function scryptKey(password: string, salt: string): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scrypt(
      password.normalize('NFKC'),
      salt,
      SCRYPT_DK_LEN,
      SCRYPT_OPTIONS,
      (err, derivedKey) => {
        if (err) reject(err)
        else resolve(derivedKey)
      },
    )
  })
}

/**
 * Hash a password using scrypt with a random salt.
 * Format: "<salt_hex>:<hash_hex>" — compatible with better-auth's credential provider.
 */
export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16).toString('hex')
  const hash = await scryptKey(password, salt)
  return `${salt}:${hash.toString('hex')}`
}

/**
 * Verify a password against a stored hash.
 */
export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [salt, storedHash] = stored.split(':')
  if (!salt || !storedHash) return false
  const hash = await scryptKey(password, salt)
  return timingSafeEqual(hash, Buffer.from(storedHash, 'hex'))
}
