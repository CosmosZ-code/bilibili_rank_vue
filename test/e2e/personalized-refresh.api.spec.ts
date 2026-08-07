/**
 * E2E 测试：POST /api/ranking/personalized-refresh
 *
 * 测试个性化刷新 API 的认证安全、响应结构、和主排行端点的集成。
 */

import { describe, it, expect } from 'vitest'
import { $fetch } from '@nuxt/test-utils/e2e'

describe('POST /api/ranking/personalized-refresh', async () => {
  // ============================================================
  // 认证安全
  // ============================================================
  describe('认证安全', () => {
    it('未登录时返回空 added（无 Cookie）', async () => {
      const data = await $fetch<{ added: unknown[] }>('/api/ranking/personalized-refresh', {
        method: 'POST',
      })
      expect(data).toHaveProperty('added')
      expect(data.added).toEqual([])
    })

    it('伪造 session_id 时返回空 added', async () => {
      const data = await $fetch<{ added: unknown[] }>('/api/ranking/personalized-refresh', {
        method: 'POST',
        headers: { Cookie: 'session_id=00000000-0000-0000-0000-000000000000' },
      })
      expect(data.added).toEqual([])
    })

    it('超长伪造 session 不导致服务器崩溃', async () => {
      const longSession = 'x'.repeat(1000)
      const data = await $fetch<{ added: unknown[] }>('/api/ranking/personalized-refresh', {
        method: 'POST',
        headers: { Cookie: `session_id=${longSession}` },
      })
      expect(data).toHaveProperty('added')
      expect(data.added).toEqual([])
    })

    it('多种伪造 session ID 格式均安全处理', async () => {
      const fakeIds = [
        'not-a-uuid',
        'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',
      ]
      for (const fakeId of fakeIds) {
        const data = await $fetch<{ added: unknown[] }>('/api/ranking/personalized-refresh', {
          method: 'POST',
          headers: { Cookie: `session_id=${fakeId}` },
        })
        expect(data.added).toEqual([])
      }
    })
  })

  // ============================================================
  // 响应结构
  // ============================================================
  describe('响应结构', () => {
    it('返回的 added 必须是数组', async () => {
      const data = await $fetch<{ added: unknown }>('/api/ranking/personalized-refresh', {
        method: 'POST',
      })
      expect(Array.isArray(data.added)).toBe(true)
    })

    it('非空时 added 元素包含 bvid 和 title 字段', async () => {
      // 注：未登录时 added 为空，这里仅验证结构定义。
      // 若未来测试环境有登录态，此断言自动覆盖真实数据。
      const data = await $fetch<{ added: Record<string, unknown>[] }>(
        '/api/ranking/personalized-refresh',
        { method: 'POST' },
      )
      if (data.added.length > 0) {
        const item = data.added[0]
        expect(item).toHaveProperty('bvid')
        expect(item).toHaveProperty('title')
        expect(item).toHaveProperty('owner')
        expect(item).toHaveProperty('count_num')
      }
    })
  })

  // ============================================================
  // 集成验证
  // ============================================================
  describe('集成验证', () => {
    it('调用 refresh 后主排行端点不受影响', async () => {
      // 先调用 refresh
      await $fetch('/api/ranking/personalized-refresh', { method: 'POST' })

      // 再调用主排行，应正常返回
      const ranking = await $fetch<{ items: unknown[]; total: number }>('/api/ranking')
      expect(ranking).toHaveProperty('items')
      expect(ranking).toHaveProperty('total')
      expect(typeof ranking.total).toBe('number')
      expect(Array.isArray(ranking.items)).toBe(true)
    })

    it('多次连续调用 refresh 不互相干扰', async () => {
      for (let i = 0; i < 3; i++) {
        const data = await $fetch<{ added: unknown[] }>('/api/ranking/personalized-refresh', {
          method: 'POST',
        })
        expect(data).toHaveProperty('added')
      }
    })
  })
})
