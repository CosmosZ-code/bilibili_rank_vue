/**
 * GET /api/history
 *
 * 获取用户 B站观看历史
 * 需要登录（通过 session_id cookie + auth 中间件注入 bilibiliCookie）
 */
import { fetchBilibiliHistory } from '../utils/bilibili'

export default defineEventHandler(async (event) => {
  // auth 中间件已注入 event.context.bilibiliCookie
  const cookie = event.context.bilibiliCookie

  if (!cookie) {
    throw createError({
      statusCode: 401,
      statusMessage: '未登录 — 请先通过 B站 扫码登录',
    })
  }

  // 解析分页参数
  const query = getQuery(event)
  const max = query.max ? Number(query.max) : undefined
  const viewAt = query.view_at ? Number(query.view_at) : undefined

  return await fetchBilibiliHistory(cookie, { max, viewAt })
})
