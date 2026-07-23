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
	    const entries = Object.entries(data)
	    expect(entries.length).toBeGreaterThan(0)

	    // 统计非零数据的视频数量
	    let nonZeroPlay = 0
	    let nonZeroDanmaku = 0
	    const zeroBvids: string[] = []

	    for (const [bvid, video] of entries) {
	      if (video.play_count_num > 0) {
	        nonZeroPlay++
	      } else {
	        zeroBvids.push(`${bvid}(play)`)
	      }
	      if (video.danmaku_count_num > 0) {
	        nonZeroDanmaku++
	      } else {
	        zeroBvids.push(`${bvid}(danmaku)`)
	      }
	    }

	    // 至少 50% 的视频应有非零播放量和弹幕数
	    // 如果 B站 API 不可用 → 使用 mock 数据 → 100% 非零
	    // 如果 B站 API 可用 → 真实数据大部分非零
	    const threshold = Math.max(1, Math.floor(entries.length * 0.5))
	    expect(nonZeroPlay, `零播放量视频过多 (${nonZeroPlay}/${entries.length})`).toBeGreaterThanOrEqual(threshold)
	    expect(nonZeroDanmaku, `零弹幕数视频过多 (${nonZeroDanmaku}/${entries.length})`).toBeGreaterThanOrEqual(threshold)
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
})
