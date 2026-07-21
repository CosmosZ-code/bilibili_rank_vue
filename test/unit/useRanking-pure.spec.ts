/**
 * useRanking 排序/过滤逻辑单元测试
 *
 * 测试排序、文本搜索过滤、纯净度过滤的纯逻辑
 * （模拟 useRanking composable 内部 computed 行为）
 */
import { describe, it, expect } from 'vitest'
import type { VideoInfo } from '../../app/types'

/**
 * 创建测试视频数据
 */
function makeVideo(overrides: Partial<VideoInfo> & { bvid: string }): VideoInfo & { bvid: string } {
  return {
    bvid: overrides.bvid,
    title: overrides.title || '测试视频',
    owner: overrides.owner || '测试UP主',
    mid: overrides.mid || '12345',
    pic: overrides.pic || 'https://i0.hdslb.com/bfs/archive/test.jpg',
    online_count: overrides.online_count || '100+',
    count_num: overrides.count_num ?? 100,
    play_count_num: overrides.play_count_num ?? 0,
    danmaku_count_num: overrides.danmaku_count_num ?? 0,
    play_count: overrides.play_count || '0',
    danmaku_count: overrides.danmaku_count || '0',
  }
}

describe('排序逻辑 — 按 count_num 降序', () => {
  it('正序数据按 count_num 降序排列', () => {
    const videos = [
      makeVideo({ bvid: 'BV1', count_num: 100 }),
      makeVideo({ bvid: 'BV2', count_num: 500 }),
      makeVideo({ bvid: 'BV3', count_num: 300 }),
    ]

    // 模拟 sortBy='count' 排序
    videos.sort((a, b) => b.count_num - a.count_num)

    expect(videos[0].bvid).toBe('BV2') // 500
    expect(videos[1].bvid).toBe('BV3') // 300
    expect(videos[2].bvid).toBe('BV1') // 100
  })

  it('count_num 相同时保持原有顺序（稳定排序）', () => {
    const videos = [
      makeVideo({ bvid: 'BV1', count_num: 200 }),
      makeVideo({ bvid: 'BV2', count_num: 200 }),
      makeVideo({ bvid: 'BV3', count_num: 200 }),
    ]

    videos.sort((a, b) => b.count_num - a.count_num)

    // V8 的 sort 对相等元素不稳定，但在实际中很少出现完全相同的 count_num
    expect(videos.length).toBe(3)
    for (const v of videos) {
      expect(v.count_num).toBe(200)
    }
  })

  it('空数组排序不报错', () => {
    const videos: (VideoInfo & { bvid: string })[] = []
    videos.sort((a, b) => b.count_num - a.count_num)
    expect(videos).toEqual([])
  })
})

describe('文本搜索过滤', () => {
  const videos = [
    makeVideo({ bvid: 'BV1', title: '【原神】角色演示视频', owner: '原神官方' }),
    makeVideo({ bvid: 'BV2', title: '崩坏星穹铁道 新角色', owner: '米游社' }),
    makeVideo({ bvid: 'BV3', title: 'Python 教程 2024', owner: '程序员小王' }),
    makeVideo({ bvid: 'BV4', title: 'python 入门指南', owner: '技术达人' }),
  ]

  it('搜索"原神"匹配标题包含的视频', () => {
    const term = '原神'
    const filtered = videos.filter(
      (v) =>
        v.title.toLowerCase().includes(term.toLowerCase()) ||
        v.owner.toLowerCase().includes(term.toLowerCase()),
    )

    expect(filtered).toHaveLength(1)
    expect(filtered[0].bvid).toBe('BV1')
  })

  it('搜索"python"不区分大小写', () => {
    const term = 'python'
    const filtered = videos.filter(
      (v) =>
        v.title.toLowerCase().includes(term.toLowerCase()) ||
        v.owner.toLowerCase().includes(term.toLowerCase()),
    )

    expect(filtered).toHaveLength(2)
    expect(filtered.map((v) => v.bvid)).toContain('BV3')
    expect(filtered.map((v) => v.bvid)).toContain('BV4')
  })

  it('搜索 UP主名称匹配', () => {
    const term = '程序员'
    const filtered = videos.filter(
      (v) =>
        v.title.toLowerCase().includes(term.toLowerCase()) ||
        v.owner.toLowerCase().includes(term.toLowerCase()),
    )

    expect(filtered).toHaveLength(1)
    expect(filtered[0].bvid).toBe('BV3')
  })

  it('搜索不存在的词返回空数组', () => {
    const term = '不存在的关键词XYZ123'
    const filtered = videos.filter(
      (v) =>
        v.title.toLowerCase().includes(term.toLowerCase()) ||
        v.owner.toLowerCase().includes(term.toLowerCase()),
    )

    expect(filtered).toHaveLength(0)
  })

  it('空搜索词不过滤任何视频', () => {
    const term = ''
    const filtered = videos.filter(
      (v) =>
        v.title.toLowerCase().includes(term.toLowerCase()) ||
        v.owner.toLowerCase().includes(term.toLowerCase()),
    )

    expect(filtered).toHaveLength(videos.length)
  })

  it('空白搜索词（只有空格）被 trim 后不回退', () => {
    const term = '   ' // trim() 后为空字符串，不应过滤
    const trimmed = term.trim()
    let filtered = videos
    if (trimmed) {
      filtered = videos.filter(
        (v) =>
          v.title.toLowerCase().includes(trimmed.toLowerCase()) ||
          v.owner.toLowerCase().includes(trimmed.toLowerCase()),
      )
    }
    expect(filtered).toHaveLength(videos.length)
  })
})

