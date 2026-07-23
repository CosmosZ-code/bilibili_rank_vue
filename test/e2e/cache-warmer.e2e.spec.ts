/**
 * cache-warmer 定时刷新 E2E 测试
 *
 * 将刷新间隔设为 3 秒，验证服务端自动刷新缓存后
 * X-Data-Timestamp 随时间递增，以及缓存头和数据完整性。
 */
import { describe, it, expect } from 'vitest'
import { setup, $fetch } from '@nuxt/test-utils/e2e'

// 在启动服务器前设置短间隔
process.env.NUXT_CACHE_WARMER_REFRESH_INTERVAL_MS = '3000'

describe('cache-warmer 定时刷新', async () => {
  await setup({ browser: false, server: true })

  /** 读取当前缓存时间戳 */
  async function getTimestamp(): Promise<number> {
    let ts = 0
    await $fetch('/api/ranking', {
      onResponse({ response }) {
        ts = Number(response.headers.get('X-Data-Timestamp'))
      },
    })
    return ts
  }

  /**
   * 读取响应头中的 X-Cache 值
   */
  async function getCacheHeader(): Promise<string | null> {
    let cacheHeader: string | null = null
    await $fetch('/api/ranking', {
      onResponse({ response }) {
        cacheHeader = response.headers.get('X-Cache')
      },
    })
    return cacheHeader
  }

  /**
   * 轮询等待缓存被刷新（timestamp 变大）
   * @param previous 上次的时间戳，必须比它大才算刷新
   * @param maxWait  最长等待毫秒
   * @param pollMs   轮询间隔
   */
  async function waitForNextRefresh(
    previous: number,
    maxWait: number = 8000,
    pollMs: number = 500,
  ): Promise<number> {
    const deadline = Date.now() + maxWait
    while (Date.now() < deadline) {
      await new Promise((r) => setTimeout(r, pollMs))
      const ts = await getTimestamp()
      if (ts > previous) return ts
    }
    throw new Error(`缓存未在 ${maxWait}ms 内刷新`)
  }

  it('启动后首次读取 X-Data-Timestamp 有效', async () => {
    const ts = await getTimestamp()
    expect(ts).toBeGreaterThan(0)
    expect(ts).toBeLessThanOrEqual(Date.now())
  })

  it('每次刷新与前一次比较 — 3 次依次递增', { timeout: 30000 }, async () => {
    let prev = await getTimestamp()

    // 第 1 次
    prev = await waitForNextRefresh(prev)
    // 第 2 次
    prev = await waitForNextRefresh(prev)
    // 第 3 次
    prev = await waitForNextRefresh(prev)

    expect(prev).toBeGreaterThan(0) // 确保不是初始值
  })

  it('X-Cache 头值为 HIT 或 MISS（正常网络下不应为 MOCK）', async () => {
    const cacheHeader = await getCacheHeader()
    expect(cacheHeader).not.toBeNull()
    expect(['HIT', 'MISS']).toContain(cacheHeader)
  })

  it('多次请求间缓存 HIT 时 timestamp 保持一致', { timeout: 15000 }, async () => {
    // 等待一次刷新完成
    const ts1 = await getTimestamp()
    await waitForNextRefresh(ts1)

    // 短时间内多次请求，timestamp 应相同（缓存 HIT）
    const ts2 = await getTimestamp()
    const ts3 = await getTimestamp()
    const ts4 = await getTimestamp()

    // 在刷新间隔内（3s），多次请求应命中同一缓存
    // 注意：极其罕见情况下可能刚好跨过刷新边界，所以用 >= 而非严格 ===
    expect(ts2).toBeGreaterThanOrEqual(ts1)
    expect(ts3).toBe(ts2) // 连续请求应完全相同
    expect(ts4).toBe(ts2)
  })

  it('响应数据包含有效字段', async () => {
    const data = await $fetch<Record<string, any>>('/api/ranking')
    const entries = Object.entries(data)
    expect(entries.length).toBeGreaterThan(0)

    // 检查第一个视频的字段完整性
    const firstVideo = entries[0][1]
    expect(firstVideo).toHaveProperty('title')
    expect(firstVideo).toHaveProperty('owner')
    expect(firstVideo).toHaveProperty('mid')
    expect(firstVideo).toHaveProperty('pic')
    expect(firstVideo).toHaveProperty('online_count')
    expect(firstVideo).toHaveProperty('count_num')
    expect(firstVideo).toHaveProperty('play_count_num')
    expect(firstVideo).toHaveProperty('danmaku_count_num')
    expect(firstVideo).toHaveProperty('play_count')
    expect(firstVideo).toHaveProperty('danmaku_count')

    // title 和 owner 不应为空字符串
    expect(typeof firstVideo.title).toBe('string')
    expect(firstVideo.title.length).toBeGreaterThan(0)
    expect(typeof firstVideo.owner).toBe('string')
    expect(firstVideo.owner.length).toBeGreaterThan(0)
  })
})
