/**
 * mergePersonalizedPreserved / fetchPersonalizedOnly 单元测试
 *
 * 测试个性化缓存防淘汰合并逻辑：
 * - 跌出热门榜增量但在线人数 ≥ 500 的视频保留 + 续拉在线人数
 * - 在线人数 < 500 时淘汰
 * - cids 收集与合并（在线人数接口必需参数）
 * - 增量不做 20 条截断
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { VideosDataMap } from '../../app/types'

// Mock bilibili 模块
const mockGetOnlineCount = vi.fn()
const mockGetPopular = vi.fn()

vi.mock('../../server/utils/bilibili', () => ({
  getBilibiliRanking: vi.fn(),
  getBilibiliPopular: mockGetPopular,
  getBilibiliOnlineCount: mockGetOnlineCount,
  getBilibiliVideoStats: vi.fn(),
  ensureHttps: vi.fn((url: string) => url),
  dedupByBvid: vi.fn((list: any[]) => list),
  formatCount: vi.fn((num: number) => String(num)),
}))

vi.mock('../../server/utils/rankingConstants', () => ({
  VALID_RANKING_RIDS: ['0', '1', '3'],
  COMBINED_CACHE_KEY: 'ranking:all',
  POPULAR_CACHE_KEY: 'popular:latest',
  ONLINE_TTL: 15 * 60 * 1000,
  OFF_RANKING_KEEP_THRESHOLD: 500,
  OFF_RANKING_RETAIN_TTL: 6 * 60 * 60 * 1000,
  MIN_ONLINE_COUNT: 200,
  ONLINE_BATCH_DELAY_MS: 250,
  ONLINE_BATCH_DELAY_JITTER_MS: 150,
  METADATA_RETRY_DELAY_MS: 300,
}))

const { mergePersonalizedPreserved, fetchPersonalizedOnly } = await import(
  '../../server/utils/rankingFetcher'
)
const { setPersonalizedCache, getOrFetchPersonalized } = await import(
  '../../server/utils/personalizedCache'
)

/** 创建测试用的 VideoInfo */
function makeVideo(overrides: Partial<{
  title: string
  owner: string
  mid: string
  online_count: string
  count_num: number
  pic: string
  play_count_num: number
  danmaku_count_num: number
  play_count: string
  danmaku_count: string
}> = {}) {
  return {
    title: overrides.title ?? '测试视频',
    owner: overrides.owner ?? '测试UP主',
    mid: overrides.mid ?? '12345',
    pic: overrides.pic ?? 'https://example.com/pic.jpg',
    online_count: overrides.online_count ?? '1.2万+',
    count_num: overrides.count_num ?? 12000,
    play_count_num: overrides.play_count_num ?? 10000,
    danmaku_count_num: overrides.danmaku_count_num ?? 500,
    play_count: overrides.play_count ?? '1万',
    danmaku_count: overrides.danmaku_count ?? '500',
  }
}

/** 构造热门榜视频（含 cid，匹配 RankingVideo 结构） */
function makePopularVideo(bvid: string, cid: number) {
  return {
    bvid,
    cid,
    title: `视频${bvid}`,
    pic: `https://example.com/${bvid}.jpg`,
    owner: { name: 'UP主', mid: 10001 },
    stat: { view: 99999, danmaku: 888 },
  }
}

beforeEach(() => {
  vi.clearAllMocks()
})

