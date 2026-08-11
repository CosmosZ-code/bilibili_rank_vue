/**
 * Cookie 加解密工具
 *
 * 使用 Node.js 内置 crypto 模块的 AES-256-GCM 加密
 * 加密用户提交的 B站 Cookie，安全存储到 Nitro Storage
 *
 * 注意：密钥派生使用异步 pbkdf2（libuv 线程池）——
 * 同步 pbkdf2Sync 10 万次迭代会阻塞事件循环 ~50-300ms，
 * 登录用户的每个请求（auth 中间件）都要解密一次，累积会拖慢整个页面加载。
 */

import crypto from 'node:crypto'
import { promisify } from 'node:util'

const ALGORITHM = 'aes-256-gcm'
const IV_LENGTH = 16
const AUTH_TAG_LENGTH = 16
const SALT_LENGTH = 32
const KEY_LENGTH = 32
const ITERATIONS = 100000
const DIGEST = 'sha256'

const pbkdf2Async = promisify(crypto.pbkdf2)

/**
 * 从密码派生加密密钥（异步，不阻塞事件循环）
 */
async function deriveKey(password: string, salt: Buffer): Promise<Buffer> {
  return pbkdf2Async(password, salt, ITERATIONS, KEY_LENGTH, DIGEST) as Promise<Buffer>
}

/**
 * 加密文本
 * @param text - 明文
 * @param password - 加密密码
 * @returns Base64 编码的密文（格式：salt + iv + authTag + encrypted）
 */
export async function encrypt(text: string, password: string): Promise<string> {
  const salt = crypto.randomBytes(SALT_LENGTH)
  const key = await deriveKey(password, salt)
  const iv = crypto.randomBytes(IV_LENGTH)

  const cipher = crypto.createCipheriv(ALGORITHM, key, iv)
  const encrypted = Buffer.concat([cipher.update(text, 'utf8'), cipher.final()])
  const authTag = cipher.getAuthTag()

  // salt + iv + authTag + encrypted
  const result = Buffer.concat([salt, iv, authTag, encrypted])
  return result.toString('base64')
}

/**
 * 解密文本
 * @param encryptedText - Base64 编码的密文
 * @param password - 解密密码
 * @returns 明文
 */
export async function decrypt(encryptedText: string, password: string): Promise<string> {
  const buffer = Buffer.from(encryptedText, 'base64')

  const salt = buffer.subarray(0, SALT_LENGTH)
  const iv = buffer.subarray(SALT_LENGTH, SALT_LENGTH + IV_LENGTH)
  const authTag = buffer.subarray(
    SALT_LENGTH + IV_LENGTH,
    SALT_LENGTH + IV_LENGTH + AUTH_TAG_LENGTH,
  )
  const encrypted = buffer.subarray(SALT_LENGTH + IV_LENGTH + AUTH_TAG_LENGTH)

  const key = await deriveKey(password, salt)

  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv)
  decipher.setAuthTag(authTag)

  const decrypted = Buffer.concat([decipher.update(encrypted), decipher.final()])
  return decrypted.toString('utf8')
}
