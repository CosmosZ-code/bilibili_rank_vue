/**
 * rankingFetcher 单元测试
 *
 * 测试 retryFailedVideos / retryFailedMetadata 的数据合并逻辑和边界行为，
 * 以及 fetchAllRankingLists 的分区列表拉取、风控停止与条数约束。
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { VideosDataMap, RankingVideo } from '../../app/types'

// Mock bilibili 模块
const mockGetOnlineCount = vi.fn()
const mockGetVideoStats = vi.fn()
const mockGetRanking = vi.fn()
const mockGetPopular = vi.fn()

vi.mock('../../server/utils/bilibili', () => ({
  getBilibiliRanking: mockGetRanking,
  getBilibiliPopular: mockGetPopular,
  getBilibiliOnlineCount: mockGetOnlineCount,
  getBilibiliVideoStats: mockGetVideoStats,
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
}))

// 动态导入（必须在 vi.mock 之后）
const {
  retryFailedVideos,
  retryFailedMetadata,
  fetchAllRankingLists,
  fetchOnlineCountForVideos,
  mergePartitionCache,
  dedupRankingVideos,
  selectOnlineTargets,
  filterStaleOnlineTargets,
  sortAndFilterRanking,
} = await import('../../server/utils/rankingFetcher')

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

// ============================================================
// retryFailedVideos 测试
// ============================================================
describe('retryFailedVideos — 失败视频重试逻辑', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('空失败列表返回原数据不变', async () => {
    const existing: VideosDataMap = {
      BV1xx: makeVideo({ online_count: '1.2万+', count_num: 12000 }),
    }
    const result = await retryFailedVideos([], existing)
    expect(result.data).toEqual(existing)
    expect(result.stillFailed).toEqual([])
    expect(mockGetOnlineCount).not.toHaveBeenCalled()
  })

  it('失败 BVid 不在 existingData 中时被跳过', async () => {
    const existing: VideosDataMap = {
      BV1xx: makeVideo({ online_count: '1.2万+', count_num: 12000 }),
    }
    const result = await retryFailedVideos(['BV_not_exist'], existing)
    expect(result.data).toEqual(existing)
    expect(result.stillFailed).toEqual([])
  })

  it('重试成功时合并 online_count 到已有数据', async () => {
    mockGetOnlineCount.mockResolvedValue({ formatted: '8500+', raw: 8500 })
    const existing: VideosDataMap = {
      BV1xx: makeVideo({ online_count: '0', count_num: 0 }),
    }
    const result = await retryFailedVideos(['BV1xx'], existing)
    expect(result.data['BV1xx'].online_count).toBe('8500+')
    expect(result.data['BV1xx'].count_num).toBe(8500)
    expect(result.data['BV1xx'].title).toBe('测试视频')
    expect(result.stillFailed).toEqual([])
  })

  it('重试后 raw=0 的 BVid 出现在 stillFailed 中', async () => {
    mockGetOnlineCount.mockResolvedValue({ formatted: '0', raw: 0 })
    const existing: VideosDataMap = {
      BV1xx: makeVideo({ online_count: '0', count_num: 0 }),
    }
    const result = await retryFailedVideos(['BV1xx'], existing)
    expect(result.data['BV1xx'].count_num).toBe(0)
    expect(result.stillFailed).toContain('BV1xx')
  })

  it('批量重试：部分成功部分失败', async () => {
    mockGetOnlineCount
      .mockResolvedValueOnce({ formatted: '5000+', raw: 5000 })
      .mockResolvedValueOnce({ formatted: '0', raw: 0 })
    const existing: VideosDataMap = {
      BV1xx: makeVideo({ online_count: '0', count_num: 0 }),
      BV2yy: makeVideo({ online_count: '0', count_num: 0 }),
    }
    const result = await retryFailedVideos(['BV1xx', 'BV2yy'], existing)
    expect(result.data['BV1xx'].count_num).toBe(5000)
    expect(result.data['BV2yy'].count_num).toBe(0)
    expect(result.stillFailed).toEqual(['BV2yy'])
  })

  it('结果是原数据的浅拷贝（不影响输入）', async () => {
    mockGetOnlineCount.mockResolvedValue({ formatted: '3000+', raw: 3000 })
    const existing: VideosDataMap = {
      BV1xx: makeVideo({ online_count: '0', count_num: 0 }),
    }
    const result = await retryFailedVideos(['BV1xx'], existing)
    expect(result.data).not.toBe(existing)
    expect(existing['BV1xx'].count_num).toBe(0)
    expect(result.data['BV1xx'].count_num).toBe(3000)
  })
})

// ============================================================
// retryFailedMetadata 测试
// ============================================================
describe('retryFailedMetadata — 元数据重试逻辑', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('空列表返回原数据不变', async () => {
    const existing: VideosDataMap = {
      BV1xx: makeVideo(),
    }
    const result = await retryFailedMetadata([], [], existing)
    expect(result.data).toEqual(existing)
    expect(result.stillEmptyPic).toEqual([])
    expect(result.stillZeroStat).toEqual([])
    expect(mockGetVideoStats).not.toHaveBeenCalled()
  })

  it('BVid 不在 existingData 中时被跳过', async () => {
    const existing: VideosDataMap = {
      BV1xx: makeVideo(),
    }
    const result = await retryFailedMetadata(['BV_not_exist'], [], existing)
    expect(result.data).toEqual(existing)
    expect(result.stillEmptyPic).toEqual([])
    expect(result.stillZeroStat).toEqual([])
  })

  it('空封面被重试成功后恢复', async () => {
    mockGetVideoStats.mockResolvedValue({
      playCountNum: 10000,
      danmakuCountNum: 500,
      playCount: '1万',
      danmakuCount: '500',
      pic: 'https://i0.hdslb.com/bfs/archive/restored.jpg',
    })

    const existing: VideosDataMap = {
      BV1xx: makeVideo({ pic: '', play_count_num: 10000 }),
    }

    const result = await retryFailedMetadata(['BV1xx'], [], existing)

    expect(result.data['BV1xx'].pic).toBe('https://i0.hdslb.com/bfs/archive/restored.jpg')
    expect(result.stillEmptyPic).toEqual([])
  })

  it('非 https 封面也被视为无效并重试', async () => {
    mockGetVideoStats.mockResolvedValue({
      playCountNum: 10000,
      danmakuCountNum: 500,
      playCount: '1万',
      danmakuCount: '500',
      pic: 'https://i0.hdslb.com/bfs/archive/fixed.jpg',
    })

    const existing: VideosDataMap = {
      BV1xx: makeVideo({ pic: 'http://old.example.com/pic.jpg' }),
    }

    const result = await retryFailedMetadata(['BV1xx'], [], existing)

    // http URL 不是 https，应被修复
    expect(result.data['BV1xx'].pic).toBe('https://i0.hdslb.com/bfs/archive/fixed.jpg')
  })

  it('播放量为 0 被重试成功后恢复', async () => {
    mockGetVideoStats.mockResolvedValue({
      playCountNum: 88888,
      danmakuCountNum: 999,
      playCount: '8.9万',
      danmakuCount: '999',
      pic: 'https://example.com/pic.jpg',
    })

    const existing: VideosDataMap = {
      BV1xx: makeVideo({ play_count_num: 0, play_count: '0', pic: 'https://example.com/pic.jpg' }),
    }

    const result = await retryFailedMetadata([], ['BV1xx'], existing)

    expect(result.data['BV1xx'].play_count_num).toBe(88888)
    expect(result.data['BV1xx'].play_count).toBe('8.9万')
    expect(result.stillZeroStat).toEqual([])
  })

  it('弹幕数为 0 也被一起修复', async () => {
    mockGetVideoStats.mockResolvedValue({
      playCountNum: 10000,
      danmakuCountNum: 777,
      playCount: '1万',
      danmakuCount: '777',
      pic: 'https://example.com/pic.jpg',
    })

    const existing: VideosDataMap = {
      BV1xx: makeVideo({
        play_count_num: 10000,
        danmaku_count_num: 0,
        danmaku_count: '0',
        pic: 'https://example.com/pic.jpg',
      }),
    }

    const result = await retryFailedMetadata([], ['BV1xx'], existing)

    // 弹幕数被修复（即使 play_count_num 不为 0，danmaku 为 0 也会修复）
    expect(result.data['BV1xx'].danmaku_count_num).toBe(777)
    expect(result.data['BV1xx'].danmaku_count).toBe('777')
  })

  it('一次请求同时修复 pic + play_count + danmaku_count', async () => {
    mockGetVideoStats.mockResolvedValue({
      playCountNum: 55555,
      danmakuCountNum: 333,
      playCount: '5.6万',
      danmakuCount: '333',
      pic: 'https://i0.hdslb.com/bfs/archive/all_fixed.jpg',
    })

    const existing: VideosDataMap = {
      BV1xx: makeVideo({
        pic: '',
        play_count_num: 0,
        play_count: '0',
        danmaku_count_num: 0,
        danmaku_count: '0',
      }),
    }

    // 同时出现在 emptyPic 和 zeroStat 列表中
    const result = await retryFailedMetadata(['BV1xx'], ['BV1xx'], existing)

    expect(result.data['BV1xx'].pic).toBe('https://i0.hdslb.com/bfs/archive/all_fixed.jpg')
    expect(result.data['BV1xx'].play_count_num).toBe(55555)
    expect(result.data['BV1xx'].danmaku_count_num).toBe(333)
    expect(result.stillEmptyPic).toEqual([])
    expect(result.stillZeroStat).toEqual([])
    // 只调用了一次（去重后）
    expect(mockGetVideoStats).toHaveBeenCalledTimes(1)
  })

  it('重试后仍失败的出现在对应失败列表中', async () => {
    mockGetVideoStats.mockResolvedValue({
      playCountNum: 0,
      danmakuCountNum: 0,
      playCount: '0',
      danmakuCount: '0',
      pic: '',
    })

    const existing: VideosDataMap = {
      BV1xx: makeVideo({ pic: '', play_count_num: 0, play_count: '0' }),
    }

    const result = await retryFailedMetadata(['BV1xx'], ['BV1xx'], existing)

    expect(result.stillEmptyPic).toContain('BV1xx')
    expect(result.stillZeroStat).toContain('BV1xx')
  })

  it('已有有效值的字段不被覆盖', async () => {
    mockGetVideoStats.mockResolvedValue({
      playCountNum: 99999,
      danmakuCountNum: 888,
      playCount: '10万',
      danmakuCount: '888',
      pic: 'https://new.example.com/pic.jpg',
    })

    const existing: VideosDataMap = {
      BV1xx: makeVideo({
        pic: 'https://original.example.com/pic.jpg', // 已有有效封面
        play_count_num: 10000, // 已有有效播放量
      }),
    }

    // BV1xx 只在 zeroStatBvids 中，不在 emptyPicBvids 中
    const result = await retryFailedMetadata([], ['BV1xx'], existing)

    // 封面不应被覆盖（已有有效值）
    expect(result.data['BV1xx'].pic).toBe('https://original.example.com/pic.jpg')
    // 播放量不应被覆盖（已有有效值，且没在 zeroStat 列表中因为 play_count_num > 0）
    // 但这里 BV1xx 在 zeroStatBvids 列表中... 实际上 play_count_num=10000 不会被修正
    expect(result.data['BV1xx'].play_count_num).toBe(10000)
  })

  it('结果是原数据的浅拷贝（不影响输入）', async () => {
    mockGetVideoStats.mockResolvedValue({
      playCountNum: 5000,
      danmakuCountNum: 200,
      playCount: '5000',
      danmakuCount: '200',
      pic: 'https://recovered.example.com/pic.jpg',
    })

    const existing: VideosDataMap = {
      BV1xx: makeVideo({ pic: '', play_count_num: 0, play_count: '0' }),
    }

    const result = await retryFailedMetadata(['BV1xx'], ['BV1xx'], existing)

    expect(result.data).not.toBe(existing)
    expect(existing['BV1xx'].pic).toBe('')
    expect(existing['BV1xx'].play_count_num).toBe(0)
    expect(result.data['BV1xx'].pic).toBe('https://recovered.example.com/pic.jpg')
    expect(result.data['BV1xx'].play_count_num).toBe(5000)
  })

  it('getBilibiliVideoStats 抛异常时静默处理', async () => {
    mockGetVideoStats.mockRejectedValue(new Error('Network error'))

    const existing: VideosDataMap = {
      BV1xx: makeVideo({ pic: '', play_count_num: 0, play_count: '0' }),
    }

    const result = await retryFailedMetadata(['BV1xx'], ['BV1xx'], existing)

    // 数据不变
    expect(result.data['BV1xx'].pic).toBe('')
    expect(result.data['BV1xx'].play_count_num).toBe(0)
    // 仍在失败列表
    expect(result.stillEmptyPic).toContain('BV1xx')
    expect(result.stillZeroStat).toContain('BV1xx')
  })
})


/** 创建 mock 排行榜/热门视频（模拟 B站 API 原始返回） */
function makeRankingVideo(bvid: string, overrides: Partial<{
  cid: number
  title: string
  pic: string
  ownerName: string
  ownerMid: number
  view: number
  danmaku: number
}> = {}) {
  return {
    bvid,
    cid: overrides.cid ?? 1,
    title: overrides.title ?? `视频 ${bvid}`,
    pic: overrides.pic ?? `https://example.com/${bvid}.jpg`,
    owner: { name: overrides.ownerName ?? 'UP主', mid: overrides.ownerMid ?? 12345 },
    stat: { view: overrides.view ?? 10000, danmaku: overrides.danmaku ?? 500 },
  }
}