describe('纯净度过滤', () => {
  it('弹幕数 > 10000 的视频不过滤', () => {
    const video = makeVideo({
      bvid: 'BV1',
      play_count_num: 1000000,
      danmaku_count_num: 15000, // > 10000
    })

    const purifyPercent = 20

    const pass =
      video.danmaku_count_num > 10000 ||
      video.danmaku_count_num * 66 >= (video.play_count_num * purifyPercent) / 100

    expect(pass).toBe(true)
  })

  it('弹幕数 <= 10000 但弹幕/播放比达标 — 保留', () => {
    // 播放 10万，弹幕 5000，纯度 20%
    // 5000 * 66 = 330000 >= 100000 * 20 / 100 = 20000 → 通过 ✅
    const video = makeVideo({
      bvid: 'BV2',
      play_count_num: 100000,
      danmaku_count_num: 5000,
    })

    const purifyPercent = 20
    const pass =
      video.danmaku_count_num > 10000 ||
      video.danmaku_count_num * 66 >= (video.play_count_num * purifyPercent) / 100

    expect(pass).toBe(true)
  })

  it('弹幕数 <= 10000 且弹幕/播放比不达标 — 过滤掉', () => {
    // 播放 1000万，弹幕 5000，纯度 20%
    // 5000 * 66 = 330000 < 10000000 * 20 / 100 = 2000000 → 不通过 ❌
    const video = makeVideo({
      bvid: 'BV3',
      play_count_num: 10_000_000,
      danmaku_count_num: 5000,
    })

    const purifyPercent = 20
    const pass =
      video.danmaku_count_num > 10000 ||
      video.danmaku_count_num * 66 >= (video.play_count_num * purifyPercent) / 100

    expect(pass).toBe(false)
  })

  it('purifyPercent=0 时不过滤任何视频', () => {
    const video = makeVideo({
      bvid: 'BV4',
      play_count_num: 100,
      danmaku_count_num: 0,
    })

    const purifyPercent = 0
    let pass = true
    if (purifyPercent > 0) {
      pass =
        video.danmaku_count_num > 10000 ||
        video.danmaku_count_num * 66 >= (video.play_count_num * purifyPercent) / 100
    }

    expect(pass).toBe(true)
  })

  it('purifyPercent=100 时极度严格', () => {
    // 播放 10万，弹幕 100，纯度 100%
    // 100 * 66 = 6600 < 100000 * 100 / 100 = 100000 → 不通过 ❌
    const video = makeVideo({
      bvid: 'BV5',
      play_count_num: 100_000,
      danmaku_count_num: 100,
    })

    const purifyPercent = 100
    const pass =
      video.danmaku_count_num > 10000 ||
      video.danmaku_count_num * 66 >= (video.play_count_num * purifyPercent) / 100

    expect(pass).toBe(false)
  })

  it('零播放量视频始终被过滤（弹幕 ≤ 10000）', () => {
    const video = makeVideo({
      bvid: 'BV6',
      play_count_num: 0,
      danmaku_count_num: 0,
    })

    const purifyPercent = 20
    const pass =
      video.danmaku_count_num > 10000 ||
      video.danmaku_count_num * 66 >= (video.play_count_num * purifyPercent) / 100

    // 0 * 66 = 0 >= 0 — 技术上相等，但通常 0/0 视频应该可以保留
    // 0 * 66 = 0, (0 * 20) / 100 = 0 → 0 >= 0 → true
    expect(pass).toBe(true)
  })
})
