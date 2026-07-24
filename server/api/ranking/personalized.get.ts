/**
 * GET /api/ranking/personalized
 *
 * 返回用户个性化的增量热门视频（不在全局排行中的新增部分）。
 * 需要登录态，通过 auth 中间件注入的 bilibiliCookie 调用 B站 popular。
 *
 * 缓存策略：personalized:{uid}，TTL 10 分钟
 */
import { fetchPersonalizedOnly } from '../../utils/rankingFetcher'

export default defineEventHandler(async (event) => {
  const cookie = event.context.bilibiliCookie
  const user = event.context.user

  if (!cookie || !user) {
    return {}
  }

  const cacheKey = `personalized:${user.id}`
  const cacheTTL = 10 * 60 * 1000 // 10 分钟

  // 检查缓存
  const cached = await useStorage('cache').getItem<{
    data: Record<string, any>
    timestamp: number
  }>(cacheKey)

  if (cached && Date.now() - cached.timestamp < cacheTTL) {
    return cached.data
  }

  // 拉取增量
  const data = await fetchPersonalizedOnly(cookie)

  if (data) {
    await useStorage('cache').setItem(cacheKey, { data, timestamp: Date.now() })
    return data
  }

  // 拉取失败，返回空（不覆盖旧缓存）
  return cached?.data || {}
})