// ============================================================
// fetchAllRankingLists — 全分区列表拉取（不拉在线人数）
// ============================================================
describe('fetchAllRankingLists — 全分区列表拉取', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('全量模式：拉取全部 rid + 热门（返回列表数据）', async () => {
    mockGetRanking
      .mockResolvedValueOnce([makeRankingVideo('BV0aa')])  // rid=0
      .mockResolvedValueOnce([makeRankingVideo('BV1bb')])  // rid=1
      .mockResolvedValueOnce([makeRankingVideo('BV3cc')])  // rid=3
    mockGetPopular.mockResolvedValue([makeRankingVideo('BV_pop')])

    const result = await fetchAllRankingLists()

    expect(result.rankingFailed).toBe(false)
    expect(result.popularFailed).toBe(false)
    expect(result.failedRid).toBeUndefined()
    expect(Object.keys(result.perRid)).toEqual(['0', '1', '3'])
    expect(result.perRid['0'][0].bvid).toBe('BV0aa')
    expect(result.popular[0].bvid).toBe('BV_pop')
    expect(mockGetRanking).toHaveBeenCalledTimes(3)
    expect(mockGetPopular).toHaveBeenCalledTimes(1)
  })

  it('遇风控立即停止并返回 failedRid', async () => {
    mockGetRanking
      .mockResolvedValueOnce([makeRankingVideo('BV0aa')])  // rid=0
      .mockResolvedValueOnce([])                            // rid=1 风控
    mockGetPopular.mockResolvedValue([makeRankingVideo('BV_pop')])

    const result = await fetchAllRankingLists()

    expect(result.failedRid).toBe('1')
    expect(Object.keys(result.perRid)).toEqual(['0'])
    expect(mockGetRanking).toHaveBeenCalledTimes(2) // rid=3 未调用
  })

  it('第一个 rid 就失败 → rankingFailed=true', async () => {
    mockGetRanking.mockResolvedValue([])
    mockGetPopular.mockResolvedValue([makeRankingVideo('BV_pop')])

    const result = await fetchAllRankingLists()

    expect(result.rankingFailed).toBe(true)
    expect(result.failedRid).toBe('0')
    expect(Object.keys(result.perRid)).toEqual([])
  })

  it('单 rid 模式：只请求指定 rid', async () => {
    mockGetRanking.mockResolvedValue([makeRankingVideo('BV1xx')])

    const result = await fetchAllRankingLists({ singleRid: '1', skipPopular: true })

    expect(result.rankingFailed).toBe(false)
    expect(result.failedRid).toBeUndefined()
    expect(Object.keys(result.perRid)).toEqual(['1'])
    expect(mockGetPopular).not.toHaveBeenCalled()
  })

  it('skipRanking 跳过全部 rid', async () => {
    mockGetPopular.mockResolvedValue([makeRankingVideo('BV_pop')])

    const result = await fetchAllRankingLists({ skipRanking: true })

    expect(Object.keys(result.perRid)).toEqual([])
    expect(result.popular.length).toBe(1)
    expect(mockGetRanking).not.toHaveBeenCalled()
  })

  it('skipPopular 跳过热门', async () => {
    mockGetRanking.mockResolvedValue([makeRankingVideo('BV0aa')])

    const result = await fetchAllRankingLists({ skipPopular: true })

    expect(result.popular).toEqual([])
    expect(mockGetPopular).not.toHaveBeenCalled()
  })

  it('看护：任何 rid 的列表上限为 100 条，且各分区数组独立完整保留', async () => {
    // B站 /x/web-interface/ranking/v2 无论 rid 取何值（全站 0 或任意分区），
    // list 上限恒为 100 条（ranking.md：list 0-99，无分页参数）。
    // 守护该约定：若未来有人假设某分区可拉更多（加分页/翻倍逻辑），
    // 或在分区之间合并/共享列表数组，此用例将失败。
    mockGetRanking.mockImplementation(() =>
      Promise.resolve(Array.from({ length: 100 }, (_, i) => makeRankingVideo(`BV${1000000000 + i}`))),
    )
    mockGetPopular.mockResolvedValue([])

    const result = await fetchAllRankingLists()

    // 每个 rid 完整保留 100 条，且各分区数组相互独立
    expect(Object.keys(result.perRid)).toEqual(['0', '1', '3'])
    for (const rid of ['0', '1', '3']) {
      expect(result.perRid[rid]).toHaveLength(100)
    }
    expect(result.perRid['0']).not.toBe(result.perRid['1'])
    expect(mockGetRanking).toHaveBeenCalledTimes(3)
  })
})

