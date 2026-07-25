/**
 * GET /api/live-rooms
 *
 * 获取 B站直播间排行榜（按在线热度排序，分页）。
 *
 * 数据由 liveRoomFetcher 从 B站公开 API 拉取并缓存，
 * 本路由读取缓存后执行排序→过滤→分页。
 *
 * Query 参数：
 * - page: 页码（默认 1）
 * - pageSize: 每页条数（默认 30）
 * - search: 搜索关键词（可选，匹配 title/uname）
 * - areaId: 一级分区 ID（可选，> 0 时过滤）
 */
import type { CacheEntry, LiveRoomInfo, LiveRankingResponse } from '../../app/types'
import { LIVE_CACHE_KEY, sortAndFilterLiveRooms, getLiveRoomsData, liveAreaCacheKey } from '../utils/liveRoomFetcher'
import { MOCK_LIVE_ROOMS_MAP } from '../utils/mockData'
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
  } else {
    // 2. 缓存未命中，实时拉取（areaId 传给 getLiveRoomsData 决定读/写哪个缓存）
    const result = await getLiveRoomsData(areaId)

    if (result === null) {
      // B站完全不可用，使用 mock 降级
      setResponseHeader(event, 'X-Cache', 'MOCK')
      setResponseHeader(event, 'X-Data-Source', 'mock')
      const now = Date.now()
      setResponseHeader(event, 'X-Data-Timestamp', String(now))
      const mockRooms = Object.values(MOCK_LIVE_ROOMS_MAP)
      const filtered = sortAndFilterLiveRooms(mockRooms, { search, areaId })
      const start = (page - 1) * pageSize
      const slice = filtered.slice(start, start + pageSize)
      return {
        items: slice,
        total: filtered.length,
        page,
        pageSize,
        hasMore: filtered.length > page * pageSize,
        timestamp: now,
      } satisfies LiveRankingResponse
    }

    setResponseHeader(event, 'X-Cache', 'MISS')
    roomList = result.data
    timestamp = result.timestamp
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
