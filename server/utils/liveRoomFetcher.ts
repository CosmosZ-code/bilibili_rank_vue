/**
 * 直播间排行榜数据拉取器
 *
 * 从 B站公开 API 获取直播间列表（按在线热度排序），
 * 供 API 路由和后台定时任务使用。
 */
import type { LiveRoomInfo } from '../../app/types'
import type { LiveRoomRawItem } from './bilibili'
import {
  getLiveRoomList,
  getLiveAreas,
  dedupByRoomid,
  formatCount,
} from './bilibili'

/** 直播房间缓存 Key */
export const LIVE_CACHE_KEY = 'live:rooms:all'

/** 直播分区缓存 Key */
export const LIVE_AREAS_CACHE_KEY = 'live:areas'

/** 默认缓存 TTL（毫秒） */
export const LIVE_CACHE_TTL = 3 * 60 * 1000

/** 分区列表缓存 TTL（毫秒） */
export const LIVE_AREAS_CACHE_TTL = 60 * 60 * 1000

/** 默认每页条数 */
export const DEFAULT_LIVE_PAGE_SIZE = 30

/** 根据 areaId 生成缓存 key */
export function liveAreaCacheKey(areaId?: number): string {
  if (areaId && areaId > 0) return `live:rooms:area:${areaId}`
  return LIVE_CACHE_KEY
}

/** 直播房间数据字典（以 roomid 为 key） */
export type LiveRoomsMap = Record<number, LiveRoomInfo>

/**
 * 将原始直播 API 条目转换为 LiveRoomInfo（格式化 online 数值）
 */
function toLiveRoomInfo(room: LiveRoomRawItem): LiveRoomInfo {
  return {
    title: room.title || '',
    uname: room.uname || '',
    uid: room.uid || 0,
    roomid: room.roomid || 0,
    online: room.online || 0,
    online_formatted: formatCount(room.online || 0),
    cover: room.cover || '',
    face: room.face || '',
    // area_v2_name 和 parent_area_name 不在 getRoomList 的响应中
    // 实际字段是 area_name（子分区名）和 parent_name（一级分区名）
    area_v2_name: room.area_v2_name || room.area_name || '',
    parent_area_name: room.parent_area_name || room.parent_name || '',
    parent_area_id: room.parent_area_id ?? room.parent_id ?? 0,
    link: room.link || `https://live.bilibili.com/${room.roomid}`,
  }
}

/**
 * 对 LiveRoomInfo[] 进行排序、搜索过滤、分区筛选
 *
 * @param list - 直播间列表
 * @param opts.search - 搜索关键词（大小写不敏感，匹配 title / uname）
 * @param opts.areaId - 一级分区 ID（> 0 时过滤）
 * @returns 排序过滤后的列表
 */
