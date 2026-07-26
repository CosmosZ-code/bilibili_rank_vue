/**
 * Auth API E2E 测试
 *
 * 启动真实 Nuxt 测试服务器，验证 auth 路由
 */
import { describe, it, expect } from 'vitest'
import { setup, $fetch } from '@nuxt/test-utils/e2e'

describe('Auth API 路由', async () => {
  await setup({
    browser: false,
    server: true,
  })

  describe('GET /api/auth/qr', () => {
    it('返回二维码 URL 和 qrcode_key', { timeout: 15000 }, async () => {
      try {
        const data = await $fetch<{ url: string; qrcode_key: string; cookies: string }>('/api/auth/qr')

        expect(data).toBeDefined()
        expect(typeof data.url).toBe('string')
        expect(data.url.length).toBeGreaterThan(0)
        expect(typeof data.qrcode_key).toBe('string')
        expect(data.qrcode_key.length).toBe(32) // 恒为32字符
      } catch (err: any) {
        // B站 API 不可达时静默跳过（网络错误/超时/5xx）
        if (
          err.cause?.code === 'ECONNREFUSED' ||
          err.cause?.code === 'ETIMEDOUT' ||
          err.cause?.code === 'ECONNRESET' ||
          err.statusCode >= 500 ||
          err.name === 'FetchError'
        ) {
          return
        }
        throw err
      }
    })
  })

  describe('GET /api/auth/qr-check', () => {
    it('缺少 qrcode_key 返回 400', async () => {
      try {
        await $fetch('/api/auth/qr-check')
        expect.unreachable('应抛出 400 错误')
      } catch (err: any) {
        expect(err.statusCode || err.response?.status).toBe(400)
      }
    })

    it('无效的 qrcode_key 返回二维码失效', { timeout: 15000 }, async () => {
      const data = await $fetch<{ status: string; rawCode: number }>(
        '/api/auth/qr-check?qrcode_key=invalid_key_0000000000000000',
      )

      expect(data.status).toBe('expired')
      expect(data.rawCode).toBe(86038)
    })
  })

  describe('GET /api/auth/user', () => {
    it('无 session 时返回 user=null', async () => {
      const data = await $fetch<{ user: null | Record<string, unknown> }>('/api/auth/user')

      expect(data.user).toBeNull()
    })
  })

  describe('POST /api/auth/logout', () => {
    it('无 session 时也能正常返回 ok', async () => {
      const data = await $fetch<{ ok: boolean }>('/api/auth/logout', {
        method: 'POST',
      })

      expect(data.ok).toBe(true)
    })
  })
})
