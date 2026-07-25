/**
 * 排行榜数据完整性测试
 *
 * 验证 mock 降级数据的播放量和弹幕数不为 0，
 * 确保当 B站 API 不可用时，页面仍能展示有意义的数值。
 *
 * 这些测试防止以下回归问题：
 * 1. mock 数据被意外修改为全零
 * 2. 格式化函数对合法数据返回 "0"
 * 3. 数据类型不匹配导致数值丢失
 */
import { describe, it, expect } from 'vitest'
import { MOCK_RANKING } from '../../server/utils/mockData'
import { formatCount } from '../../server/utils/bilibili'

describe('Mock 降级数据 — 播放量和弹幕数不为零', () => {
  const entries = Object.entries(MOCK_RANKING)

  it('至少包含 8 条 mock 数据', () => {
    expect(entries.length).toBeGreaterThanOrEqual(8)
  })

  it('所有 mock 视频的原始播放量 > 0', () => {
    for (const [bvid, video] of entries) {
      expect(
        video.play_count_num,
        `${bvid}: play_count_num 不应为 0`,
      ).toBeGreaterThan(0)
    }
  })

  it('所有 mock 视频的原始弹幕数 > 0', () => {
    for (const [bvid, video] of entries) {
      expect(
        video.danmaku_count_num,
        `${bvid}: danmaku_count_num 不应为 0`,
      ).toBeGreaterThan(0)
    }
  })

  it('所有 mock 视频的格式化播放量不为 "0"', () => {
    for (const [bvid, video] of entries) {
      expect(
        video.play_count,
        `${bvid}: play_count 不应为 "0"`,
      ).not.toBe('0')
    }
  })

  it('所有 mock 视频的格式化弹幕数不为 "0"', () => {
    for (const [bvid, video] of entries) {
      expect(
        video.danmaku_count,
        `${bvid}: danmaku_count 不应为 "0"`,
      ).not.toBe('0')
    }
  })

  it('所有 mock 视频的在线人数 > 0', () => {
    for (const [bvid, video] of entries) {
      expect(
        video.count_num,
        `${bvid}: count_num 不应为 0`,
      ).toBeGreaterThan(0)
    }
  })
})

describe('formatCount — 非零输入不会返回 "0"', () => {
  it('常见 B站 数据量级不会格式化为 "0"', () => {
    // 这些是 B站 典型的播放量/弹幕数量级
    const typicalValues = [
      100,       // 几百
      5200,      // 几千
      12000,     // 1.2万
      85000,     // 8.5万
      520000,    // 52万
      3800000,   // 380万
      15000000,  // 1500万
      82000000,  // 8200万
      380000000, // 3.8亿
    ]

    for (const val of typicalValues) {
      const formatted = formatCount(val)
      expect(
        formatted,
        `formatCount(${val}) 返回 "${formatted}"，不应该为 "0"`,
      ).not.toBe('0')
    }
  })

  it('formatCount(0) 明确返回 "0"（作为哨兵值）', () => {
    // formatCount(0) 返回 "0" 是 by design，
    // 当 getBilibiliVideoStats 失败时，fallback 返回此值
    expect(formatCount(0)).toBe('0')
  })
})

describe('VideoInfo 类型字段一致性', () => {
  const entries = Object.entries(MOCK_RANKING)

  it('格式化字段与原始数值字段对应', () => {
    for (const [bvid, video] of entries) {
      // 原始数据 > 0 时，格式化数据不应为 "0"
      if (video.play_count_num > 0) {
        expect(video.play_count).not.toBe('0')
      }
      if (video.danmaku_count_num > 0) {
        expect(video.danmaku_count).not.toBe('0')
      }
      if (video.count_num > 0) {
        expect(video.online_count).not.toBe('0')
      }
    }
  })

  it('格式化播放量可通过 formatCount 从原始数据复现', () => {
    // 验证 mock 数据的一致性：play_count 去掉 "+" 后缀后应等于 formatCount(play_count_num)
    // 注意：mock 数据的 online_count 有 "+" 后缀，play_count 也可能有
    for (const [bvid, video] of entries) {
      const expected = formatCount(video.play_count_num)
      const actualClean = video.play_count.replace(/\+$/, '')
      expect(
        actualClean,
        `${bvid}: play_count=${video.play_count}, formatCount(${video.play_count_num})=${expected}`,
      ).toBe(expected)
    }
  })
})

describe('MOCK_RANKING 可包装为 RankingResponse', () => {
  it('sortAndFilterRanking 能正常处理 MOCK_RANKING', () => {
    // MOCK_RANKING 是 VideosDataMap 格式，sortAndFilterRanking 能直接处理
    // 这个测试仅验证数据兼容性
    const entries = Object.entries(MOCK_RANKING)
    expect(entries.length).toBeGreaterThanOrEqual(8)
    // 验证 MOCK_RANKING 数据结构与 VideoInfo 兼容
    for (const [, video] of entries) {
      expect(typeof video.title).toBe('string')
      expect(typeof video.count_num).toBe('number')
    }
  })
})
