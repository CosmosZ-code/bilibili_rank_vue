/**
 * liveRoomFetcher 纯函数单元测试
 *
 * 测试 sortAndFilterLiveRooms 的排序、搜索过滤、分区过滤逻辑。
 * 遵循现有测试惯例：内联实现纯函数，避免导入 Nuxt 上下文。
 */
import { describe, it, expect } from 'vitest'
import type { LiveRoomInfo } from '../../app/types'

// ============================================================
// 内联实现：纯排序/过滤逻辑（与 liveRoomFetcher.ts 保持同步）
// ============================================================
function sortAndFilterLiveRooms(
  list: LiveRoomInfo[],
  opts: { search?: string; areaId?: number } = {},
): LiveRoomInfo[] {
  // 1. 排序：online 降序，相同则 roomid 升序
  const sorted = [...list].sort((a, b) => {
    const diff = b.online - a.online
    if (diff !== 0) return diff
    return a.roomid - b.roomid
  })

  // 2. 搜索过滤
  const term = (opts.search || '').trim().toLowerCase()
  let filtered = sorted
  if (term) {
    filtered = filtered.filter(
      (r) =>
        r.title.toLowerCase().includes(term) ||
        r.uname.toLowerCase().includes(term),
    )
  }

  // 3. 分区筛选
  const areaId = opts.areaId ?? 0
  if (areaId > 0) {
    filtered = filtered.filter((r) => r.parent_area_id === areaId)
  }

  return filtered
}

/** liveAreaCacheKey 内联实现 */
function liveAreaCacheKey(areaId?: number): string {
  if (areaId && areaId > 0) return `live:rooms:area:${areaId}`
  return 'live:rooms:all'
}

// ============================================================
// 工具函数
// ============================================================
function makeLiveRoom(overrides: Partial<LiveRoomInfo> & { roomid: number }): LiveRoomInfo {
  return {
    title: overrides.title ?? '测试直播间',
    uname: overrides.uname ?? '测试主播',
    uid: overrides.uid ?? 10000,
    roomid: overrides.roomid,
    online: overrides.online ?? 1000,
    online_formatted: overrides.online_formatted ?? '1000',
    cover: overrides.cover ?? 'https://example.com/cover.jpg',
    face: overrides.face ?? 'https://example.com/face.jpg',
    area_v2_name: overrides.area_v2_name ?? '综合',
    parent_area_name: overrides.parent_area_name ?? '娱乐',
    parent_area_id: overrides.parent_area_id ?? 1,
    link: overrides.link ?? `https://live.bilibili.com/${overrides.roomid}`,
  }
}

// ============================================================
// 排序测试
// ============================================================
describe('sortAndFilterLiveRooms — 按 online 降序', () => {
  it('按 online 数值降序排列', () => {
    const rooms = [
      makeLiveRoom({ roomid: 1, online: 100 }),
      makeLiveRoom({ roomid: 2, online: 500 }),
      makeLiveRoom({ roomid: 3, online: 300 }),
    ]

    const result = sortAndFilterLiveRooms(rooms)

    expect(result[0].roomid).toBe(2) // 500
    expect(result[1].roomid).toBe(3) // 300
    expect(result[2].roomid).toBe(1) // 100
  })

  it('online 相同时按 roomid 升序稳定', () => {
    const rooms = [
      makeLiveRoom({ roomid: 3, online: 200 }),
      makeLiveRoom({ roomid: 1, online: 200 }),
      makeLiveRoom({ roomid: 2, online: 200 }),
    ]

    const result = sortAndFilterLiveRooms(rooms)

    expect(result[0].roomid).toBe(1)
    expect(result[1].roomid).toBe(2)
    expect(result[2].roomid).toBe(3)
  })

  it('空数据不报错', () => {
    const result = sortAndFilterLiveRooms([])
    expect(result).toEqual([])
  })

  it('online 为 0 的正常排在末尾', () => {
    const rooms = [
      makeLiveRoom({ roomid: 1, online: 0 }),
      makeLiveRoom({ roomid: 2, online: 500 }),
    ]

    const result = sortAndFilterLiveRooms(rooms)

    expect(result[0].roomid).toBe(2)
    expect(result[1].roomid).toBe(1)
  })
})

