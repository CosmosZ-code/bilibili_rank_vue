/**
 * crypto.ts 单元测试
 *
 * 测试 AES-256-GCM 加密/解密：
 * - 往返一致性
 * - 空字符串
 * - 特殊字符（中文、Unicode）
 * - 长文本
 * - 错误密码解密失败
 */
import { describe, it, expect } from 'vitest'

// 直接导入服务器工具（单元测试 Node 环境）
import { encrypt, decrypt } from '../../server/utils/crypto'

describe('encrypt / decrypt', () => {
  const password = 'test-secret-key-123456'

  it('往返一致 — 加密后解密得到原始文本', () => {
    const original = 'Hello Bilibili Cookie!'
    const encrypted = encrypt(original, password)
    const decrypted = decrypt(encrypted, password)

    expect(decrypted).toBe(original)
    // 密文应该与原文不同
    expect(encrypted).not.toBe(original)
    // 密文应该是 base64 编码
    expect(typeof encrypted).toBe('string')
    expect(encrypted.length).toBeGreaterThan(0)
  })

  it('空字符串可以正常工作', () => {
    const original = ''
    const encrypted = encrypt(original, password)
    const decrypted = decrypt(encrypted, password)

    expect(decrypted).toBe(original)
  })

  it('中文和特殊字符可以正常加解密', () => {
    const original = 'B站Cookie🐱 emoji测试 日本語 한국어 العربية'
    const encrypted = encrypt(original, password)
    const decrypted = decrypt(encrypted, password)

    expect(decrypted).toBe(original)
  })

  it('长文本可以正常加解密（模拟 B站 Cookie）', () => {
    // B站 Cookie 通常较长（包含多个字段）
    const original =
      'SESSDATA=abc123def456; bili_jct=789xyz; DedeUserID=12345678; ' +
      'DedeUserID__ckMd5=f1e069787878; sid=abcdefgh; buvid3=12345678-abcd-efgh-ijkl-123456789012'
    const encrypted = encrypt(original, password)
    const decrypted = decrypt(encrypted, password)

    expect(decrypted).toBe(original)
    expect(encrypted.length).toBeGreaterThan(original.length) // 加密后变长
  })

  it('相同的明文两次加密结果不同（随机 IV + Salt）', () => {
    const original = 'test-cookie-value'
    const encrypted1 = encrypt(original, password)
    const encrypted2 = encrypt(original, password)

    // 两次加密结果应该不同（因为随机 salt 和 IV）
    expect(encrypted1).not.toBe(encrypted2)

    // 但解密后应该相同
    expect(decrypt(encrypted1, password)).toBe(original)
    expect(decrypt(encrypted2, password)).toBe(original)
  })

  it('错误的密码解密会失败并抛出异常', () => {
    const original = 'secret data'
    const encrypted = encrypt(original, password)

    expect(() => decrypt(encrypted, 'wrong-password')).toThrow()
  })

  it('密文被篡改后解密会失败', () => {
    const original = 'tamper test'
    const encrypted = encrypt(original, password)

    // 篡改密文中间的一个字符
    const tampered = encrypted.slice(0, 5) + 'X' + encrypted.slice(6)

    expect(() => decrypt(tampered, password)).toThrow()
  })

  it('数字特殊值处理', () => {
    const testCases = [
      '0',
      '1',
      'true',
      'false',
      'null',
      'undefined',
      '{}',
      '[]',
      '!@#$%^&*()_+-=[]{}|;:,.<>?',
    ]

    for (const text of testCases) {
      const encrypted = encrypt(text, password)
      const decrypted = decrypt(encrypted, password)
      expect(decrypted).toBe(text)
    }
  })
})
