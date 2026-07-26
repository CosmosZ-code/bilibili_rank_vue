/**
 * rankingFilter 排序/过滤逻辑单元测试
 *
 * 测试服务端 sortAndFilterRanking() 的排序、搜索、净化过滤逻辑
 * （原 useRanking-pure.spec.ts 客户端过滤逻辑的迁移 + 分页新用例）
 */
import { describe, it, expect } from 'vitest'
import type { VideosDataMap, VideoInfo } from '../../app/types'
import { sortAndFilterRanking } from '../../server/utils/rankingFetcher'

/**
 * 创建测试视频的 VideosDataMap
 */
function makeDataMap(videos: Array<Partial<VideoInfo> & { bvid: string }>): VideosDataMap {
  const map: VideosDataMap = {}
  for (const v of videos) {
    map[v.bvid] = {
      title: v.title || '测试视频',
      owner: v.owner || '测试UP主',
      mid: v.mid || '12345',
      pic: v.pic || 'https://i0.hdslb.com/bfs/archive/test.jpg',
      online_count: v.online_count || '100+',
      count_num: v.count_num ?? 100,
      play_count_num: v.play_count_num ?? 0,
      danmaku_count_num: v.danmaku_count_num ?? 0,
      play_count: v.play_count || '0',
      danmaku_count: v.danmaku_count || '0',
    }
  }
  return map
}

// ============================================================
// 排序
// ============================================================
describe('排序逻辑 — 按 count_num 降序，同值按 bvid 升序', () => {
  it('按 count_num 降序排列', () => {
    const dataMap = makeDataMap([
      { bvid: 'BV1', count_num: 100 },
      { bvid: 'BV2', count_num: 500 },
      { bvid: 'BV3', count_num: 300 },
    ])

    const result = sortAndFilterRanking(dataMap)

    expect(result[0].bvid).toBe('BV2') // 500
    expect(result[1].bvid).toBe('BV3') // 300
    expect(result[2].bvid).toBe('BV1') // 100
  })

  it('count_num 相同时按 bvid 升序稳定', () => {
    const dataMap = makeDataMap([
      { bvid: 'BV3', count_num: 200 },
      { bvid: 'BV1', count_num: 200 },
      { bvid: 'BV2', count_num: 200 },
    ])

    const result = sortAndFilterRanking(dataMap)

    // 同 count_num → bvid 升序
    expect(result[0].bvid).toBe('BV1')
    expect(result[1].bvid).toBe('BV2')
    expect(result[2].bvid).toBe('BV3')
  })

  it('空数据不报错', () => {
    const result = sortAndFilterRanking({})
    expect(result).toEqual([])
  })
})

// ============================================================
// 文本搜索过滤
// ============================================================
describe('文本搜索过滤', () => {
  const videos = makeDataMap([
    { bvid: 'BV1', title: '【原神】角色演示视频', owner: '原神官方' },
    { bvid: 'BV2', title: '崩坏星穹铁道 新角色', owner: '米游社' },
    { bvid: 'BV3', title: 'Python 教程 2024', owner: '程序员小王' },
    { bvid: 'BV4', title: 'python 入门指南', owner: '技术达人' },
  ])

  it('搜索"原神"匹配标题包含的视频', () => {
    const result = sortAndFilterRanking(videos, { search: '原神' })
    expect(result).toHaveLength(1)
    expect(result[0].bvid).toBe('BV1')
  })

  it('搜索"python"不区分大小写', () => {
    const result = sortAndFilterRanking(videos, { search: 'python' })
    expect(result).toHaveLength(2)
    expect(result.map((v) => v.bvid)).toContain('BV3')
    expect(result.map((v) => v.bvid)).toContain('BV4')
  })

  it('搜索 UP主名称匹配', () => {
    const result = sortAndFilterRanking(videos, { search: '程序员' })
    expect(result).toHaveLength(1)
    expect(result[0].bvid).toBe('BV3')
  })

  it('搜索不存在的词返回空数组', () => {
    const result = sortAndFilterRanking(videos, { search: '不存在的关键词XYZ123' })
    expect(result).toHaveLength(0)
  })

  it('空搜索词不过滤任何视频', () => {
    const result = sortAndFilterRanking(videos, { search: '' })
    expect(result).toHaveLength(Object.keys(videos).length)
  })

  it('纯空格搜索词被 trim 后不过滤', () => {
    const result = sortAndFilterRanking(videos, { search: '   ' })
    expect(result).toHaveLength(Object.keys(videos).length)
  })
})