// ============================================================
// 搜索过滤测试
// ============================================================
describe('sortAndFilterLiveRooms — 搜索过滤', () => {
  const rooms = [
    makeLiveRoom({ roomid: 1, title: '英雄联盟精彩集锦', uname: '电竞大神' }),
    makeLiveRoom({ roomid: 2, title: '唱歌聊天日常', uname: '甜美歌声' }),
    makeLiveRoom({ roomid: 3, title: 'Python 编程教学', uname: '程序员老张' }),
    makeLiveRoom({ roomid: 4, title: 'python 数据分析', uname: '技术达人' }),
  ]

  it('搜索"英雄"匹配标题', () => {
    const result = sortAndFilterLiveRooms(rooms, { search: '英雄' })
    expect(result).toHaveLength(1)
    expect(result[0].roomid).toBe(1)
  })

  it('搜索"python"不区分大小写', () => {
    const result = sortAndFilterLiveRooms(rooms, { search: 'python' })
    expect(result).toHaveLength(2)
    expect(result.map((r) => r.roomid)).toContain(3)
    expect(result.map((r) => r.roomid)).toContain(4)
  })

  it('搜索主播名称匹配', () => {
    const result = sortAndFilterLiveRooms(rooms, { search: '程序员' })
    expect(result).toHaveLength(1)
    expect(result[0].roomid).toBe(3)
  })

  it('搜索不存在的词返回空数组', () => {
    const result = sortAndFilterLiveRooms(rooms, { search: '不存在的内容xyz' })
    expect(result).toHaveLength(0)
  })

  it('空搜索词不过滤', () => {
    const result = sortAndFilterLiveRooms(rooms, { search: '' })
    expect(result).toHaveLength(rooms.length)
  })

  it('纯空格被 trim 后不过滤', () => {
    const result = sortAndFilterLiveRooms(rooms, { search: '   ' })
    expect(result).toHaveLength(rooms.length)
  })

  it('标题含特殊字符不抛异常', () => {
    const special = [
      makeLiveRoom({ roomid: 10, title: '🎮 游戏直播 [高能] (日更)', uname: '主播A' }),
    ]
    const result = sortAndFilterLiveRooms(special, { search: '游戏' })
    expect(result).toHaveLength(1)
    expect(result[0].roomid).toBe(10)
  })

  it('主播名含特殊字符不抛异常', () => {
    const special = [
      makeLiveRoom({ roomid: 11, title: '日常直播', uname: '测试_主播-123' }),
    ]
    const result = sortAndFilterLiveRooms(special, { search: '测试_主播' })
    expect(result).toHaveLength(1)
    expect(result[0].roomid).toBe(11)
  })
})

// ============================================================
// 分区筛选测试
// ============================================================
describe('sortAndFilterLiveRooms — 分区筛选', () => {
  const rooms = [
    makeLiveRoom({ roomid: 1, parent_area_id: 1, parent_area_name: '娱乐' }),
    makeLiveRoom({ roomid: 2, parent_area_id: 2, parent_area_name: '游戏' }),
    makeLiveRoom({ roomid: 3, parent_area_id: 1, parent_area_name: '娱乐' }),
    makeLiveRoom({ roomid: 4, parent_area_id: 3, parent_area_name: '知识' }),
  ]

  it('筛选 area_id=1 只返回娱乐分区', () => {
    const result = sortAndFilterLiveRooms(rooms, { areaId: 1 })
    expect(result).toHaveLength(2)
    expect(result.every((r) => r.parent_area_id === 1)).toBe(true)
  })

  it('筛选 area_id=2 只返回游戏分区', () => {
    const result = sortAndFilterLiveRooms(rooms, { areaId: 2 })
    expect(result).toHaveLength(1)
    expect(result[0].roomid).toBe(2)
  })

  it('area_id=0 返回所有房间（不过滤）', () => {
    const result = sortAndFilterLiveRooms(rooms, { areaId: 0 })
    expect(result).toHaveLength(rooms.length)
  })

  it('不传 areaId 返回所有房间', () => {
    const result = sortAndFilterLiveRooms(rooms)
    expect(result).toHaveLength(rooms.length)
  })

  it('area_id 不存在时返回空数组', () => {
    const result = sortAndFilterLiveRooms(rooms, { areaId: 999 })
    expect(result).toHaveLength(0)
  })
})

