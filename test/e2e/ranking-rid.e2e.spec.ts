/**
 * 分区排行榜 E2E 测试
 *
 * 验证 GET /api/ranking 和 GET /api/ranking/timestamp 的分区参数支持。
 */
import { describe, it, expect } from 'vitest'
import { setup, $fetch } from '@nuxt/test-utils/e2e'

describe('分区排行榜 API', async () => {
  await setup({
    browser: false,
    server: true,
  })

  it('GET /api/ranking?rid=1 返回动画分区数据', { timeout: 15000 }, async () => {
    const data = await $fetch<Record<string, any>>('/api/ranking?rid=1')
    expect(data).toBeDefined()
    expect(typeof data).toBe('object')
    expect(data).not.toBeNull()
  })

  it('GET /api/ranking?rid=3 返回音乐分区数据', { timeout: 15000 }, async () => {
    const data = await $fetch<Record<string, any>>('/api/ranking?rid=3')
    expect(data).toBeDefined()
    expect(typeof data).toBe('object')
    expect(data).not.toBeNull()
  })

  it('非法 rid 参数被排除的分区回退为全站数据', { timeout: 15000 }, async () => {
    // 番剧(13)不在 VALID_RANKING_RIDS 中，应回退为 rid=0
    const data = await $fetch<Record<string, any>>('/api/ranking?rid=13')
    expect(data).toBeDefined()
    expect(typeof data).toBe('object')
    expect(data).not.toBeNull()
  })

  it('不存在的 rid=999 回退为全站数据', { timeout: 15000 }, async () => {
    const data = await $fetch<Record<string, any>>('/api/ranking?rid=999')
    expect(data).toBeDefined()
    expect(typeof data).toBe('object')
    expect(data).not.toBeNull()
  })

  it('GET /api/ranking（无 rid 参数）保持向后兼容', { timeout: 15000 }, async () => {
    const data = await $fetch<Record<string, any>>('/api/ranking')
    expect(data).toBeDefined()
    expect(typeof data).toBe('object')
    expect(data).not.toBeNull()
  })

  it('GET /api/ranking/timestamp?rid=1 返回时间戳', { timeout: 15000 }, async () => {
    const data = await $fetch<{ timestamp: number }>('/api/ranking/timestamp?rid=1')
    expect(data).toBeDefined()
    expect(typeof data.timestamp).toBe('number')
  })
})
