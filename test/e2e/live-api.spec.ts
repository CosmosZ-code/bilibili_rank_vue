/**
 * 直播 API HTTP 响应测试
 *
 * 启动真实 Nuxt 测试服务器，验证直播 API 端点返回正确结构。
 */
import { describe, it, expect } from 'vitest'
import { setup, $fetch } from '@nuxt/test-utils/e2e'

describe('直播 API 端点', async () => {
  await setup({ browser: false, server: true })

  it('GET /api/live-rooms 返回 LiveRankingResponse 结构', { timeout: 15000 }, async () => {
    const data = await $fetch<Record<string, any>>('/api/live-rooms')
    expect(data).toHaveProperty('items')
    expect(data).toHaveProperty('total')
    expect(data).toHaveProperty('page')
    expect(data).toHaveProperty('pageSize')
    expect(data).toHaveProperty('hasMore')
    expect(data).toHaveProperty('timestamp')
    expect(Array.isArray(data.items)).toBe(true)
  })

  it('分页参数 page & pageSize 生效', { timeout: 15000 }, async () => {
    const data = await $fetch<Record<string, any>>('/api/live-rooms?page=1&pageSize=5')
    expect(data.items.length).toBeLessThanOrEqual(5)
    expect(data.page).toBe(1)
    expect(data.pageSize).toBe(5)
    expect(data.total).toBeGreaterThanOrEqual(data.items.length)
  })

  it('search 参数过滤', { timeout: 15000 }, async () => {
    const data = await $fetch<Record<string, any>>('/api/live-rooms?search=游戏')
    // 返回的 items 中 title 或 uname 应包含"游戏"
    if (data.items.length > 0) {
      for (const item of data.items) {
        const matchesSearch =
          item.title.toLowerCase().includes('游戏') ||
          item.uname.toLowerCase().includes('游戏')
        expect(matchesSearch).toBe(true)
      }
    }
  })

  it('area_id 参数过滤', { timeout: 15000 }, async () => {
    const data = await $fetch<Record<string, any>>('/api/live-rooms?areaId=2')
    if (data.items.length > 0) {
      for (const item of data.items) {
        expect(item.parent_area_id).toBe(2)
      }
    }
  })

  it('空结果场景：返回空 items', { timeout: 15000 }, async () => {
    const data = await $fetch<Record<string, any>>('/api/live-rooms?search=这不存在的房间xyz')
    expect(data.items).toEqual([])
    expect(data.total).toBe(0)
    expect(data.hasMore).toBe(false)
  })

  it('page=999&pageSize=30 返回空 items', { timeout: 15000 }, async () => {
    const data = await $fetch<Record<string, any>>('/api/live-rooms?page=999&pageSize=30')
    expect(data.items).toEqual([])
    expect(data.hasMore).toBe(false)
  })

  it('不传 pageSize 时默认 30', { timeout: 15000 }, async () => {
    const data = await $fetch<Record<string, any>>('/api/live-rooms')
    expect(data.pageSize).toBe(30)
  })

  it('GET /api/live-areas 返回分区列表', { timeout: 15000 }, async () => {
    const data = await $fetch<{ areas: Array<{ id: number; name: string }> }>('/api/live-areas')
    expect(data).toHaveProperty('areas')
    expect(Array.isArray(data.areas)).toBe(true)
    if (data.areas.length > 0) {
      expect(data.areas[0]).toHaveProperty('id')
      expect(data.areas[0]).toHaveProperty('name')
      expect(typeof data.areas[0].id).toBe('number')
      expect(typeof data.areas[0].name).toBe('string')
    }
  })

  it('GET /api/live-rooms/timestamp 返回时间戳', { timeout: 15000 }, async () => {
    const data = await $fetch<{ timestamp: number }>('/api/live-rooms/timestamp')
    expect(data).toHaveProperty('timestamp')
    expect(typeof data.timestamp).toBe('number')
    expect(data.timestamp).toBeGreaterThan(0)
  })

  it('GET /api/live-rooms?areaId=2 返回的游戏分区 parent_area_id 均为 2', { timeout: 30000 }, async () => {
    const data = await $fetch<Record<string, any>>('/api/live-rooms?areaId=2&pageSize=10')
    if (data.items.length > 0) {
      for (const item of data.items) {
        expect(item.parent_area_id).toBe(2)
      }
    } else {
      // 空结果说明 B站该分区无直播，也算合理
      expect(data.total).toBe(0)
    }
  })

  it('GET /api/live-rooms?areaId=1&search=唱歌', { timeout: 30000 }, async () => {
    const data = await $fetch<Record<string, any>>('/api/live-rooms?areaId=1&search=唱歌')
    // 娱乐分区中搜索"唱歌"：可能空，但至少不报错
    expect(data).toHaveProperty('items')
    expect(data).toHaveProperty('total')
    expect(data).toHaveProperty('hasMore')
  })

  it('GET /api/live-rooms?areaId=999 不存在分区返回空结果', { timeout: 30000 }, async () => {
    const data = await $fetch<Record<string, any>>('/api/live-rooms?areaId=999')
    expect(data.items).toEqual([])
    expect(data.total).toBe(0)
    expect(data.hasMore).toBe(false)
  })

  it('GET /api/live-rooms/timestamp?areaId=2 返回分区时间戳', { timeout: 15000 }, async () => {
    const data = await $fetch<{ timestamp: number }>('/api/live-rooms/timestamp?areaId=2')
    expect(data).toHaveProperty('timestamp')
    expect(typeof data.timestamp).toBe('number')
  })
})