// ============================================================
// 净化过滤
// ============================================================
describe('纯净度过滤', () => {
  it('弹幕数 > 10000 的视频不过滤', () => {
    const dataMap = makeDataMap([
      { bvid: 'BV1', play_count_num: 1_000_000, danmaku_count_num: 15000 },
    ])
    const result = sortAndFilterRanking(dataMap, { purifyPercent: 20 })
    expect(result).toHaveLength(1)
  })

  it('弹幕/播放比达标时保留', () => {
    // 播放 10万，弹幕 5000，纯度 20%
    // 5000*66=330000 >= 100000*20/100=20000 → 通过
    const dataMap = makeDataMap([
      { bvid: 'BV2', play_count_num: 100_000, danmaku_count_num: 5000 },
    ])
    const result = sortAndFilterRanking(dataMap, { purifyPercent: 20 })
    expect(result).toHaveLength(1)
  })

  it('弹幕/播放比不达标时过滤掉', () => {
    // 播放 1000万，弹幕 5000，纯度 20%
    // 5000*66=330000 < 10000000*20/100=2000000 → 不通过
    const dataMap = makeDataMap([
      { bvid: 'BV3', play_count_num: 10_000_000, danmaku_count_num: 5000 },
    ])
    const result = sortAndFilterRanking(dataMap, { purifyPercent: 20 })
    expect(result).toHaveLength(0)
  })

  it('purifyPercent=0 时不过滤任何视频', () => {
    const dataMap = makeDataMap([
      { bvid: 'BV4', play_count_num: 100, danmaku_count_num: 0 },
    ])
    const result = sortAndFilterRanking(dataMap, { purifyPercent: 0 })
    expect(result).toHaveLength(1)
  })

  it('purifyPercent=100 时极度严格', () => {
    const dataMap = makeDataMap([
      { bvid: 'BV5', play_count_num: 100_000, danmaku_count_num: 100 },
    ])
    const result = sortAndFilterRanking(dataMap, { purifyPercent: 100 })
    // 100*66=6600 < 100000*100/100=100000 → 过滤
    expect(result).toHaveLength(0)
  })

  it('零播放量但零弹幕的视频保留（0>=0 通过）', () => {
    const dataMap = makeDataMap([
      { bvid: 'BV6', play_count_num: 0, danmaku_count_num: 0 },
    ])
    const result = sortAndFilterRanking(dataMap, { purifyPercent: 20 })
    expect(result).toHaveLength(1)
  })

  it('不传 purifyPercent 时默认 0，不过滤', () => {
    const dataMap = makeDataMap([
      { bvid: 'BV7', play_count_num: 1_000_000, danmaku_count_num: 1 },
    ])
    const result = sortAndFilterRanking(dataMap)
    expect(result).toHaveLength(1)
  })
})

// ============================================================
// 新增：分页相关用例
// ============================================================
describe('分页 — 过滤 + 切片', () => {
  it('过滤后 total 正确（排序后全部过滤结果的数量）', () => {
    const dataMap = makeDataMap([
      { bvid: 'BV1', count_num: 500, title: '原神视频', play_count_num: 100_000, danmaku_count_num: 15000 },
      { bvid: 'BV2', count_num: 100, title: '无关视频', play_count_num: 10_000_000, danmaku_count_num: 100 },
      { bvid: 'BV3', count_num: 300, title: '原神攻略', play_count_num: 100_000, danmaku_count_num: 5000 },
    ])

    // 搜索"原神" 过滤后应有 BV1 和 BV3（2条）
    const filtered = sortAndFilterRanking(dataMap, { search: '原神' })
    expect(filtered.length).toBe(2) // total
    expect(filtered[0].bvid).toBe('BV1') // count_num=500
    expect(filtered[1].bvid).toBe('BV3') // count_num=300
  })

  it('分页切片：page=2&pageSize=1 返回第 2 条', () => {
    const dataMap = makeDataMap([
      { bvid: 'BV1', count_num: 500 },
      { bvid: 'BV2', count_num: 100 },
      { bvid: 'BV3', count_num: 300 },
    ])

    const filtered = sortAndFilterRanking(dataMap)
    // 排序后：BV1(500), BV3(300), BV2(100)
    const page2 = filtered.slice(1, 2) // page=2, pageSize=1
    expect(page2).toHaveLength(1)
    expect(page2[0].bvid).toBe('BV3')
  })

  it('最后一页不足 pageSize 时 hasMore=false', () => {
    const dataMap = makeDataMap([
      { bvid: 'BV1', count_num: 500 },
      { bvid: 'BV2', count_num: 100 },
      { bvid: 'BV3', count_num: 300 },
    ])

    const filtered = sortAndFilterRanking(dataMap)
    const pageSize = 2
    const total = filtered.length // 3
    const page1 = filtered.slice(0, 2)
    const page2 = filtered.slice(2, 4)

    expect(page1).toHaveLength(2)
    expect(page2).toHaveLength(1)
    expect(total > 1 * pageSize).toBe(true)  // hasMore on page 1
    expect(total > 2 * pageSize).toBe(false) // hasMore on page 2
  })

  it('搜索过滤后再分页——先在 3 条中搜到 2 条，取第 2 页', () => {
    const dataMap = makeDataMap([
      { bvid: 'BV1', count_num: 500, title: '原神视频' },
      { bvid: 'BV2', count_num: 200, title: '无关视频' },
      { bvid: 'BV3', count_num: 100, title: '原神攻略' },
    ])

    const filtered = sortAndFilterRanking(dataMap, { search: '原神' })
    // 过滤后 2 条：BV1(500), BV3(100)
    expect(filtered.length).toBe(2)

    const page1 = filtered.slice(0, 1) // pageSize=1
    expect(page1[0].bvid).toBe('BV1')

    const page2 = filtered.slice(1, 2)
    expect(page2[0].bvid).toBe('BV3')
  })

  it('空数据返回 { items:[], total:0, hasMore:false }', () => {
    const filtered = sortAndFilterRanking({})
    expect(filtered).toEqual([])
    // 模拟 API 层包装
    const pageSize = 30
    const total = filtered.length
    const items = filtered.slice(0, pageSize)
    expect(items).toEqual([])
    expect(total).toBe(0)
    expect(total > 1 * pageSize).toBe(false)
  })
})
