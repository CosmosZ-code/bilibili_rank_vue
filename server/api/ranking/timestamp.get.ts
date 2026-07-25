/**
 * GET /api/ranking/timestamp
 *
 * 仅返回排行榜缓存的毫秒时间戳，不返回数据本体。
 * 用于回顶时快速判断数据是否有更新，避免无意义刷新。
 *
 * Query 参数:
 * - rid: 分区 tid，默认 '0'（全站）
 */
import { rankingCacheKey, isValidRid, DEFAULT_RID } from '../../utils/rankingConstants'

export default defineEventHandler(async (event) => {
  const rawRid = getQuery(event).rid
  const rid = isValidRid(rawRid) ? rawRid : DEFAULT_RID

  const cached = await useStorage('cache').getItem<{ timestamp: number }>(rankingCacheKey(rid))
  return { timestamp: cached?.timestamp ?? 0 }
})
