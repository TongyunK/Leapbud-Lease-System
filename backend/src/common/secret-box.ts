import * as crypto from 'crypto'

/** 可逆密文前缀：enc:v1:<iv>:<tag>:<ciphertext>（均为 base64url） */
export const SECRET_BOX_PREFIX = 'enc:v1:'

function resolveKey(): Buffer {
  const secret =
    process.env.SETTINGS_SECRET?.trim() ||
    process.env.JWT_SECRET?.trim() ||
    'leapbud-dev-settings-secret'
  return crypto.createHash('sha256').update(secret, 'utf8').digest()
}

/** 是否已是本系统加密串 */
export function isSecretBoxCiphertext(value: string | null | undefined): boolean {
  return String(value || '').startsWith(SECRET_BOX_PREFIX)
}

/**
 * AES-256-GCM 加密。空串原样返回；已是 enc:v1 则不再二次加密。
 */
export function encryptSecret(plain: string | null | undefined): string {
  const text = String(plain ?? '')
  if (!text) return ''
  if (isSecretBoxCiphertext(text)) return text

  const iv = crypto.randomBytes(12)
  const cipher = crypto.createCipheriv('aes-256-gcm', resolveKey(), iv)
  const encrypted = Buffer.concat([cipher.update(text, 'utf8'), cipher.final()])
  const tag = cipher.getAuthTag()
  return [
    SECRET_BOX_PREFIX + iv.toString('base64url'),
    tag.toString('base64url'),
    encrypted.toString('base64url'),
  ].join(':')
}

/**
 * 解密。非 enc:v1 视为历史明文兼容返回；格式损坏时抛错。
 */
export function decryptSecret(stored: string | null | undefined): string {
  const raw = String(stored ?? '')
  if (!raw) return ''
  if (!isSecretBoxCiphertext(raw)) return raw

  const body = raw.slice(SECRET_BOX_PREFIX.length)
  const parts = body.split(':')
  if (parts.length !== 3) {
    throw new Error('Invalid secret box payload')
  }
  const [ivB64, tagB64, dataB64] = parts
  const iv = Buffer.from(ivB64, 'base64url')
  const tag = Buffer.from(tagB64, 'base64url')
  const data = Buffer.from(dataB64, 'base64url')
  const decipher = crypto.createDecipheriv('aes-256-gcm', resolveKey(), iv)
  decipher.setAuthTag(tag)
  return Buffer.concat([decipher.update(data), decipher.final()]).toString('utf8')
}