// ============================================================
// mergePersonalizedPreserved — 防淘汰合并
// ============================================================
describe('mergePersonalizedPreserved — 个性化缓存防淘汰合并', () => {
  it('previous 为 null 时直接返回 fresh 原样', async () => {
    const fresh = { data: { BV1: makeVideo({ count_num: 800 }) }, cids: { BV1: 111 } }
    const result = await mergePersonalizedPreserved(null, fresh, 'cookie')
    expect(result).toEqual(fresh)
    expect(mockGetOnlineCount).not.toHaveBeenCalled()
  })

  it('fresh 增量中在线人数 < 200 的视频被剔除（含 0）', async () => {
    const fresh = {
      data: {
        BV_low: makeVideo({ count_num: 150 }),
        BV_zero: makeVideo({ count_num: 0 }),
        BV_ok: makeVideo({ count_num: 200 }),
      },
      cids: { BV_low: 111, BV_zero: 222, BV_ok: 333 },
    }
    const result = await mergePersonalizedPreserved(null, fresh, 'cookie')
    expect(Object.keys(result.data)).toEqual(['BV_ok'])
    expect(result.cids.BV_low).toBe(111) // cids 保留，供后续轮次复用
  })

  it('跌出增量且 ≥500：拉取成功（≥500）→ 保留并更新在线人数', async () => {
    mockGetOnlineCount.mockResolvedValue({ formatted: '8500+', raw: 8500 })
    const previous = {
      data: { BV_old: makeVideo({ count_num: 600, online_count: '600' }) },
      timestamp: 0,
      cids: { BV_old: 111 },
    }
    const fresh = { data: { BV_new: makeVideo({ count_num: 900 }) }, cids: { BV_new: 222 } }

    const result = await mergePersonalizedPreserved(previous, fresh, 'cookie')

    expect(result.data.BV_old).toBeDefined()
    expect(result.data.BV_old.count_num).toBe(8500)
    expect(result.data.BV_old.online_count).toBe('8500+')
    expect(result.data.BV_old.title).toBe('测试视频') // 旧元数据保留
    expect(result.data.BV_new).toBeDefined()
    expect(mockGetOnlineCount).toHaveBeenCalledTimes(1)
  })

  it('跌出增量且 ≥500：拉取新值 <500 → 淘汰', async () => {
    mockGetOnlineCount.mockResolvedValue({ formatted: '300+', raw: 300 })
    const previous = {
      data: { BV_old: makeVideo({ count_num: 600 }) },
      timestamp: 0,
      cids: { BV_old: 111 },
    }

    const result = await mergePersonalizedPreserved(previous, { data: {}, cids: {} }, 'cookie')

    expect(result.data.BV_old).toBeUndefined()
  })

  it('跌出增量且 ≥500：拉取返回 0 → 淘汰（0 < 500）', async () => {
    mockGetOnlineCount.mockResolvedValue({ formatted: '0', raw: 0 })
    const previous = {
      data: { BV_old: makeVideo({ count_num: 600 }) },
      timestamp: 0,
      cids: { BV_old: 111 },
    }

    const result = await mergePersonalizedPreserved(previous, { data: {}, cids: {} }, 'cookie')

    expect(result.data.BV_old).toBeUndefined()
  })

  it('旧缓存 <500 且不在增量 → 直接移除，不拉取', async () => {
    const previous = {
      data: { BV_old: makeVideo({ count_num: 300 }) },
      timestamp: 0,
      cids: { BV_old: 111 },
    }

    const result = await mergePersonalizedPreserved(previous, { data: {}, cids: {} }, 'cookie')

    expect(result.data.BV_old).toBeUndefined()
    expect(mockGetOnlineCount).not.toHaveBeenCalled()
  })

  it('无 cid 的保留候选 → 保留旧值且不拉取（旧版缓存过渡）', async () => {
    const previous = {
      data: { BV_old: makeVideo({ count_num: 800, online_count: '800+' }) },
      timestamp: 0,
    }

    const result = await mergePersonalizedPreserved(previous, { data: {}, cids: {} }, 'cookie')

    expect(result.data.BV_old).toEqual(previous.data.BV_old)
    expect(mockGetOnlineCount).not.toHaveBeenCalled()
  })

  it('仍在增量中的视频 → 以 fresh 为准，不重复拉取', async () => {
    const previous = {
      data: { BV1: makeVideo({ count_num: 700 }) },
      timestamp: 0,
      cids: { BV1: 111 },
    }
    const fresh = {
      data: { BV1: makeVideo({ count_num: 900, online_count: '900+' }) },
      cids: { BV1: 222 },
    }

    const result = await mergePersonalizedPreserved(previous, fresh, 'cookie')

    expect(result.data.BV1.count_num).toBe(900)
    expect(mockGetOnlineCount).not.toHaveBeenCalled()
  })

  it('cids 合并：旧值保留 + 新增量覆盖', async () => {
    mockGetOnlineCount.mockResolvedValue({ formatted: '800+', raw: 800 })
    const previous = {
      data: { BV_old: makeVideo({ count_num: 600 }) },
      timestamp: 0,
      cids: { BV_old: 111, BV_shared: 1 },
    }
    const fresh = {
      data: { BV_new: makeVideo({ count_num: 900 }) },
      cids: { BV_shared: 2, BV_new: 222 },
    }

    const result = await mergePersonalizedPreserved(previous, fresh, 'cookie')

    expect(result.cids).toEqual({ BV_old: 111, BV_shared: 2, BV_new: 222 })
  })
})

