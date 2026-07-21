/**
 * Cookie 加解密工具（Web Crypto API 版本）
 *
 * 使用 Web Crypto API 的 AES-256-GCM 加密
 * 同时兼容 Node.js 和 Cloudflare Workers 运行时
 *
 * 密文格式：salt(32) + iv(16) + ciphertext+tag（Base64 编码）
 *   - salt: 32 字节随机盐
 *   - iv:   16 字节初始化向量
 *   - 剩余: AES-GCM 加密结果（密文 + 16 字节 auth tag 自动附加）
 */

const ALGORITHM = 'AES-GCM'
const IV_LENGTH = 16
const SALT_LENGTH = 32
const KEY_LENGTH = 32
const ITERATIONS = 100_000
const HASH = 'SHA-256'
const AUTH_TAG_LENGTH = 16 // GCM 标准认证标签长度

/**
 * 从密码派生加密密钥（PBKDF2）
 */
async function deriveKey(password: string, salt: Uint8Array): Promise<CryptoKey> {
  const encoder = new TextEncoder()
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    encoder.encode(password),
    'PBKDF2',
    false,
    ['deriveBits', 'deriveKey'],
  )

  return crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt,
      iterations: ITERATIONS,
      hash: HASH,
    },
    keyMaterial,
    { name: ALGORITHM, length: KEY_LENGTH * 8 },
    false,
    ['encrypt', 'decrypt'],
  )
}

/**
 * 加密文本
 * @param text - 明文
 * @param password - 加密密码
 * @returns Base64 编码的密文（格式：salt + iv + ciphertext+tag）
 */
export async function encrypt(text: string, password: string): Promise<string> {
  const encoder = new TextEncoder()

  const salt = crypto.getRandomValues(new Uint8Array(SALT_LENGTH))
  const iv = crypto.getRandomValues(new Uint8Array(IV_LENGTH))
  const key = await deriveKey(password, salt)

  const encrypted = await crypto.subtle.encrypt(
    { name: ALGORITHM, iv },
    key,
    encoder.encode(text),
  )

  // 合并：salt(32) + iv(16) + ciphertext+tag(variable)
  const result = new Uint8Array(SALT_LENGTH + IV_LENGTH + encrypted.byteLength)
  result.set(salt, 0)
  result.set(iv, SALT_LENGTH)
  result.set(new Uint8Array(encrypted), SALT_LENGTH + IV_LENGTH)

  return btoa(String.fromCharCode(...result))
}

/**
 * 解密文本
 * @param encryptedText - Base64 编码的密文
 * @param password - 解密密码
 * @returns 明文
 */
export async function decrypt(encryptedText: string, password: string): Promise<string> {
  const decoder = new TextDecoder()

  // Base64 → Uint8Array
  const raw = Uint8Array.from(atob(encryptedText), (c) => c.charCodeAt(0))

  const salt = raw.slice(0, SALT_LENGTH)
  const iv = raw.slice(SALT_LENGTH, SALT_LENGTH + IV_LENGTH)
  const ciphertext = raw.slice(SALT_LENGTH + IV_LENGTH)

  const key = await deriveKey(password, salt)

  const decrypted = await crypto.subtle.decrypt(
    { name: ALGORITHM, iv },
    key,
    ciphertext,
  )

  return decoder.decode(decrypted)
}
