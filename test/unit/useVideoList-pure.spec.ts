/**
 * 单元测试：useVideoList 纯函数
 *
 * 测试不依赖 Vue 响应式的纯逻辑函数。
 * 环境：node
 */

import { describe, it, expect } from 'vitest'
import type { VideoWithBvid } from '../../app/types'
import {
  compareByOnlineCount,
  mergeAndSortVideos,
  buildVideoQuery,
  hasMoreVideos,
  buildPersonalizedSignature,
  buildPersonalizedToastMessage,
} from '../../app/composables/useVideoList'

// 辅助函数：创建测试用 VideoWithBvid
function makeVideo(bvid: string, count_num: number, title?: string): VideoWithBvid {
  return {
    bvid,
    title: title || `视频-${bvid}`,
    owner: '测试UP主',
    mid: '123',
    pic: 'https://example.com/pic.jpg',
    online_count: `${count_num}`,
    count_num,
    play_count_num: 10000,
    danmaku_count_num: 100,
    play_count: '1万',
    danmaku_count: '100',
  }
}

// ============================================================
// compareByOnlineCount
// ============================================================
describe('compareByOnlineCount', () => {
  it('在线人数高的排前面（降序）', () => {
    const a = makeVideo('BV1aa', 500)
    const b = makeVideo('BV1bb', 1000)
    // b.count_num > a.count_num → compareByOnlineCount(a, b) > 0（b 应排在 a 前）
    expect(compareByOnlineCount(a, b)).toBeGreaterThan(0)
  })

  it('在线人数低的排后面', () => {
    const a = makeVideo('BV1aa', 1000)
    const b = makeVideo('BV1bb', 500)
    expect(compareByOnlineCount(a, b)).toBeLessThan(0)
  })

  it('同在线人数时按 bvid 升序', () => {
    const a = makeVideo('BV1cc', 100)
    const b = makeVideo('BV1aa', 100)
    // 'BV1aa' < 'BV1cc'，b 应排在 a 前 → compareByOnlineCount(a, b) > 0
    expect(compareByOnlineCount(a, b)).toBeGreaterThan(0)
  })

  it('完全相同的 bvid 返回 0', () => {
    const a = makeVideo('BV1xx', 100, '视频A')
    const b = makeVideo('BV1xx', 100, '视频B')
    expect(compareByOnlineCount(a, b)).toBe(0)
  })
})

// ============================================================
// mergeAndSortVideos
// ============================================================
describe('mergeAndSortVideos', () => {
  it('新增视频按在线人数降序插入到正确位置', () => {
    const existing = [
      makeVideo('BV1a', 10000),
      makeVideo('BV1b', 5000),
      makeVideo('BV1c', 100),
    ]
    const added = [
      makeVideo('BV1d', 3000),
      makeVideo('BV1e', 200),
    ]
    const result = mergeAndSortVideos(existing, added)
    expect(result.map((v) => v.bvid)).toEqual(['BV1a', 'BV1b', 'BV1d', 'BV1e', 'BV1c'])
  })

  it('同在线人数时按 bvid 升序排列', () => {
    const existing = [makeVideo('BV1zz', 1000)]
    const added   = [makeVideo('BV1aa', 1000)]
    const result = mergeAndSortVideos(existing, added)
    expect(result.map((v) => v.bvid)).toEqual(['BV1aa', 'BV1zz'])
  })

  it('bvid 重复时去重，保留已有的视频', () => {
    const existing = [makeVideo('BV1a', 10000, '原始标题')]
    const added = [makeVideo('BV1a', 5000, '新标题')]
    const result = mergeAndSortVideos(existing, added)
    expect(result.length).toBe(1)
    expect(result[0].title).toBe('原始标题')
  })

  it('existing 为空时返回 added 的排序结果', () => {
    const existing: VideoWithBvid[] = []
    const added = [
      makeVideo('BV1b', 500),
      makeVideo('BV1a', 1000),
    ]
    const result = mergeAndSortVideos(existing, added)
    expect(result.map((v) => v.bvid)).toEqual(['BV1a', 'BV1b'])
  })

  it('added 为空时返回 existing 不变', () => {
    const existing = [makeVideo('BV1a', 1000), makeVideo('BV1b', 500)]
    const added: VideoWithBvid[] = []
    const result = mergeAndSortVideos(existing, added)
    expect(result.map((v) => v.bvid)).toEqual(['BV1a', 'BV1b'])
    expect(result.length).toBe(2)
  })

  it('排序结果具有确定性（多次排序结果一致）', () => {
    const existing = Array.from({ length: 10 }, (_, i) =>
      makeVideo(`BV1${String.fromCharCode(97 + i)}`, 1000),
    )
    const added: VideoWithBvid[] = []
    const result1 = mergeAndSortVideos(existing, added)
    const result2 = mergeAndSortVideos(existing, added)
    expect(result1.map((v) => v.bvid)).toEqual(result2.map((v) => v.bvid))
  })

  it('大量数据（100+）排序正确且不超时', () => {
    const existing: VideoWithBvid[] = []
    const added = Array.from({ length: 100 }, (_, i) =>
      makeVideo(`BV${String(i).padStart(8, '0')}`, Math.floor(Math.random() * 10000)),
    )
    const start = Date.now()
    const result = mergeAndSortVideos(existing, added)
    const elapsed = Date.now() - start
    expect(result.length).toBe(100)
    expect(elapsed).toBeLessThan(100) // 100 条数据应在 100ms 内完成
    // 验证排序正确性
    for (let i = 1; i < result.length; i++) {
      expect(result[i - 1].count_num).toBeGreaterThanOrEqual(result[i].count_num)
      if (result[i - 1].count_num === result[i].count_num) {
        expect(result[i - 1].bvid.localeCompare(result[i].bvid)).toBeLessThanOrEqual(0)
      }
    }
  })
})

