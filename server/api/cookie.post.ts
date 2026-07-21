/**
 * POST /api/cookie
 *
 * 接收并加密存储用户的 B站 Cookie
 * 返回一个 session_id（通过 Set-Cookie 响应头）供后续 API 使用
 */
import { encrypt } from '../utils/crypto'

export default defineEventHandler(async (event) => {
  // 1. 读取请求体
  const body = await readBody(event)

  if (!body || !body.cookie || typeof body.cookie !== 'string') {
    throw createError({
      statusCode: 400,
      statusMessage: '缺少 cookie 字段，请求体格式: { "cookie": "..." }',
    })
  }

  const { cookie } = body

  // 2. 生成或读取 session_id
  let sessionId = getCookie(event, 'session_id')

  if (!sessionId) {
    // 使用 crypto.randomUUID() 生成新 session
    sessionId = crypto.randomUUID()
    setCookie(event, 'session_id', sessionId, {
      httpOnly: true,
      secure: true,
      sameSite: 'lax',
      maxAge: 60 * 60 * 24 * 30, // 30 天
      path: '/',
    })
  }

  // 3. 加密存储
  const config = useRuntimeConfig()
  const encrypted = encrypt(cookie, config.encryptKey)

  await useStorage('bilibili').setItem(`user:${sessionId}:cookie`, encrypted)

  return { ok: true }
})
