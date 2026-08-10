/**
 * POST /api/ranking/personalized-refresh
 *
 * 刷新用户个性化缓存，返回增量视频列表。
 * 需要登录态（通过 auth 中间件注入的 user + bilibiliCookie）。
 *
 * Query 参数：
 * - blacklist: 屏蔽的 UP mid 列表（可选，逗号分隔，增量中同样剔除）
 *
 * 缓存策略由 personalizedCache 服务层统一管理：
 * 缓存新鲜（5 分钟内）时零 B站 请求；过期才重新拉取（防风控）。
 */
import type { VideosDataMap, VideoWithBvid } from '../../app/types'
import { getOrFetchPersonalized } from '../../utils/personalizedCache'

export default defineEventHandler(async (event) => {
  const user = event.context.user
  const cookie = event.context.bilibiliCookie

  // 未登录
  if (!user || !cookie) {
    return { added: [] as VideoWithBvid[] }
  }

  const query = getQuery(event)
  const blacklist = query.blacklist
    ? String(query.blacklist).split(',').map((s) => s.trim()).filter(Boolean)
    : undefined

  // 增量转换：VideosDataMap → VideoWithBvid[]
  // （fetchPersonalizedOnly 已排除全局排行中的 bvid；前端合并时另有 bvid 去重保护）
  function toAdded(data: VideosDataMap): VideoWithBvid[] {
    return Object.entries(data).map(([bvid, info]) => ({ bvid, ...info }))
  }

  // 统一缓存策略：新鲜返回缓存，过期拉取，失败回退旧缓存
  const data = await getOrFetchPersonalized(user, cookie)
  const added = data ? toAdded(data) : []

  // 黑名单过滤：剔除被屏蔽 UP 的增量视频
  const filtered = blacklist?.length
    ? added.filter((v) => !blacklist.includes(v.mid))
    : added

  return { added: filtered }
})

