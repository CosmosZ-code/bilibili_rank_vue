/**
 * GET /api/ranking/personalized
 *
 * 返回用户个性化的增量热门视频（不在全局排行中的新增部分）。
 * 需要登录态，通过 auth 中间件注入的 bilibiliCookie 调用 B站 popular。
 *
 * 缓存策略：缓存新鲜（5 分钟内）时零 B站 请求，直接返回缓存数据；
 * 过期才重新拉取（防风控）。拉取失败时返回旧缓存（不覆盖）。
 */
import { getOrFetchPersonalized } from '../../utils/personalizedCache'

export default defineEventHandler(async (event) => {
  const cookie = event.context.bilibiliCookie
  const user = event.context.user

  if (!cookie || !user) {
    return {}
  }

  // 统一缓存策略：新鲜返回缓存，过期拉取，失败回退旧缓存
  const data = await getOrFetchPersonalized(user, cookie)

  return data || {}
})
