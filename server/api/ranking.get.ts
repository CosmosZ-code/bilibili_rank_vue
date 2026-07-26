/**
 * GET /api/ranking
 *
 * 获取 B站实时在线观看人数排行榜（分页）。
 *
 * 数据由 cache-warmer 后台定时刷新到缓存，本路由只读缓存。
 * 缓存过期 → 返回旧数据（X-Cache: STALE），不阻塞。
 * 缓存不存在 → 返回空数据（X-Cache: EMPTY），等待 cache warmer 首次预热。
 *
 * Query 参数：
 * - page: 页码（默认 1）
 * - pageSize: 每页条数（默认 30）
 * - sortBy: 排序方式（默认 'count'）
 * - search: 搜索关键词（可选，匹配 title/owner）
 * - purifyPercent: 净化阈值（可选，默认 0）
 */
import type { CacheEntry, VideosDataMap, RankingResponse } from '../../app/types'
import { sortAndFilterRanking } from '../utils/rankingFetcher'
import { COMBINED_CACHE_KEY, DEFAULT_PAGE_SIZE, DEFAULT_SORT_BY } from '../utils/rankingConstants'

export default defineEventHandler(async (event) => {
  const query = getQuery(event)
  const page = Math.max(1, parseInt(String(query.page || '1'), 10) || 1)
  const pageSize = Math.min(100, Math.max(1, parseInt(String(query.pageSize || String(DEFAULT_PAGE_SIZE)), 10) || DEFAULT_PAGE_SIZE))
  const sortBy = String(query.sortBy || DEFAULT_SORT_BY)
  const search = query.search ? String(query.search) : undefined
  const purifyPercent = query.purifyPercent !== undefined ? Number(query.purifyPercent) : undefined

  const cacheKey = COMBINED_CACHE_KEY
  const cacheTTL = 10 * 60 * 1000

  // 1. 读取缓存
  const cached = await useStorage('cache').getItem<CacheEntry<VideosDataMap>>(cacheKey)

  let dataMap: VideosDataMap

  if (cached && Date.now() - cached.timestamp < cacheTTL) {
    setResponseHeader(event, 'X-Cache', 'HIT')
    dataMap = cached.data
  } else if (cached) {
    // 缓存过期 → 返回旧数据，由 cache warmer 负责刷新（不阻塞）
    setResponseHeader(event, 'X-Cache', 'STALE')
    dataMap = cached.data
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
    } satisfies RankingResponse
  }

  // 3. 合并个性化数据（已登录用户）
  try {
    const session = await useSession<UserSession>(event)
    if (session?.data?.bilibiliUid) {
      const personalCache = await useStorage('cache').getItem<CacheEntry<VideosDataMap>>(
        `personalized:${session.data.bilibiliUid}`,
      )
      if (personalCache?.data && Date.now() - personalCache.timestamp < cacheTTL) {
        // 合并个性化数据（不覆盖全局已有的 BVid）
        for (const [bvid, info] of Object.entries(personalCache.data)) {
          if (!dataMap[bvid]) {
            dataMap[bvid] = info
          }
        }
      }
    }
  } catch {
    // 个性化合并失败静默，不影响主流程
  }

  // 4. 排序 + 过滤
  const filtered = sortAndFilterRanking(dataMap, { sortBy, search, purifyPercent })
  const total = filtered.length

  // 5. 分页切片
  const start = (page - 1) * pageSize
  const items = filtered.slice(start, start + pageSize)

  const timestamp = cached?.timestamp ?? Date.now()
  setResponseHeader(event, 'X-Data-Timestamp', String(timestamp))

  return {
    items,
    total,
    page,
    pageSize,
    hasMore: total > page * pageSize,
    timestamp,
  } satisfies RankingResponse
})
