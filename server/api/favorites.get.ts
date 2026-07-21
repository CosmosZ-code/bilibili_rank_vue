/**
 * GET /api/favorites
 *
 * 获取用户 B站收藏夹列表
 * 需要用户提交 B站 Cookie（通过 POST /api/cookie 存储）
 */
import { decrypt } from '../utils/crypto'
import { fetchBilibiliFavorites } from '../utils/bilibili'

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

  // 4. 解析参数
  const query = getQuery(event)
  const mediaId = query.media_id ? Number(query.media_id) : undefined
  const page = query.pn ? Number(query.pn) : undefined

  // 5. 调 B站 API
  const data = await fetchBilibiliFavorites(bilibiliCookie, { mediaId, page })

  return data
})
