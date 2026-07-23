/**
 * Auth Cookie 流程验证
 *
 * 测试 crypto + 新 auth 体系的加密存储流程
 * （原 cookie.post.ts 已被扫码登录替代）
 */
import { describe, it, expect } from 'vitest'
import { encrypt, decrypt } from '../../server/utils/crypto'

describe('Auth Cookie 加密流程', () => {
  const encryptKey = 'test-secret-key-for-auth'

  it('完整流程：加密 → 解密 → 原始 Cookie 可恢复', () => {
    const bilibiliCookie =
      'SESSDATA=abcd1234; bili_jct=xyz789; DedeUserID=54321; buvid3=test-buvid'

    // 模拟 auth 服务层加密存储
    const encrypted = encrypt(bilibiliCookie, encryptKey)
    expect(encrypted).toBeTruthy()
    expect(encrypted.length).toBeGreaterThan(0)

    // 模拟 auth 服务层解密读取
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

  it('与 auth 服务层使用的 encryptKey 配置一致', () => {
    // verify that the crypto module works with runtime config pattern
    const mockConfigKey = 'dev-encrypt-key-change-in-production'
    const cookie = 'SESSDATA=prod_test'

    const encrypted = encrypt(cookie, mockConfigKey)
    expect(encrypted).toBeTruthy()
    expect(decrypt(encrypted, mockConfigKey)).toBe(cookie)
  })
})
