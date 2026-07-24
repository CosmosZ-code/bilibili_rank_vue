/**
 * rankingFetcher 单元测试
 *
 * 测试 retryFailedVideos / retryFailedMetadata 的数据合并逻辑和边界行为，
 * 以及 fetchRankingData 的端点跳过、失败追踪、existingData 合并。
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

// 动态导入（必须在 vi.mock 之后）
const { retryFailedVideos, retryFailedMetadata, fetchRankingData } = await import('../../server/utils/rankingFetcher')

/** 创建测试用的 VideoInfo */
function makeVideo(overrides: Partial<{
  online_count: string
  count_num: number
  pic: string
  play_count_num: number
  danmaku_count_num: number
  play_count: string
  danmaku_count: string
}> = {}) {
  return {
    title: '测试视频',
    owner: '测试UP主',
    mid: '12345',
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

// ============================================================
// fetchRankingData — 端点跳过、失败追踪、existingData 合并
// ============================================================

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

describe('fetchRankingData — 端点跳过与失败追踪', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    // 默认 mock：在线人数返回固定值
    mockGetOnlineCount.mockResolvedValue({ formatted: '1000', raw: 1000 })
  })

  it('正常拉取两个端点', async () => {
    mockGetRanking.mockResolvedValue([makeRankingVideo('BV1xx'), makeRankingVideo('BV2yy')])
    mockGetPopular.mockResolvedValue([makeRankingVideo('BV3zz')])

    const result = await fetchRankingData()

    expect(result).not.toBeNull()
    expect(result!.rankingFailed).toBe(false)
    expect(result!.popularFailed).toBe(false)
    expect(Object.keys(result!.data).length).toBe(3)
    expect(mockGetRanking).toHaveBeenCalledTimes(1)
    expect(mockGetPopular).toHaveBeenCalledTimes(1)
  })

  it('skipRanking 跳过后仅拉取热门，排行失败标志为 false', async () => {
    mockGetPopular.mockResolvedValue([makeRankingVideo('BV1xx'), makeRankingVideo('BV2yy')])

    const result = await fetchRankingData({ skipRanking: true })

    expect(result).not.toBeNull()
    expect(result!.rankingFailed).toBe(false)
    expect(result!.popularFailed).toBe(false)
    expect(Object.keys(result!.data).length).toBe(2)
    expect(mockGetRanking).not.toHaveBeenCalled()
    expect(mockGetPopular).toHaveBeenCalledTimes(1)
  })

  it('skipPopular 跳过后仅拉取排行，热门失败标志为 false', async () => {
    mockGetRanking.mockResolvedValue([makeRankingVideo('BV1xx')])

    const result = await fetchRankingData({ skipPopular: true })

    expect(result).not.toBeNull()
    expect(result!.rankingFailed).toBe(false)
    expect(result!.popularFailed).toBe(false)
    expect(Object.keys(result!.data).length).toBe(1)
    expect(mockGetRanking).toHaveBeenCalledTimes(1)
    expect(mockGetPopular).not.toHaveBeenCalled()
  })

  it('排行返回空数组时 rankingFailed=true', async () => {
    mockGetRanking.mockResolvedValue([])
    mockGetPopular.mockResolvedValue([makeRankingVideo('BV1xx'), makeRankingVideo('BV2yy')])

    const result = await fetchRankingData()

    expect(result).not.toBeNull()
    expect(result!.rankingFailed).toBe(true)
    expect(result!.popularFailed).toBe(false)
    expect(Object.keys(result!.data).length).toBe(2) // 仅热门数据
  })

  it('热门返回空数组时 popularFailed=true', async () => {
    mockGetRanking.mockResolvedValue([makeRankingVideo('BV1xx')])
    mockGetPopular.mockResolvedValue([])

    const result = await fetchRankingData()

    expect(result).not.toBeNull()
    expect(result!.rankingFailed).toBe(false)
    expect(result!.popularFailed).toBe(true)
    expect(Object.keys(result!.data).length).toBe(1) // 仅排行数据
  })

  it('排行抛异常时 rankingFailed=true（withTimeout 兜底）', async () => {
    mockGetRanking.mockRejectedValue(new Error('-352'))
    mockGetPopular.mockResolvedValue([makeRankingVideo('BV1xx')])

    const result = await fetchRankingData()

    expect(result).not.toBeNull()
    expect(result!.rankingFailed).toBe(true)
    expect(result!.popularFailed).toBe(false)
  })

  it('两个端点都失败时返回 null', async () => {
    mockGetRanking.mockResolvedValue([])
    mockGetPopular.mockResolvedValue([])

    const result = await fetchRankingData()

    expect(result).toBeNull()
  })

  it('existingData 保留已有数据，新数据覆盖同 BVid', async () => {
    const existing: VideosDataMap = {
      BV1xx: {
        title: '旧视频', owner: '旧UP主', mid: '999',
        pic: 'https://old.jpg', online_count: '500', count_num: 500,
        play_count_num: 1000, danmaku_count_num: 50,
        play_count: '1000', danmaku_count: '50',
      },
    }

    mockGetRanking.mockResolvedValue([
      makeRankingVideo('BV1xx', { title: '新视频', ownerName: '新UP主' }),
      makeRankingVideo('BV2yy', { title: '新增视频' }),
    ])
    // 不拉取热门
    mockGetPopular.mockResolvedValue([])

    const result = await fetchRankingData({ existingData: existing, skipPopular: true })

    expect(result).not.toBeNull()
    // BV1xx 被新数据覆盖（title 变了），BV2yy 新增，共计 2 条
    expect(Object.keys(result!.data).length).toBe(2)
    expect(result!.data['BV1xx'].title).toBe('新视频')
    expect(result!.data['BV1xx'].owner).toBe('新UP主')
    expect(result!.data['BV2yy'].title).toBe('新增视频')
  })

  it('skipRanking + existingData 时仅追加热门新视频', async () => {
    const existing: VideosDataMap = {
      BV_OLD: {
        title: '旧排行视频', owner: 'UP主', mid: '1',
        pic: 'https://old.jpg', online_count: '500', count_num: 500,
        play_count_num: 1000, danmaku_count_num: 50,
        play_count: '1000', danmaku_count: '50',
      },
    }

    mockGetPopular.mockResolvedValue([
      makeRankingVideo('BV_NEW', { title: '新热门视频' }),
      makeRankingVideo('BV_OLD', { title: '热门也有此视频' }), // 同 BVid，应跳过
    ])

    const result = await fetchRankingData({ skipRanking: true, existingData: existing })

    expect(result).not.toBeNull()
    // BV_OLD 已存在，被新热门数据覆盖；BV_NEW 新增 → 共 2 条
    expect(Object.keys(result!.data).length).toBe(2)
    // BV_OLD 被新数据覆盖
    expect(result!.data['BV_OLD'].title).toBe('热门也有此视频')
    expect(result!.data['BV_NEW'].title).toBe('新热门视频')
    expect(mockGetRanking).not.toHaveBeenCalled()
  })

  it('skipRanking + skipPopular 均为 true 但无 existingData 时返回 null', async () => {
    const result = await fetchRankingData({ skipRanking: true, skipPopular: true })

    expect(result).toBeNull()
    expect(mockGetRanking).not.toHaveBeenCalled()
    expect(mockGetPopular).not.toHaveBeenCalled()
  })

  it('skipRanking + skipPopular 均为 true 且有 existingData 时保留所有旧数据', async () => {
    const existing: VideosDataMap = {
      BV1xx: {
        title: '保留视频', owner: 'UP主', mid: '1',
        pic: 'https://keep.jpg', online_count: '500', count_num: 500,
        play_count_num: 1000, danmaku_count_num: 50,
        play_count: '1000', danmaku_count: '50',
      },
    }

    const result = await fetchRankingData({
      skipRanking: true, skipPopular: true, existingData: existing,
    })

    expect(result).not.toBeNull()
    expect(Object.keys(result!.data).length).toBe(1)
    expect(result!.data['BV1xx'].title).toBe('保留视频')
    expect(result!.rankingFailed).toBe(false)
    expect(result!.popularFailed).toBe(false)
  })
})
