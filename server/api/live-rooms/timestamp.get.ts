/**
 * GET /api/live-rooms/timestamp
 *
 * 仅返回直播排行榜缓存的毫秒时间戳，不返回数据本体。
 * 用于回顶时快速判断数据是否有更新。
 * 支持 areaId 参数获取对应分区的时间戳。
 */
import { liveAreaCacheKey } from '../../utils/liveRoomFetcher'

export default defineEventHandler(async (event) => {
  const query = getQuery(event)
  const areaId = query.areaId ? Number(query.areaId) : undefined
  const cacheKey = liveAreaCacheKey(areaId)
  const cached = await useStorage('cache').getItem<{ timestamp: number }>(cacheKey)
  return { timestamp: cached?.timestamp ?? 0 }
})