// ============================================================
// fetchPersonalizedOnly — 增量拉取（含 cids，无截断）
// ============================================================
describe('fetchPersonalizedOnly — 增量拉取（含 cids，无 20 条截断）', () => {
  /** stub Nuxt 的 useStorage（纯 node 测试环境不存在） */
  function setupStorage(globalData: Record<string, unknown> | null) {
    ;(globalThis as any).useStorage = () => ({
      getItem: vi.fn().mockResolvedValue(globalData),
    })
  }

  it('增量超过 20 条时全部处理，不做截断', async () => {
    setupStorage(null)
    const videos = Array.from({ length: 25 }, (_, i) => makePopularVideo(`BV${i}`, 1000 + i))
    mockGetPopular.mockResolvedValue(videos)
    mockGetOnlineCount.mockResolvedValue({ formatted: '800+', raw: 800 })

    const result = await fetchPersonalizedOnly('cookie')

    expect(result).not.toBeNull()
    expect(Object.keys(result!.data)).toHaveLength(25)
    expect(Object.keys(result!.cids)).toHaveLength(25)
    expect(mockGetOnlineCount).toHaveBeenCalledTimes(25)
  })

  it('返回数据包含 cids 映射', async () => {
    setupStorage(null)
    mockGetPopular.mockResolvedValue([
      makePopularVideo('BV_a', 111),
      makePopularVideo('BV_b', 222),
    ])
    mockGetOnlineCount.mockResolvedValue({ formatted: '800+', raw: 800 })

    const result = await fetchPersonalizedOnly('cookie')

    expect(result).not.toBeNull()
    expect(result!.cids).toEqual({ BV_a: 111, BV_b: 222 })
    expect(result!.data.BV_a.count_num).toBe(800)
  })

  it('全局缓存中已有的视频被排除', async () => {
    setupStorage({ data: { BV_a: makeVideo() }, timestamp: 1 })
    mockGetPopular.mockResolvedValue([
      makePopularVideo('BV_a', 111),
      makePopularVideo('BV_b', 222),
    ])
    mockGetOnlineCount.mockResolvedValue({ formatted: '800+', raw: 800 })

    const result = await fetchPersonalizedOnly('cookie')

    expect(result).not.toBeNull()
    expect(Object.keys(result!.data)).toEqual(['BV_b'])
  })

  it('热门榜为空 → 返回 null', async () => {
    setupStorage(null)
    mockGetPopular.mockResolvedValue([])

    const result = await fetchPersonalizedOnly('cookie')

    expect(result).toBeNull()
  })

  it('在线人数 < 200 的增量视频被剔除（含 0，cids 保留）', async () => {
    setupStorage(null)
    mockGetPopular.mockResolvedValue([
      makePopularVideo('BV_low', 111),
      makePopularVideo('BV_zero', 222),
      makePopularVideo('BV_ok', 333),
    ])
    mockGetOnlineCount
      .mockResolvedValueOnce({ formatted: '150+', raw: 150 })
      .mockResolvedValueOnce({ formatted: '0', raw: 0 })
      .mockResolvedValueOnce({ formatted: '800+', raw: 800 })

    const result = await fetchPersonalizedOnly('cookie')

    expect(result).not.toBeNull()
    expect(Object.keys(result!.data)).toEqual(['BV_ok'])
    expect(result!.data.BV_ok.count_num).toBe(800)
    expect(result!.cids).toEqual({ BV_low: 111, BV_zero: 222, BV_ok: 333 })
  })
})

// ============================================================
// setPersonalizedCache — 写入边界过滤（扫码登录预热等路径兜底）
// ============================================================
describe('setPersonalizedCache — 写入时过滤低在线视频', () => {
  it('写入缓存的数据已剔除 <200 的视频', async () => {
    const setItem = vi.fn().mockResolvedValue(undefined)
    ;(globalThis as any).useStorage = () => ({ setItem })

    await setPersonalizedCache(123, {
      data: {
        BV_low: makeVideo({ count_num: 150 }),
        BV_zero: makeVideo({ count_num: 0 }),
        BV_ok: makeVideo({ count_num: 800 }),
      },
    })

    const [key, entry] = setItem.mock.calls[0]
    expect(key).toBe('personalized:123')
    expect(Object.keys(entry.data)).toEqual(['BV_ok'])
  })
})

