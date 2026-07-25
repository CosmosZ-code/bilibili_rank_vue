/**
 * GET /api/live-areas
 *
 * 获取 B站直播一级分区列表（带服务端缓存）。
 * 数据来源于 room/v2/Index/getNavigate 公开接口。
 *
 * 返回：{ areas: Array<{ id: number, name: string }> }
 */
import { LIVE_AREAS_CACHE_KEY, LIVE_AREAS_CACHE_TTL } from '../utils/liveRoomFetcher'
import { getLiveAreas } from '../utils/bilibili'

export default defineEventHandler(async (event) => {
  // 1. 读缓存
  const cached = await useStorage('cache').getItem<{
    data: Array<{ id: number; name: string }>
    timestamp: number
  }>(LIVE_AREAS_CACHE_KEY)

  if (cached && Date.now() - cached.timestamp < LIVE_AREAS_CACHE_TTL) {
    setResponseHeader(event, 'X-Cache', 'HIT')
    return { areas: cached.data }
  }

  // 2. 实时获取
  const areas = await getLiveAreas()

  if (areas.length > 0) {
    await useStorage('cache').setItem(LIVE_AREAS_CACHE_KEY, {
      data: areas,
      timestamp: Date.now(),
    })
  }

  setResponseHeader(event, 'X-Cache', areas.length > 0 ? 'MISS' : 'MOCK')

  return { areas }
})
