/**
 * 全分区排行榜 E2E 测试
 *
 * 验证 GET /api/ranking 和 GET /api/ranking/timestamp 返回全分区合并数据。
 * rid 参数已废弃（向后兼容，所有请求统一返回 ranking:all 缓存）。
 */
import { describe, it, expect } from 'vitest'
import { setup, $fetch } from '@nuxt/test-utils/e2e'

describe('全分区排行榜 API', async () => {
  await setup({
    browser: false,
    server: true,
  })

  it('GET /api/ranking 返回全分区合并数据', { timeout: 15000 }, async () => {
    const data = await $fetch<Record<string, any>>('/api/ranking')
    expect(data).toBeDefined()
    expect(typeof data).toBe('object')
    expect(data).not.toBeNull()
    // 全分区合并后应有较多视频（至少 > 10）
    expect(Object.keys(data).length).toBeGreaterThan(10)
  })

  it('GET /api/ranking?rid=1 向后兼容（忽略 rid，返回全分区数据）', { timeout: 15000 }, async () => {
    const data = await $fetch<Record<string, any>>('/api/ranking?rid=1')
    expect(data).toBeDefined()
    expect(typeof data).toBe('object')
    expect(data).not.toBeNull()
  })

  it('GET /api/ranking?rid=3 向后兼容', { timeout: 15000 }, async () => {
    const data = await $fetch<Record<string, any>>('/api/ranking?rid=3')
    expect(data).toBeDefined()
    expect(typeof data).toBe('object')
    expect(data).not.toBeNull()
  })

  it('非法 rid 参数仍正常返回全分区数据', { timeout: 15000 }, async () => {
    const data = await $fetch<Record<string, any>>('/api/ranking?rid=13')
    expect(data).toBeDefined()
    expect(typeof data).toBe('object')
    expect(data).not.toBeNull()
  })

  it('不存在的 rid=999 仍正常返回全分区数据', { timeout: 15000 }, async () => {
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

  it('GET /api/ranking/timestamp 返回时间戳（rid 参数已废弃）', { timeout: 15000 }, async () => {
    const data = await $fetch<{ timestamp: number }>('/api/ranking/timestamp')
    expect(data).toBeDefined()
    expect(typeof data.timestamp).toBe('number')
  })

  it('不同 rid 请求返回相同数据（同一全分区缓存）', { timeout: 30000 }, async () => {
    const data0 = await $fetch<Record<string, any>>('/api/ranking')
    const data1 = await $fetch<Record<string, any>>('/api/ranking?rid=1')
    const data3 = await $fetch<Record<string, any>>('/api/ranking?rid=3')

    // 相同缓存键 → 应返回相同数据
    const keys0 = Object.keys(data0).sort()
    const keys1 = Object.keys(data1).sort()
    const keys3 = Object.keys(data3).sort()
    expect(keys0).toEqual(keys1)
    expect(keys1).toEqual(keys3)
  })
})
