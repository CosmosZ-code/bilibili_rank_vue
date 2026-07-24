/**
 * GET /api/favorites
 *
 * 获取用户 B站收藏夹列表
 * 需要登录（通过 session_id cookie + auth 中间件注入 bilibiliCookie）
 */
import { fetchBilibiliFavorites } from '../utils/bilibili'

export default defineEventHandler(async (event) => {
  // auth 中间件已注入 event.context.bilibiliCookie
  const cookie = event.context.bilibiliCookie

  if (!cookie) {
    throw createError({
      statusCode: 401,
      message: '未登录 — 请先通过 B站 扫码登录',
    })
  }

  const query = getQuery(event)
  const mediaId = query.media_id ? Number(query.media_id) : undefined
  const page = query.pn ? Number(query.pn) : undefined

  return await fetchBilibiliFavorites(cookie, { mediaId, page })
})