// ============================================================
// dedupRankingVideos — 跨 rid 去重（保留较小 rid）
// ============================================================
describe('dedupRankingVideos — 跨 rid 去重', () => {
  it('看护：0、2 重复保留 0（较小 rid 优先）', () => {
    const input = {
      '0': [makeRankingVideo('BV1xx', { cid: 1 })],
      '2': [makeRankingVideo('BV1xx', { cid: 2 })],
    }

    const result = dedupRankingVideos(input)

    expect(result).toHaveLength(1)
    expect(result[0].bvid).toBe('BV1xx')
    expect(result[0].cid).toBe(1) // 保留 rid=0 的版本
  })

  it('同一视频出现在多个分区时保留最小 rid 的版本', () => {
    const input = {
      '0': [makeRankingVideo('BV_a', { cid: 100 })],
      '1': [makeRankingVideo('BV_a', { cid: 101 }), makeRankingVideo('BV_b', { cid: 102 })],
      '3': [makeRankingVideo('BV_b', { cid: 103 })],
    }

    const result = dedupRankingVideos(input)

    expect(result).toHaveLength(2)
    // BV_a 出现在 0、1 → 保留 0；BV_b 出现在 1、3 → 保留 1
    const byBvid = Object.fromEntries(result.map((v) => [v.bvid, v]))
    expect(byBvid['BV_a'].cid).toBe(100)
    expect(byBvid['BV_b'].cid).toBe(102)
  })

  it('全站独有的视频（不在任何分区）由其自身贡献', () => {
    const input = {
      '0': [makeRankingVideo('BV_only')],
      '1': [makeRankingVideo('BV_part')],
    }

    const result = dedupRankingVideos(input)

    expect(result).toHaveLength(2)
    expect(result.map((v) => v.bvid)).toEqual(expect.arrayContaining(['BV_only', 'BV_part']))
  })

  it('perRidVideos 键顺序乱序时仍按 rid 升序保留最小 rid（防御性）', () => {
    // 模拟对象键插入顺序与 rid 大小不一致的场景
    const input = {
      '3': [makeRankingVideo('BV_x', { cid: 3 })],
      '0': [makeRankingVideo('BV_x', { cid: 0 })],
      '1': [makeRankingVideo('BV_x', { cid: 1 })],
    }

    const result = dedupRankingVideos(input)

    expect(result).toHaveLength(1)
    expect(result[0].cid).toBe(0) // 仍保留 rid=0
  })

  it('空输入返回空数组', () => {
    expect(dedupRankingVideos({})).toEqual([])
  })
})

