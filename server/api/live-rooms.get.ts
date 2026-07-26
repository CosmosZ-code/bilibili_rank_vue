/**
 * GET /api/live-rooms
 *
 * 获取 B站直播间排行榜（按在线热度排序，分页）。
 *
 * 数据由 cache-warmer 后台定时刷新到缓存，本路由只读缓存。
 * 缓存过期 → 返回旧数据（X-Cache: STALE），不阻塞。
 * 缓存不存在 → 返回空数据（X-Cache: EMPTY），等待 cache warmer 首次预热。
 *
 * Query 参数：
 * - page: 页码（默认 1）
 * - pageSize: 每页条数（默认 30）
 * - search: 搜索关键词（可选，匹配 title/uname）
 * - areaId: 一级分区 ID（可选，> 0 时过滤）
 */
import type { CacheEntry, LiveRoomInfo, LiveRankingResponse } from '../../app/types'
import { sortAndFilterLiveRooms, liveAreaCacheKey } from '../utils/liveRoomFetcher'
import { DEFAULT_LIVE_PAGE_SIZE } from '../utils/liveRoomFetcher'

export default defineEventHandler(async (event) => {
  const query = getQuery(event)
  const page = Math.max(1, parseInt(String(query.page || '1'), 10) || 1)
  const pageSize = Math.min(100, Math.max(1, parseInt(String(query.pageSize || String(DEFAULT_LIVE_PAGE_SIZE)), 10) || DEFAULT_LIVE_PAGE_SIZE))
  const search = query.search ? String(query.search) : undefined
  const areaId = query.areaId ? Number(query.areaId) : undefined

  const cacheTTL = 3 * 60 * 1000

  // 1. 读取对应分区/全站的缓存
  const cacheKey = liveAreaCacheKey(areaId)
  const cached = await useStorage('cache').getItem<CacheEntry<LiveRoomInfo[]>>(cacheKey)

  let roomList: LiveRoomInfo[]
  let timestamp: number

  if (cached && Date.now() - cached.timestamp < cacheTTL) {
    setResponseHeader(event, 'X-Cache', 'HIT')
    roomList = cached.data
    timestamp = cached.timestamp
  } else if (cached) {
    // 缓存过期 → 返回旧数据，由 cache warmer 负责刷新（不阻塞）
    setResponseHeader(event, 'X-Cache', 'STALE')
    roomList = cached.data
    timestamp = cached.timestamp
  } else {
    // 缓存不存在 → 返回空数据，等待 cache warmer 首次预热
    setResponseHeader(event, 'X-Cache', 'EMPTY')
    const now = Date.now()
    setResponseHeader(event, 'X-Data-Timestamp', String(now))
    return {
      items: [],
      total: 0,
      page,
      pageSize,
      hasMore: false,
      timestamp: now,
    } satisfies LiveRankingResponse
  }

  // 3. 排序 + 过滤
  const filtered = sortAndFilterLiveRooms(roomList, { search, areaId })
  const total = filtered.length

  // 4. 分页切片
  const start = (page - 1) * pageSize
  const items = filtered.slice(start, start + pageSize)

  setResponseHeader(event, 'X-Data-Timestamp', String(timestamp))

  return {
    items,
    total,
    page,
    pageSize,
    hasMore: total > page * pageSize,
    timestamp,
  } satisfies LiveRankingResponse
})