// ============================================================
// buildVideoQuery
// ============================================================
describe('buildVideoQuery', () => {
  it('空搜索词时不传 search 参数', () => {
    const q = buildVideoQuery(1, '', 10, 'count')
    expect(q.search).toBeUndefined()
    expect(q.page).toBe(1)
    expect(q.purifyPercent).toBe(10)
  })

  it('有效搜索词时传递 search', () => {
    const q = buildVideoQuery(2, '测试', 0, 'count')
    expect(q.search).toBe('测试')
    expect(q.page).toBe(2)
    expect(q.purifyPercent).toBe(0)
  })

  it('自定义 pageSize', () => {
    const q = buildVideoQuery(1, '', 5, 'count', 50)
    expect(q.pageSize).toBe(50)
  })
})

// ============================================================
// hasMoreVideos
// ============================================================
describe('hasMoreVideos', () => {
  it('total 大于 displayed 时返回 true', () => {
    expect(hasMoreVideos(100, 30)).toBe(true)
  })

  it('total 等于 displayed 时返回 false', () => {
    expect(hasMoreVideos(30, 30)).toBe(false)
  })

  it('total 为 0 时返回 false', () => {
    expect(hasMoreVideos(0, 0)).toBe(false)
  })
})

// ============================================================
// buildPersonalizedSignature
// ============================================================
describe('buildPersonalizedSignature', () => {
  it('相同集合产生相同签名（与顺序无关）', () => {
    const items1 = [makeVideo('BV1b'), makeVideo('BV1a')]
    const items2 = [makeVideo('BV1a'), makeVideo('BV1b')]
    expect(buildPersonalizedSignature(items1)).toBe(buildPersonalizedSignature(items2))
  })

  it('不同集合产生不同签名', () => {
    const items1 = [makeVideo('BV1a'), makeVideo('BV1b')]
    const items2 = [makeVideo('BV1a'), makeVideo('BV1c')]
    expect(buildPersonalizedSignature(items1)).not.toBe(buildPersonalizedSignature(items2))
  })

  it('空数组产生空签名', () => {
    expect(buildPersonalizedSignature([])).toBe('')
  })

  it('部分重叠的集合签名不同（新增 bvid 时签名变化 → 触发通知）', () => {
    const before = [makeVideo('BV1a'), makeVideo('BV1b')]
    const after = [makeVideo('BV1a'), makeVideo('BV1b'), makeVideo('BV1c')]
    expect(buildPersonalizedSignature(after)).not.toBe(buildPersonalizedSignature(before))
  })
})

// ============================================================
// buildPersonalizedToastMessage
// ============================================================
describe('buildPersonalizedToastMessage', () => {
  it('≤3 条时全部展示标题', () => {
    const msg = buildPersonalizedToastMessage(2, ['视频A', '视频B'])
    expect(msg).toBe('个性化已追加 2 条视频：视频A、视频B')
  })

  it('>3 条时只展示前 3 个并附等 N 条', () => {
    const msg = buildPersonalizedToastMessage(5, ['A', 'B', 'C', 'D', 'E'])
    expect(msg).toBe('个性化已追加 5 条视频：A、B、C 等5条')
  })

  it('无标题时正常处理', () => {
    const msg = buildPersonalizedToastMessage(0, [])
    expect(msg).toBe('个性化已追加 0 条视频：')
  })
})