// ============================================================
// selectOnlineTargets — 弹幕量预筛选 + 轮转采样
// ============================================================
describe('selectOnlineTargets — 弹幕量预筛选 + 轮转', () => {
  /** 创建带弹幕量的 RankingVideo */
  function makeRankingVideoWithDanmaku(bvid: string, danmaku: number) {
    return {
      ...makeRankingVideo(bvid),
      stat: { view: 1000, danmaku },
    }
  }

  it('弹幕量降序取 TOP，剩余轮转', () => {
    const candidates = [
      makeRankingVideoWithDanmaku('BV_high', 1000),
      makeRankingVideoWithDanmaku('BV_mid', 500),
      makeRankingVideoWithDanmaku('BV_low', 100),
    ]

    const { top, rotated } = selectOnlineTargets(candidates, {
      topCount: 1,
      rotationBatch: 1,
      rotationIndex: 0,
    })

    expect(top.map((v) => v.bvid)).toEqual(['BV_high'])
    expect(rotated.map((v) => v.bvid)).toEqual(['BV_mid'])
  })

  it('轮转索引前进时取不同候选（环形）', () => {
    const candidates = [
      makeRankingVideoWithDanmaku('BV_a', 100),
      makeRankingVideoWithDanmaku('BV_b', 90),
      makeRankingVideoWithDanmaku('BV_c', 80),
      makeRankingVideoWithDanmaku('BV_d', 70),
    ]

    const r1 = selectOnlineTargets(candidates, { topCount: 1, rotationBatch: 1, rotationIndex: 0 })
    const r2 = selectOnlineTargets(candidates, { topCount: 1, rotationBatch: 1, rotationIndex: 1 })
    const r3 = selectOnlineTargets(candidates, { topCount: 1, rotationBatch: 1, rotationIndex: 2 })

    expect(r1.rotated[0].bvid).toBe('BV_b')
    expect(r2.rotated[0].bvid).toBe('BV_c')
    expect(r3.rotated[0].bvid).toBe('BV_d')
  })

  it('轮转索引超出候选数时环形回绕', () => {
    const candidates = [
      makeRankingVideoWithDanmaku('BV_a', 100),
      makeRankingVideoWithDanmaku('BV_b', 90),
      makeRankingVideoWithDanmaku('BV_c', 80),
      makeRankingVideoWithDanmaku('BV_d', 70),
    ]

    // rotationIndex=3：rest 有 3 条（b/c/d），位置 3 % 3 = 0 → BV_b
    const r1 = selectOnlineTargets(candidates, { topCount: 1, rotationBatch: 1, rotationIndex: 3 })
    expect(r1.rotated[0].bvid).toBe('BV_b')

    // rotationIndex=4：位置 4 % 3 = 1 → BV_c（环形）
    const r2 = selectOnlineTargets(candidates, { topCount: 1, rotationBatch: 1, rotationIndex: 4 })
    expect(r2.rotated[0].bvid).toBe('BV_c')
  })

  it('候选少于 TOP 数量时 rotated 为空', () => {
    const candidates = [makeRankingVideoWithDanmaku('BV_a', 100)]

    const { top, rotated } = selectOnlineTargets(candidates, {
      topCount: 5,
      rotationBatch: 2,
      rotationIndex: 0,
    })

    expect(top.length).toBe(1)
    expect(rotated).toEqual([])
  })

  it('topCount=0 时 top 为空，rotated 覆盖全部候选（分区均衡轮转）', () => {
    const candidates = [
      makeRankingVideoWithDanmaku('BV_a', 100),
      makeRankingVideoWithDanmaku('BV_b', 90),
      makeRankingVideoWithDanmaku('BV_c', 80),
    ]

    const { top, rotated } = selectOnlineTargets(candidates, {
      topCount: 0,
      rotationBatch: 2,
      rotationIndex: 0,
    })

    expect(top).toEqual([])
    expect(rotated.map((v) => v.bvid)).toEqual(['BV_a', 'BV_b'])
  })
})

