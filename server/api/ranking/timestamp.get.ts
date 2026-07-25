/**
 * GET /api/ranking/timestamp
 *
 * 仅返回全分区排行榜缓存的毫秒时间戳，不返回数据本体。
 * 用于回顶时快速判断数据是否有更新，避免无意义刷新。
 */
import { COMBINED_CACHE_KEY } from '../../utils/rankingConstants'

export default defineEventHandler(async (event) => {
  const cached = await useStorage('cache').getItem<{ timestamp: number }>(COMBINED_CACHE_KEY)
  return { timestamp: cached?.timestamp ?? 0 }
})
