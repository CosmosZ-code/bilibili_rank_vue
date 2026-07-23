/**
 * GET /api/ranking
 *
 * 获取 B站实时在线观看人数排行榜。
 *
 * 数据由后台定时任务（refresh-ranking）每 4 分钟主动刷新到缓存，
 * 本路由直接读取缓存返回，用户几乎无感知延迟。
 * 仅在缓存完全丢失时（如首次启动且预热未完成）才实时拉取。
 */
import type { CacheEntry, VideosDataMap } from '../../app/types'
import { fetchRankingData } from '../utils/rankingFetcher'
import { MOCK_RANKING } from '../utils/mockData'

export default defineEventHandler(async (event) => {
  const cacheKey = 'ranking:latest'
  const cacheTTL = 10 * 60 * 1000 // 10 分钟（后台每 4 分钟刷新，留足余量）

  // 1. 检查缓存
  const cached = await useStorage('cache').getItem<CacheEntry<VideosDataMap>>(cacheKey)

  if (cached && Date.now() - cached.timestamp < cacheTTL) {
    setResponseHeader(event, 'X-Cache', 'HIT')
    setResponseHeader(event, 'X-Data-Timestamp', String(cached.timestamp))
    return cached.data
  }

  // 2. 缓存未命中（极少发生），实时拉取
  const result = await fetchRankingData()

  // B站完全不可用，使用 mock 降级
  if (result === null) {
    setResponseHeader(event, 'X-Cache', 'MOCK')
    setResponseHeader(event, 'X-Data-Source', 'mock')
    setResponseHeader(event, 'X-Data-Timestamp', String(Date.now()))
    return MOCK_RANKING
  }

  const timestamp = Date.now()

  // 3. 写入缓存（即使为空也缓存，避免连续请求都实时拉取）
  await useStorage('cache').setItem(cacheKey, { data: result.data, timestamp })

  setResponseHeader(event, 'X-Cache', 'MISS')
  setResponseHeader(event, 'X-Data-Timestamp', String(timestamp))
  return result.data
})