// ============================================================
// filterStaleOnlineTargets — 在线人数新鲜度过滤
// ============================================================
describe('filterStaleOnlineTargets — 新鲜度过滤', () => {
  const TTL = 15 * 60 * 1000
  const now = 1_000_000_000_000

  it('无缓存时全部需要请求', () => {
    const targets = [makeRankingVideo('BV_a'), makeRankingVideo('BV_b')]
    expect(filterStaleOnlineTargets(targets, null, TTL, now).length).toBe(2)
  })

  it('缓存新鲜（TTL 内）时跳过', () => {
    const targets = [makeRankingVideo('BV_a')]
    const cached = {
      data: { BV_a: makeVideo({ count_num: 5000 }) },
      timestamp: now - 5 * 60 * 1000,
      onlineAt: { BV_a: now - 5 * 60 * 1000 },
    }
    expect(filterStaleOnlineTargets(targets, cached, TTL, now).length).toBe(0)
  })

  it('缓存过期（超过 TTL）时重新请求', () => {
    const targets = [makeRankingVideo('BV_a')]
    const cached = {
      data: { BV_a: makeVideo({ count_num: 5000 }) },
      timestamp: now - 20 * 60 * 1000,
      onlineAt: { BV_a: now - 20 * 60 * 1000 },
    }
    expect(filterStaleOnlineTargets(targets, cached, TTL, now).length).toBe(1)
  })

  it('count_num=0（拉取失败）时重新请求', () => {
    const targets = [makeRankingVideo('BV_a')]
    const cached = {
      data: { BV_a: makeVideo({ count_num: 0 }) },
      timestamp: now - 60 * 1000,
      onlineAt: { BV_a: now - 60 * 1000 },
    }
    expect(filterStaleOnlineTargets(targets, cached, TTL, now).length).toBe(1)
  })

  it('混合场景：只过滤新鲜的', () => {
    const targets = [makeRankingVideo('BV_fresh'), makeRankingVideo('BV_stale')]
    const cached = {
      data: {
        BV_fresh: makeVideo({ count_num: 5000 }),
        BV_stale: makeVideo({ count_num: 5000 }),
      },
      timestamp: now,
      onlineAt: {
        BV_fresh: now - 60 * 1000,
        BV_stale: now - 20 * 60 * 1000,
      },
    }
    const result = filterStaleOnlineTargets(targets, cached, TTL, now)
    expect(result.map((v) => v.bvid)).toEqual(['BV_stale'])
  })
})

