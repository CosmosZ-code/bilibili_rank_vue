/**
 * POST /api/auth/logout
 *
 * 退出登录：清除 session
 */
import { removeSession } from '../../utils/auth'

export default defineEventHandler(async (event) => {
  const sessionId = getCookie(event, 'session_id')

  if (sessionId) {
    await removeSession(sessionId)
  }

  // 清除 cookie
  deleteCookie(event, 'session_id', {
    httpOnly: true,
    secure: true,
    sameSite: 'lax',
    path: '/',
  })

  return { ok: true }
})