// ============================================================
// 综合过滤测试（搜索 + 分区）
// ============================================================
describe('sortAndFilterLiveRooms — 搜索 + 分区组合过滤', () => {
  const rooms = [
    makeLiveRoom({ roomid: 1, title: 'LOL 直播', uname: '游戏大神', parent_area_id: 2, parent_area_name: '游戏' }),
    makeLiveRoom({ roomid: 2, title: '唱歌聊天', uname: '甜美歌声', parent_area_id: 1, parent_area_name: '娱乐' }),
    makeLiveRoom({ roomid: 3, title: 'Python 教学', uname: '程序员老张', parent_area_id: 3, parent_area_name: '知识' }),
    makeLiveRoom({ roomid: 4, title: '游戏杂谈', uname: '游戏达人', parent_area_id: 2, parent_area_name: '游戏' }),
  ]

  it('搜索"游戏" + 分区 2 返回两条', () => {
    const result = sortAndFilterLiveRooms(rooms, { search: '游戏', areaId: 2 })
    expect(result).toHaveLength(2)
    expect(result.map((r) => r.roomid)).toContain(1)
    expect(result.map((r) => r.roomid)).toContain(4)
  })

  it('搜索"游戏" + 分区 1 返回空', () => {
    const result = sortAndFilterLiveRooms(rooms, { search: '游戏', areaId: 1 })
    expect(result).toHaveLength(0)
  })

  it('搜索"python" + 分区 3 返回一条', () => {
    const result = sortAndFilterLiveRooms(rooms, { search: 'python', areaId: 3 })
    expect(result).toHaveLength(1)
    expect(result[0].roomid).toBe(3)
  })
})

// ============================================================
// 分页相关测试（排序后切片验证）
// ============================================================
describe('分页 — 排序 + 切片', () => {
  it('过滤 + 排序后 total 正确', () => {
    const rooms = [
      makeLiveRoom({ roomid: 1, online: 500, title: '游戏A', parent_area_id: 2 }),
      makeLiveRoom({ roomid: 2, online: 100, title: '娱乐B', parent_area_id: 1 }),
      makeLiveRoom({ roomid: 3, online: 300, title: '游戏C', parent_area_id: 2 }),
    ]

    const filtered = sortAndFilterLiveRooms(rooms, { areaId: 2 })
    expect(filtered).toHaveLength(2)
    expect(filtered[0].roomid).toBe(1) // 500
    expect(filtered[1].roomid).toBe(3) // 300
  })

  it('分页切片：page=2 & pageSize=1 返回第 2 条', () => {
    const rooms = [
      makeLiveRoom({ roomid: 1, online: 500 }),
      makeLiveRoom({ roomid: 2, online: 100 }),
      makeLiveRoom({ roomid: 3, online: 300 }),
    ]

    const filtered = sortAndFilterLiveRooms(rooms)
    // 排序后：1(500), 3(300), 2(100)
    const page2 = filtered.slice(1, 2)
    expect(page2).toHaveLength(1)
    expect(page2[0].roomid).toBe(3)
  })

  it('最后一页不足 pageSize 时 hasMore=false', () => {
    const rooms = [
      makeLiveRoom({ roomid: 1, online: 500 }),
      makeLiveRoom({ roomid: 2, online: 100 }),
      makeLiveRoom({ roomid: 3, online: 300 }),
    ]

    const filtered = sortAndFilterLiveRooms(rooms)
    const pageSize = 2
    const page1 = filtered.slice(0, pageSize)
    const page2 = filtered.slice(pageSize, pageSize * 2)

    expect(page1).toHaveLength(2)
    expect(page2).toHaveLength(1)
    expect(filtered.length > 1 * pageSize).toBe(true)  // hasMore on page 1
    expect(filtered.length > 2 * pageSize).toBe(false) // no hasMore on page 2
  })

  it('空数据分页返回空数组', () => {
    const filtered = sortAndFilterLiveRooms([])
    expect(filtered).toEqual([])
    expect(filtered.length).toBe(0)
  })
})

// ============================================================
// liveAreaCacheKey 测试
// ============================================================
describe('liveAreaCacheKey — 缓存 key 生成', () => {
  it('areaId=undefined 返回全站 key', () => {
    expect(liveAreaCacheKey(undefined)).toBe('live:rooms:all')
  })

  it('areaId=0 返回全站 key', () => {
    expect(liveAreaCacheKey(0)).toBe('live:rooms:all')
  })

  it('areaId=2 返回分区 key', () => {
    expect(liveAreaCacheKey(2)).toBe('live:rooms:area:2')
  })
})