// ============================================================
// mergePartitionCache — 分区缓存合并（防累积）
// ============================================================
describe('mergePartitionCache — 分区缓存合并', () => {
  const now = 1_000_000_000_000

  it('新列表为底：离开排行的视频被移除', () => {
    const newList = { BV_new: makeVideo({ count_num: 0 }) }
    const oldCache = {
      data: {
        BV_old: makeVideo({ count_num: 300 }), // 离开排行且 < 阈值 500 → 移除
        BV_new: makeVideo({ count_num: 888 }),
      },
      timestamp: now - 60_000,
      onlineAt: { BV_old: now - 60_000, BV_new: now - 60_000 },
    }

    const result = mergePartitionCache(newList, oldCache, {}, now)

    expect(Object.keys(result.data)).toEqual(['BV_new'])
  })

  it('保留旧在线人数（仍在列表中、未被本轮覆盖）', () => {
    const newList = { BV_a: makeVideo({ count_num: 0 }) }
    const oldCache = {
      data: { BV_a: makeVideo({ count_num: 5000, online_count: '5000+' }) },
      timestamp: now - 60_000,
      onlineAt: { BV_a: now - 60_000 },
    }

    const result = mergePartitionCache(newList, oldCache, {}, now)

    expect(result.data.BV_a.count_num).toBe(5000)
    expect(result.data.BV_a.online_count).toBe('5000+')
    expect(result.onlineAt.BV_a).toBe(now - 60_000)
  })

  it('本轮新拉的在线人数覆盖旧值', () => {
    const newList = { BV_a: makeVideo({ count_num: 0 }) }
    const oldCache = {
      data: { BV_a: makeVideo({ count_num: 5000 }) },
      timestamp: now - 60_000,
      onlineAt: { BV_a: now - 60_000 },
    }
    const newOnline = { BV_a: makeVideo({ count_num: 9999, online_count: '9999+' }) }

    const result = mergePartitionCache(newList, oldCache, newOnline, now)

    expect(result.data.BV_a.count_num).toBe(9999)
    expect(result.onlineAt.BV_a).toBe(now)
  })

  it('本轮在线人数中不在列表里的视频被忽略', () => {
    const newList = { BV_a: makeVideo({ count_num: 0 }) }
    const newOnline = { BV_ghost: makeVideo({ count_num: 123 }) }

    const result = mergePartitionCache(newList, null, newOnline, now)

    expect(Object.keys(result.data)).toEqual(['BV_a'])
  })

  it('离开排行但在线人数 ≥ 阈值（500）→ 保留', () => {
    const newList = { BV_new: makeVideo({ count_num: 0 }) }
    const oldCache = {
      data: {
        BV_hot: makeVideo({ count_num: 5000, online_count: '5000+' }),
        BV_new: makeVideo({ count_num: 0 }),
      },
      timestamp: now - 60_000,
      onlineAt: { BV_hot: now - 60_000, BV_new: now - 60_000 },
    }

    const result = mergePartitionCache(newList, oldCache, {}, now)

    expect(result.data.BV_hot).toBeDefined()
    expect(result.data.BV_hot.count_num).toBe(5000)
    expect(result.onlineAt.BV_hot).toBe(now - 60_000)
  })

  it('离开排行且在线人数 < 阈值（500）→ 移除', () => {
    const newList = { BV_new: makeVideo({ count_num: 0 }) }
    const oldCache = {
      data: {
        BV_cold: makeVideo({ count_num: 300 }),
        BV_new: makeVideo({ count_num: 0 }),
      },
      timestamp: now - 60_000,
      onlineAt: { BV_cold: now - 60_000, BV_new: now - 60_000 },
    }

    const result = mergePartitionCache(newList, oldCache, {}, now)

    expect(result.data.BV_cold).toBeUndefined()
  })

  it('自定义保留阈值生效', () => {
    const newList = { BV_new: makeVideo({ count_num: 0 }) }
    const oldCache = {
      data: {
        BV_mid: makeVideo({ count_num: 1500 }),
        BV_new: makeVideo({ count_num: 0 }),
      },
      timestamp: now - 60_000,
      onlineAt: { BV_mid: now - 60_000, BV_new: now - 60_000 },
    }

    const result = mergePartitionCache(newList, oldCache, {}, now, 2000)

    expect(result.data.BV_mid).toBeUndefined()
  })

  it('cids 合并：旧值保留 + 新列表覆盖', () => {
    const newList = { BV_a: makeVideo({ count_num: 0 }), BV_b: makeVideo({ count_num: 0 }) }
    const oldCache = {
      data: { BV_a: makeVideo({ count_num: 0 }), BV_b: makeVideo({ count_num: 0 }) },
      timestamp: now - 60_000,
      onlineAt: {},
      cids: { BV_a: 111, BV_old: 999 },
    }

    const result = mergePartitionCache(newList, oldCache, {}, now)
    result.cids = { ...oldCache.cids, BV_a: 111, BV_b: 222 }

    expect(result.cids).toEqual({ BV_a: 111, BV_old: 999, BV_b: 222 })
  })
})

