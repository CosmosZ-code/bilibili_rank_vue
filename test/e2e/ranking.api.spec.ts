/**
 * API HTTP 响应测试
 *
 * 启动真实 Nuxt 测试服务器，验证每个 API 端点返回正确的 HTTP 状态码
 * 这是对 server/ 目录位置问题的兜底测试
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { setup, $fetch, createPage } from '@nuxt/test-utils/e2e'

describe('API 端点 HTTP 响应', async () => {
  // 启动 Nuxt 测试服务器
  await setup({
    browser: false,
    server: true,
  })

	it('GET /api/ranking 返回 200（不是 404）', { timeout: 15000 }, async () => {
	    const data = await $fetch('/api/ranking')
	    expect(data).toBeDefined()
	    expect(typeof data).toBe('object')
	    expect(data).not.toBeNull()
	  })

  it('GET /api/ranking 返回的视频播放量和弹幕数不为 0', { timeout: 30000 }, async () => {
    const data = await $fetch<Record<string, any>>('/api/ranking')
    const items = data.items
    expect(items.length).toBeGreaterThan(0)

    // 统计非零数据的视频数量
    let nonZeroPlay = 0
    let nonZeroDanmaku = 0
    const zeroBvids: string[] = []

    for (const item of items) {
      if (item.play_count_num > 0) {
        nonZeroPlay++
      } else {
        zeroBvids.push(`${item.bvid}(play)`)
      }
      if (item.danmaku_count_num > 0) {
        nonZeroDanmaku++
      } else {
        zeroBvids.push(`${item.bvid}(danmaku)`)
      }
    }

    // 至少 50% 的视频应有非零播放量和弹幕数
    // 如果 B站 API 不可用 → 使用 mock 数据 → 100% 非零
    // 如果 B站 API 可用 → 真实数据大部分非零
    const threshold = Math.max(1, Math.floor(items.length * 0.5))
    expect(nonZeroPlay, `零播放量视频过多 (${nonZeroPlay}/${items.length})`).toBeGreaterThanOrEqual(threshold)
    expect(nonZeroDanmaku, `零弹幕数视频过多 (${nonZeroDanmaku}/${items.length})`).toBeGreaterThanOrEqual(threshold)
  })

  it('GET /api/banners 返回 200', async () => {
    const data = await $fetch('/api/banners')
    expect(data).toBeDefined()
    expect(Array.isArray(data)).toBe(true)
    expect(data.length).toBeGreaterThan(0)
  })

  it('GET /api/history 无 Cookie 返回 401', async () => {
    try {
      await $fetch('/api/history')
      expect.unreachable('应抛出 401 错误')
    } catch (err: any) {
      expect(err.statusCode || err.response?.status).toBe(401)
    }
  })

  it('GET /api/favorites 无 Cookie 返回 401', async () => {
    try {
      await $fetch('/api/favorites')
      expect.unreachable('应抛出 401 错误')
    } catch (err: any) {
      expect(err.statusCode || err.response?.status).toBe(401)
    }
  })

  it('RankingResponse 包含全部必需字段', { timeout: 15000 }, async () => {
    const data = await $fetch<Record<string, any>>('/api/ranking')
    expect(data).toHaveProperty('items')
    expect(data).toHaveProperty('total')
    expect(data).toHaveProperty('page')
    expect(data).toHaveProperty('pageSize')
    expect(data).toHaveProperty('hasMore')
    expect(data).toHaveProperty('timestamp')
    expect(Array.isArray(data.items)).toBe(true)
  })

  it('page=1&pageSize=10 返回 ≤10 条 items', { timeout: 15000 }, async () => {
    const data = await $fetch<Record<string, any>>('/api/ranking?page=1&pageSize=10')
    expect(data.items.length).toBeLessThanOrEqual(10)
    expect(data.total).toBeGreaterThanOrEqual(data.items.length)
    expect(data.page).toBe(1)
    expect(data.pageSize).toBe(10)
  })

  it('page=999&pageSize=30 返回空 items', { timeout: 15000 }, async () => {
    const data = await $fetch<Record<string, any>>('/api/ranking?page=999&pageSize=30')
    expect(data.items).toEqual([])
    expect(data.hasMore).toBe(false)
  })

  it('不传 pageSize 时默认 30', { timeout: 15000 }, async () => {
    const data = await $fetch<Record<string, any>>('/api/ranking')
    expect(data.pageSize).toBe(30)
  })
})