export function sortAndFilterLiveRooms(
  list: LiveRoomInfo[],
  opts: { search?: string; areaId?: number } = {},
): LiveRoomInfo[] {
  // 1. 排序：online 降序，相同则 roomid 升序（保证分页稳定）
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

/**
 * 从 B站 API 拉取直播间排行榜数据
 *
 * 拉取 10 页（每页 30 条）共约 300 个直播间，页间 500ms 延迟防风控。
 *
 * @param options.pages - 拉取页数（默认 10）
 * @param options.pageSize - 每页条数（默认 30）
 * @param options.parentAreaId - 一级分区 ID（可选）
 * @returns LiveRoomInfo[] — 合并去重后的直播间列表；空数组表示 B站不可用
 */
export async function fetchLiveRooms(options?: {
  pages?: number
  pageSize?: number
  parentAreaId?: number
}): Promise<LiveRoomInfo[]> {
  const pages = options?.pages ?? 10
  const pageSize = options?.pageSize ?? DEFAULT_LIVE_PAGE_SIZE
  const allRooms: LiveRoomRawItem[] = []

  for (let page = 1; page <= pages; page++) {
    try {
      const rooms = await getLiveRoomList({
        page,
        pageSize,
        parentAreaId: options?.parentAreaId,
      })

      if (rooms.length === 0) {
        // 某一页空了说明已经到底，停止
        break
      }

      allRooms.push(...rooms)

      // 如果这一页返回数量小于 pageSize，说明没有更多数据
      if (rooms.length < pageSize) {
        break
      }

      // 页间延迟防风控
      if (page < pages) {
        await new Promise((resolve) => setTimeout(resolve, 500))
      }
    } catch (err: any) {
      console.warn(`[fetchLiveRooms] 第 ${page} 页请求失败:`, err.message || err)
      // 单页失败不中断
    }
  }

  // 按 roomid 去重
  const deduped = dedupByRoomid(allRooms)

  if (deduped.length === 0) {
    return []
  }

  return deduped.map(toLiveRoomInfo)
}

/**
 * 获取直播分区列表（带服务端缓存）
 *
 * 1. 读缓存（1 小时 TTL）
 * 2. 未命中则调用 B站 API
 * 3. 写入缓存后返回
 */
export async function fetchLiveAreas(): Promise<Array<{ id: number; name: string }>> {
  const cached = await useStorage('cache').getItem<{
    data: Array<{ id: number; name: string }>
    timestamp: number
  }>(LIVE_AREAS_CACHE_KEY)

  if (cached && Date.now() - cached.timestamp < LIVE_AREAS_CACHE_TTL) {
    return cached.data
  }

  const areas = await getLiveAreas()

  if (areas.length > 0) {
    await useStorage('cache').setItem(LIVE_AREAS_CACHE_KEY, {
      data: areas,
      timestamp: Date.now(),
    })
  }

  return areas
}

/**
 * 逐个分区拉取直播间列表，合并去重为全站聚合数据
 *
 * 编排策略（参考 rankingFetcher.fetchAllRankings）：
 * 1. 先拉取全站 4 页 ~100 条（baseline）
 * 2. 遍历全部分区，每区拉取 4 页 ~100 条，页间 500ms 延迟
 * 3. 按 roomid 去重合并为全站聚合
 * 4. 同时返回各分区独立数据用于分区缓存
 *
 * @returns combined — 全站聚合去重列表；perArea — 各分区独立列表；null — B站不可用
 */
export async function fetchAllLiveRooms(): Promise<{
  combined: LiveRoomInfo[]
  perArea: Record<number, LiveRoomInfo[]>
} | null> {
  const combined = new Map<number, LiveRoomInfo>()
  const perArea: Record<number, LiveRoomInfo[]> = {}

  // 1. 获取分区列表
  const areas = await fetchLiveAreas()
  if (areas.length === 0) {
    console.warn('[fetchAllLiveRooms] 无法获取分区列表，回退到仅全站')
  }

  // 2. 全站 baseline
  const allSite = await fetchLiveRooms({ pages: 4 })
  for (const room of allSite) {
    combined.set(room.roomid, room)
  }

  // 3. 逐个分区
  for (let i = 0; i < areas.length; i++) {
    const area = areas[i]

    try {
      const rooms = await fetchLiveRooms({ pages: 4, parentAreaId: area.id })

      if (rooms.length > 0) {
        perArea[area.id] = rooms
        for (const room of rooms) {
          // 全站去重（roomid 相同保留先到的）
          if (!combined.has(room.roomid)) {
            combined.set(room.roomid, room)
          }
        }
      } else {
        console.warn(`[fetchAllLiveRooms] 分区 ${area.name}(${area.id}) 无数据，跳过`)
      }
    } catch (err: any) {
      console.warn(`[fetchAllLiveRooms] 分区 ${area.name}(${area.id}) 请求失败:`, err.message || err)
    }

    // 页间延迟防风控（最后一个分区不需等待）
    if (i < areas.length - 1) {
      await new Promise((r) => setTimeout(r, 500))
    }
  }

  if (combined.size === 0) {
    return null
  }

  return {
    combined: Array.from(combined.values()),
    perArea,
  }
}

/**
 * 从缓存中读取直播房间数据，如果过期则全量拉取
 *
 * @param areaId - 可选，指定分区 ID。传 undefined/0 返回全站数据，传 N 返回分区数据
 * @returns { data: LiveRoomInfo[], timestamp: number } | null
 */
export async function getLiveRoomsData(areaId?: number): Promise<{
  data: LiveRoomInfo[]
  timestamp: number
} | null> {
  const cacheKey = liveAreaCacheKey(areaId)

  // 1. 读对应分区/全站的缓存
  const cached = await useStorage('cache').getItem<{
    data: LiveRoomInfo[]
    timestamp: number
  }>(cacheKey)

  if (cached && Date.now() - cached.timestamp < LIVE_CACHE_TTL) {
    return cached
  }

  // 2. 缓存未命中，全量刷新（逐个分区拉取 + 聚合去重）
  const result = await fetchAllLiveRooms()
  if (result === null) return null

  const timestamp = Date.now()

  // 写全站缓存
  await useStorage('cache').setItem(LIVE_CACHE_KEY, { data: result.combined, timestamp })

  // 写各分区缓存
  for (const [id, rooms] of Object.entries(result.perArea)) {
    await useStorage('cache').setItem(`live:rooms:area:${id}`, { data: rooms, timestamp })
  }

  // 3. 返回请求的分区数据
  if (areaId && areaId > 0 && result.perArea[areaId]) {
    return { data: result.perArea[areaId], timestamp }
  }
  return { data: result.combined, timestamp }
}