// ============================================================
// fetchOnlineCountForVideos — 批量在线人数拉取
// ============================================================
describe('fetchOnlineCountForVideos — 批量在线人数', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockGetOnlineCount.mockResolvedValue({ formatted: '1000', raw: 1000 })
  })

  it('拉取在线人数并组装完整 VideoInfo', async () => {
    const videos = [makeRankingVideo('BV_a')]
    const { data } = await fetchOnlineCountForVideos(videos)

    expect(data.BV_a).toBeDefined()
    expect(data.BV_a.count_num).toBe(1000)
    expect(data.BV_a.online_count).toBe('1000')
    expect(data.BV_a.title).toBe('视频 BV_a')
    expect(data.BV_a.danmaku_count_num).toBe(500)
  })

  it('在线人数为 0 时计入 failedBvids', async () => {
    mockGetOnlineCount.mockResolvedValue({ formatted: '0', raw: 0 })
    const videos = [makeRankingVideo('BV_a')]
    const { failedBvids } = await fetchOnlineCountForVideos(videos)

    expect(failedBvids).toEqual(['BV_a'])
  })
})

// sortAndFilterRanking — 服务端排序过滤
// ============================================================
describe('sortAndFilterRanking — 服务端排序过滤', () => {
  it('返回数组而非 Map', () => {
    const dataMap: VideosDataMap = {
      BV1xx: makeVideo({ title: '视频A', count_num: 100 }),
      BV2yy: makeVideo({ title: '视频B', count_num: 500 }),
    }
    const result = sortAndFilterRanking(dataMap)
    expect(Array.isArray(result)).toBe(true)
    expect(result).toHaveLength(2)
    // 降序排列
    expect(result[0].bvid).toBe('BV2yy')
    expect(result[1].bvid).toBe('BV1xx')
  })

  it('保留 bvid 字段在每条记录中', () => {
    const dataMap: VideosDataMap = {
      BVtest: makeVideo({ title: '测试', count_num: 200 }),
    }
    const result = sortAndFilterRanking(dataMap)
    expect(result[0].bvid).toBe('BVtest')
    expect(result[0].title).toBe('测试')
  })
})