// ============================================================
// getOrFetchPersonalized — 统一缓存策略 + 在途去重
// ============================================================
describe('getOrFetchPersonalized — 缓存策略与在途去重', () => {
  /** stub Nuxt 的 useStorage：getItem 返回给定缓存，setItem 记录调用 */
  function setupStorage(cachedData: Record<string, unknown> | null) {
    const setItem = vi.fn().mockResolvedValue(undefined)
    ;(globalThis as any).useStorage = () => ({
      getItem: vi.fn().mockResolvedValue(cachedData),
      setItem,
    })
    return { setItem }
  }

  const user = { id: 123, bilibiliUid: '123', bilibiliUname: '测试', bilibiliFace: null }

  it('缓存新鲜 → 零 B站 请求', async () => {
    setupStorage({ data: { BV_a: makeVideo({ count_num: 800 }) }, timestamp: Date.now() })

    const result = await getOrFetchPersonalized(user, 'cookie')

    expect(Object.keys(result!)).toEqual(['BV_a'])
    expect(mockGetPopular).not.toHaveBeenCalled()
    expect(mockGetOnlineCount).not.toHaveBeenCalled()
  })

  it('并发调用在途去重：第二个请求复用同一 Promise，B站 仅请求 1 次', async () => {
    setupStorage(null)
    mockGetPopular.mockResolvedValue([makePopularVideo('BV_a', 111)])

    // 用 gate 挂起在线人数拉取，让首次 fetch 保持"在途"
    let resolveOnline!: (v: { formatted: string; raw: number }) => void
    const onlineGate = new Promise<{ formatted: string; raw: number }>((r) => {
      resolveOnline = r
    })
    mockGetOnlineCount.mockImplementation(() => onlineGate)

    const p1 = getOrFetchPersonalized(user, 'cookie')
    const p2 = getOrFetchPersonalized(user, 'cookie')

    // 等待首次 fetch 开始（在途挂起），第二个调用应复用而非新发起
    await vi.waitFor(() => expect(mockGetPopular).toHaveBeenCalledTimes(1))

    resolveOnline({ formatted: '800+', raw: 800 })
    const [r1, r2] = await Promise.all([p1, p2])

    expect(r1).toEqual(r2)
    expect(Object.keys(r1!)).toEqual(['BV_a'])
    expect(mockGetPopular).toHaveBeenCalledTimes(1)
  })

  it('在途完成后清理：下一次调用可正常重新拉取', async () => {
    setupStorage(null)
    mockGetPopular.mockResolvedValue([makePopularVideo('BV_a', 111)])
    mockGetOnlineCount.mockResolvedValue({ formatted: '800+', raw: 800 })

    const first = await getOrFetchPersonalized(user, 'cookie')
    expect(Object.keys(first!)).toEqual(['BV_a'])
    expect(mockGetPopular).toHaveBeenCalledTimes(1)

    // 再次调用（getItem stub 不写入，缓存仍为空）→ 应重新拉取而非复用
    const second = await getOrFetchPersonalized(user, 'cookie')
    expect(Object.keys(second!)).toEqual(['BV_a'])
    expect(mockGetPopular).toHaveBeenCalledTimes(2)
  })

  // ============================================================
  // 失败路径：不回退过期数据（GET /api/ranking 与 POST 行为一致的回归防护）
  // ============================================================

  it('过期缓存 + 拉取失败 → 返回 null，且不写回旧缓存（不续期）', async () => {
    const { setItem } = setupStorage({
      data: { BV_old: makeVideo({ count_num: 800 }) },
      cids: { BV_old: 111 },
      timestamp: Date.now() - 2 * 60 * 60 * 1000, // 2 小时前（已过期）
    })
    // B站 请求失败（fetchPersonalizedOnly 内部吞错 → 返回 null）
    mockGetPopular.mockRejectedValue(new Error('B站风控 -352'))

    const result = await getOrFetchPersonalized(user, 'cookie')

    expect(result).toBeNull()
    // 不回退、不续期：setItem 不应被调用（否则 GET 会持续合并过期数据，污染榜单）
    expect(setItem).not.toHaveBeenCalled()
  })

  it('过期缓存 + 拉取结果为空（热门榜空）→ 返回 null', async () => {
    const { setItem } = setupStorage({
      data: { BV_old: makeVideo({ count_num: 800 }) },
      timestamp: Date.now() - 60 * 60 * 1000, // 1 小时前（已过期）
    })
    mockGetPopular.mockResolvedValue([]) // 热门榜为空 → fetchPersonalizedOnly 返回 null

    const result = await getOrFetchPersonalized(user, 'cookie')

    expect(result).toBeNull()
    expect(setItem).not.toHaveBeenCalled()
  })

  it('过期缓存 + 拉取成功 → 返回新数据并写回缓存（续期时间戳）', async () => {
    const staleTimestamp = Date.now() - 60 * 60 * 1000 // 1 小时前（已过期）
    const { setItem } = setupStorage({
      data: { BV_old: makeVideo({ count_num: 800 }) },
      cids: { BV_old: 111 },
      timestamp: staleTimestamp,
    })
    mockGetPopular.mockResolvedValue([makePopularVideo('BV_new', 222)])
    mockGetOnlineCount.mockResolvedValue({ formatted: '800+', raw: 800 })

    const result = await getOrFetchPersonalized(user, 'cookie')

    // 新数据返回；旧视频（≥500）防淘汰保留
    expect(result).not.toBeNull()
    expect(Object.keys(result!)).toEqual(expect.arrayContaining(['BV_old', 'BV_new']))

    // 成功路径写回缓存，时间戳续期（后续 GET /api/ranking 可合并）
    const [key, entry] = setItem.mock.calls[0]
    expect(key).toBe('personalized:123')
    expect(entry.timestamp).toBeGreaterThan(staleTimestamp)
  })
})
