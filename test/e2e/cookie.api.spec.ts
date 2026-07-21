/**
 * Cookie API 业务逻辑验证（单元级别）
 *
 * 测试 crypto + POST /api/cookie 的加密存储流程
 */
import { describe, it, expect } from 'vitest'
import { encrypt, decrypt } from '../../server/utils/crypto'

describe('Cookie API 加密存储流程', () => {
  const encryptKey = 'test-secret-key-for-cookie-api'

  it('完整流程：加密 → 解密 → 原始 Cookie 可恢复', () => {
    const bilibiliCookie =
      'SESSDATA=abcd1234; bili_jct=xyz789; DedeUserID=54321; buvid3=test-buvid'

    // 模拟 POST /api/cookie 加密存储
    const encrypted = encrypt(bilibiliCookie, encryptKey)
    expect(encrypted).toBeTruthy()
    expect(encrypted.length).toBeGreaterThan(0)

    // 模拟 GET /api/history 读取并解密
    const decrypted = decrypt(encrypted, encryptKey)
    expect(decrypted).toBe(bilibiliCookie)
  })

  it('错误的密钥无法解密', () => {
    const cookie = 'SESSDATA=secret'
    const encrypted = encrypt(cookie, encryptKey)

    expect(() => decrypt(encrypted, 'wrong-key')).toThrow()
  })

  it('空 Cookie 处理', () => {
    const encrypted = encrypt('', encryptKey)
    const decrypted = decrypt(encrypted, encryptKey)
    expect(decrypted).toBe('')
  })
})
