/**
 * GET /api/ranking/timestamp
 *
 * 仅返回排行榜缓存的毫秒时间戳，不返回数据本体。
 * 用于回顶时快速判断数据是否有更新，避免无意义刷新。
 */
export default defineEventHandler(async () => {
  const cached = await useStorage('cache').getItem<{ timestamp: number }>('ranking:latest')
  return { timestamp: cached?.timestamp ?? 0 }
})
