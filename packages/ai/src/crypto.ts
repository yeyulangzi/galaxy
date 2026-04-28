import crypto from 'node:crypto'
import os from 'node:os'

const ALGORITHM = 'aes-256-gcm'
const IV_LENGTH = 12
const TAG_LENGTH = 16

/**
 * 获取 AES-256 加密密钥。
 * 优先使用环境变量 GALAXY_ENCRYPTION_KEY，
 * 否则用机器特征（hostname + homedir）派生一个确定性 key。
 */
function getEncryptionKey(): Buffer {
  const envKey = process.env.GALAXY_ENCRYPTION_KEY
  if (envKey) {
    return crypto.createHash('sha256').update(envKey).digest()
  }
  const machineFingerprint = `${os.hostname()}:${os.homedir()}`
  return crypto.createHash('sha256').update(machineFingerprint).digest()
}

/**
 * AES-256-GCM 加密。
 * 返回格式：base64(iv):base64(authTag):base64(ciphertext)
 */
export function encrypt(plaintext: string): string {
  const key = getEncryptionKey()
  const iv = crypto.randomBytes(IV_LENGTH)
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv)

  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()])
  const authTag = cipher.getAuthTag()

  return `${iv.toString('base64')}:${authTag.toString('base64')}:${encrypted.toString('base64')}`
}

/**
 * AES-256-GCM 解密。
 * 输入格式：base64(iv):base64(authTag):base64(ciphertext)
 */
export function decrypt(encrypted: string): string {
  const parts = encrypted.split(':')
  if (parts.length !== 3) {
    // Not in encrypted format — treat as plaintext (backward compat)
    return encrypted
  }

  try {
    const [ivBase64, tagBase64, ciphertextBase64] = parts
    const key = getEncryptionKey()
    const iv = Buffer.from(ivBase64, 'base64')
    const authTag = Buffer.from(tagBase64, 'base64')
    const ciphertext = Buffer.from(ciphertextBase64, 'base64')

    const decipher = crypto.createDecipheriv(ALGORITHM, key, iv)
    decipher.setAuthTag(authTag)

    const decrypted = Buffer.concat([decipher.update(ciphertext), decipher.final()])
    return decrypted.toString('utf8')
  } catch {
    // Decryption failed — likely plaintext, return as-is
    return encrypted
  }
}
