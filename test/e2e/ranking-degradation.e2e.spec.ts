/**
 * 排行榜降级逻辑 E2E 测试
 *
 * 验证 API 在各种场景下的数据完整性和响应头正确性。
 * 包括数据结构验证、BV 号格式、部分降级场景、响应头合法性。
 */
import { describe, it, expect } from 'vitest'
import { setup, $fetch } from '@nuxt/test-utils/e2e'

describe('排行榜降级逻辑', async () => {
  await setup({ browser: false, server: true })

  /** 获取响应头 */
  async function getResponseHeaders(path: string): Promise<Headers> {
    const headers: Record<string, string> = {}
    await $fetch(path, {
      onResponse({ response }) {
        response.headers.forEach((value: string, key: string) => {
          headers[key] = value
        })
      },
    })
    return headers as unknown as Headers
  }

  it('API 返回数据结构包含必需的 VideoInfo 字段', async () => {
    const data = await $fetch<Record<string, any>>('/api/ranking')
    const entries = Object.entries(data)

    expect(entries.length).toBeGreaterThan(0)

    const requiredFields = [
      'title',
      'owner',
      'mid',
      'pic',
      'online_count',
      'count_num',
      'play_count_num',
      'danmaku_count_num',
      'play_count',
      'danmaku_count',
    ]

    for (const [bvid, video] of entries) {
      for (const field of requiredFields) {
        expect(
          video,
          `视频 ${bvid} 缺少字段: ${field}`,
        ).toHaveProperty(field)
      }
    }
  })

  it('所有视频的 bvid 键符合 BV 号格式', async () => {
    const data = await $fetch<Record<string, any>>('/api/ranking')

    for (const bvid of Object.keys(data)) {
      expect(bvid).toMatch(/^BV[a-zA-Z0-9]{10}$/)
    }
  })

  it('即使部分在线人数为 0，播放量和弹幕数不应全部为 0', async () => {
    const data = await $fetch<Record<string, any>>('/api/ranking')
    const entries = Object.entries(data)

    // 至少有一个视频的播放量 > 0
    const videosWithPlayCount = entries.filter(
      ([, video]) => video.play_count_num > 0,
    )
    expect(videosWithPlayCount.length).toBeGreaterThan(0)

    // 至少有一个视频的弹幕数 > 0
    const videosWithDanmaku = entries.filter(
      ([, video]) => video.danmaku_count_num > 0,
    )
    expect(videosWithDanmaku.length).toBeGreaterThan(0)
  })

  it('响应头 X-Data-Timestamp 存在且为有效数字', async () => {
    const headers = await getResponseHeaders('/api/ranking')

    const tsHeader = (headers as any)['x-data-timestamp']
    expect(tsHeader).toBeDefined()

    const ts = Number(tsHeader)
    expect(Number.isFinite(ts)).toBe(true)
    expect(ts).toBeGreaterThan(0)
    expect(ts).toBeLessThanOrEqual(Date.now())
  })

  it('响应头 X-Cache 值合法', async () => {
    const headers = await getResponseHeaders('/api/ranking')

    const cacheHeader = (headers as any)['x-cache']
    expect(cacheHeader).toBeDefined()
    expect(['HIT', 'MISS', 'MOCK']).toContain(cacheHeader)
  })

  it('GET /api/ranking?rid=0 响应头正常', async () => {
    const headers = await getResponseHeaders('/api/ranking?rid=0')

    const cacheHeader = (headers as any)['x-cache']
    expect(cacheHeader).toBeDefined()
    expect(['HIT', 'MISS', 'MOCK']).toContain(cacheHeader)

    const tsHeader = (headers as any)['x-data-timestamp']
    expect(tsHeader).toBeDefined()
    expect(Number.isFinite(Number(tsHeader))).toBe(true)
  })

  it('ranking/timestamp 端点返回有效时间戳', async () => {
    const data = await $fetch<{ timestamp: number }>('/api/ranking/timestamp')

    expect(data).toHaveProperty('timestamp')
    expect(typeof data.timestamp).toBe('number')
    expect(data.timestamp).toBeGreaterThan(0)
    expect(data.timestamp).toBeLessThanOrEqual(Date.now())
  })

  it('health 端点返回正常', async () => {
    const data = await $fetch<{ status: string; timestamp: number }>('/api/health')

    expect(data.status).toBe('ok')
    expect(data.timestamp).toBeGreaterThan(0)
  })
})
