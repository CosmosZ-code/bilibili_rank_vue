/**
 * GET /api/history
 *
 * 获取用户 B站观看历史
 * 需要用户提交 B站 Cookie（通过 POST /api/cookie 存储）
 */
import { decrypt } from '../utils/crypto'
import { fetchBilibiliHistory } from '../utils/bilibili'

export default defineEventHandler(async (event) => {
  // 1. 读取 session_id
  const sessionId = getCookie(event, 'session_id')
  if (!sessionId) {
    throw createError({
      statusCode: 401,
      statusMessage: '未登录 — 请先设置 B站 Cookie',
    })
  }

  // 2. 读取加密的 B站 Cookie
  const encrypted = await useStorage('bilibili').getItem<string>(
    `user:${sessionId}:cookie`,
  )
  if (!encrypted) {
    throw createError({
      statusCode: 401,
      statusMessage: '未找到 B站 Cookie — 请先设置',
    })
  }

  // 3. 解密 Cookie
  const config = useRuntimeConfig()
  const bilibiliCookie = decrypt(encrypted, config.encryptKey)

  // 4. 解析分页参数
  const query = getQuery(event)
  const max = query.max ? Number(query.max) : undefined
  const viewAt = query.view_at ? Number(query.view_at) : undefined

  // 5. 调 B站 API
  const data = await fetchBilibiliHistory(bilibiliCookie, { max, viewAt })

  return data
})
